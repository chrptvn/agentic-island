import WebSocket from "ws";
import type {
  CoreToHubMessage,
  HubToCoreMessage,
  SpriteAsset,
  WorldState,
} from "@agentic-island/shared";
import {
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  HEARTBEAT_INTERVAL_MS,
} from "@agentic-island/shared";

export interface HubConnectorOptions {
  hubUrl: string;
  apiKey: string;
  worldName: string;
  worldId?: string;
  worldDescription?: string;
}

export type SpritePayload = SpriteAsset;

const PREFIX = "[hub-connector]";

export class HubConnector {
  private ws: WebSocket | null = null;
  private options: HubConnectorOptions;
  private reconnectDelay: number;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private worldId: string | null = null;
  private connected = false;
  private destroyed = false;

  onConnected?: (worldId: string) => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;

  constructor(options: HubConnectorOptions) {
    this.options = options;
    this.reconnectDelay = WS_RECONNECT_BASE_MS;
    if (options.worldId) {
      this.worldId = options.worldId;
    }
  }

  connect(
    sprites: SpritePayload[],
    worldConfig: Record<string, unknown>,
  ): void {
    if (this.destroyed) {
      console.warn(PREFIX, "Cannot connect — connector has been destroyed");
      return;
    }
    this.attemptConnect(sprites, worldConfig);
  }

  sendStateUpdate(state: WorldState): void {
    if (!this.connected || !this.ws) {
      return;
    }
    const msg: CoreToHubMessage = { type: "state_update", state };
    this.ws.send(JSON.stringify(msg));
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, "client disconnect");
      }
      this.ws = null;
    }
    if (this.connected) {
      this.connected = false;
      console.log(PREFIX, "Disconnected");
      this.onDisconnected?.();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    console.log(PREFIX, "Destroyed — no further reconnection attempts");
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get assignedWorldId(): string | null {
    return this.worldId;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private attemptConnect(
    sprites: SpritePayload[],
    worldConfig: Record<string, unknown>,
  ): void {
    if (this.destroyed) return;

    console.log(PREFIX, `Connecting to ${this.options.hubUrl}…`);

    const ws = new WebSocket(this.options.hubUrl);
    this.ws = ws;

    ws.on("open", () => {
      console.log(PREFIX, "WebSocket open — sending handshake");
      const handshake: CoreToHubMessage = {
        type: "handshake",
        apiKey: this.options.apiKey,
        world: {
          name: this.options.worldName,
          id: this.options.worldId,
          description: this.options.worldDescription,
          config: worldConfig,
        },
        sprites,
      };
      ws.send(JSON.stringify(handshake));
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let msg: HubToCoreMessage;
      try {
        msg = JSON.parse(raw.toString()) as HubToCoreMessage;
      } catch {
        console.error(PREFIX, "Failed to parse message from hub");
        return;
      }

      switch (msg.type) {
        case "handshake_ack":
          if (msg.status === "ok") {
            this.worldId = msg.worldId;
            this.connected = true;
            this.reconnectDelay = WS_RECONNECT_BASE_MS;
            this.startHeartbeat();
            console.log(PREFIX, `Connected — worldId=${msg.worldId}`);
            this.onConnected?.(msg.worldId);
          } else {
            console.error(
              PREFIX,
              `Handshake rejected: ${msg.error ?? "unknown error"}`,
            );
            ws.close(4001, "handshake rejected");
          }
          break;

        case "pong":
          // Heartbeat acknowledged
          break;

        case "error":
          console.error(PREFIX, `Hub error [${msg.code}]: ${msg.message}`);
          this.onError?.(new Error(`[${msg.code}] ${msg.message}`));
          break;
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      console.log(
        PREFIX,
        `Connection closed (code=${code}, reason=${reason.toString() || "none"})`,
      );
      this.stopHeartbeat();
      const wasConnected = this.connected;
      this.connected = false;
      this.ws = null;
      if (wasConnected) {
        this.onDisconnected?.();
      }
      this.scheduleReconnect(sprites, worldConfig);
    });

    ws.on("error", (err: Error) => {
      console.error(PREFIX, `WebSocket error: ${err.message}`);
      this.onError?.(err);
      // The 'close' event will fire after this, triggering reconnect
    });
  }

  private scheduleReconnect(
    sprites: SpritePayload[],
    worldConfig: Record<string, unknown>,
  ): void {
    if (this.destroyed) return;

    console.log(
      PREFIX,
      `Reconnecting in ${this.reconnectDelay}ms…`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.attemptConnect(sprites, worldConfig);
    }, this.reconnectDelay);

    // Exponential backoff with jitter
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2 + Math.random() * 500,
      WS_RECONNECT_MAX_MS,
    );
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const msg: CoreToHubMessage = {
          type: "ping",
          timestamp: Date.now(),
        };
        this.ws.send(JSON.stringify(msg));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
