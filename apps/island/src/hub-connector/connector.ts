import WebSocket from "ws";
import type {
  IslandToHubMessage,
  HubToIslandMessage,
  SpriteAsset,
  IslandState,
} from "@agentic-island/shared";
import {
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  HEARTBEAT_INTERVAL_MS,
} from "@agentic-island/shared";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { handleTunnelMessage, closeTunnelSession, closeAllTunnelSessions } from "../mcp/tunnel-sessions.js";

export interface HubConnectorOptions {
  hubUrl: string;
  apiKey: string;
  islandName: string;
  islandId?: string;
  islandDescription?: string;
  secured?: boolean;
}

export type SpritePayload = SpriteAsset;

const PREFIX = "[hub-connector]";

export class HubConnector {
  private ws: WebSocket | null = null;
  private options: HubConnectorOptions;
  private reconnectDelay: number;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private islandId: string | null = null;
  private connected = false;
  private destroyed = false;

  onConnected?: (islandId: string, accessKey?: string) => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;

  constructor(options: HubConnectorOptions) {
    this.options = options;
    this.reconnectDelay = WS_RECONNECT_BASE_MS;
    if (options.islandId) {
      this.islandId = options.islandId;
    }
  }

  connect(
    sprites: SpritePayload[],
    islandConfig: Record<string, unknown>,
    thumbnail?: SpritePayload,
  ): void {
    if (this.destroyed) {
      console.warn(PREFIX, "Cannot connect — connector has been destroyed");
      return;
    }
    this.attemptConnect(sprites, islandConfig, thumbnail);
  }

  sendStateUpdate(state: IslandState): void {
    if (!this.connected || !this.ws) {
      return;
    }
    const msg: IslandToHubMessage = { type: "state_update", state };
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

  get assignedIslandId(): string | null {
    return this.islandId;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private attemptConnect(
    sprites: SpritePayload[],
    islandConfig: Record<string, unknown>,
    thumbnail?: SpritePayload,
  ): void {
    if (this.destroyed) return;

    console.log(PREFIX, `Connecting to ${this.options.hubUrl}…`);

    const ws = new WebSocket(this.options.hubUrl);
    this.ws = ws;

    ws.on("open", () => {
      console.log(PREFIX, "WebSocket open — sending handshake");
      const handshake: IslandToHubMessage = {
        type: "handshake",
        apiKey: this.options.apiKey,
        island: {
          name: this.options.islandName,
          id: this.options.islandId,
          description: this.options.islandDescription,
          config: islandConfig,
          secured: this.options.secured,
        },
        sprites,
        ...(thumbnail ? { thumbnail } : {}),
      };
      ws.send(JSON.stringify(handshake));
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let msg: HubToIslandMessage;
      try {
        msg = JSON.parse(raw.toString()) as HubToIslandMessage;
      } catch {
        console.error(PREFIX, "Failed to parse message from hub");
        return;
      }

      switch (msg.type) {
        case "handshake_ack":
          if (msg.status === "ok") {
            this.islandId = msg.islandId;
            // Persist assigned ID so reconnects reuse the same island entry
            this.options.islandId = msg.islandId;
            this.connected = true;
            this.reconnectDelay = WS_RECONNECT_BASE_MS;
            this.startHeartbeat();
            console.log(PREFIX, `Connected — islandId=${msg.islandId}`);
            this.onConnected?.(msg.islandId, msg.accessKey);
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

        case "mcp_tunnel_message":
          handleTunnelMessage(
            msg.sessionId,
            msg.message,
            (sid, rpcMsg) => this.sendTunnelResponse(sid, rpcMsg),
          );
          break;

        case "mcp_tunnel_close":
          closeTunnelSession(msg.sessionId);
          break;
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      console.log(
        PREFIX,
        `Connection closed (code=${code}, reason=${reason.toString() || "none"})`,
      );
      this.stopHeartbeat();
      closeAllTunnelSessions();
      const wasConnected = this.connected;
      this.connected = false;
      this.ws = null;
      if (wasConnected) {
        this.onDisconnected?.();
      }

      // 4002 = replaced by another connection for the same islandId; don't reconnect
      if (code === 4002) {
        console.log(PREFIX, "Replaced by newer connection — not reconnecting.");
        return;
      }
      this.scheduleReconnect(sprites, islandConfig, thumbnail);
    });

    ws.on("error", (err: Error) => {
      console.error(PREFIX, `WebSocket error: ${err.message}`);
      this.onError?.(err);
      // The 'close' event will fire after this, triggering reconnect
    });
  }

  private scheduleReconnect(
    sprites: SpritePayload[],
    islandConfig: Record<string, unknown>,
    thumbnail?: SpritePayload,
  ): void {
    if (this.destroyed) return;

    console.log(
      PREFIX,
      `Reconnecting in ${this.reconnectDelay}ms…`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.attemptConnect(sprites, islandConfig, thumbnail);
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
        const msg: IslandToHubMessage = {
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

  /** Send a tunnel response (JSON-RPC message) back to the hub for an MCP proxy session. */
  private sendTunnelResponse(sessionId: string, message: JSONRPCMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: IslandToHubMessage = {
      type: "mcp_tunnel_response",
      sessionId,
      message,
    };
    this.ws.send(JSON.stringify(msg));
  }
}
