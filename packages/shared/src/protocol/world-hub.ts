import type { WorldConfig, WorldState } from "../types/world.js";
import type { SpriteAsset } from "../types/hub.js";

// World → Hub messages

export interface WorldHandshakeMessage {
  type: "handshake";
  apiKey: string;
  world: {
    name: string;
    id?: string;
    description?: string;
    config: Partial<WorldConfig>;
  };
  sprites: SpriteAsset[];
  thumbnail?: SpriteAsset;
}

export interface WorldStateUpdateMessage {
  type: "state_update";
  state: WorldState;
}

export interface WorldPingMessage {
  type: "ping";
  timestamp: number;
}

// Hub → World messages

export interface HubHandshakeAckMessage {
  type: "handshake_ack";
  worldId: string;
  status: "ok" | "error";
  error?: string;
}

export interface HubPongMessage {
  type: "pong";
  timestamp: number;
}

export interface HubErrorMessage {
  type: "error";
  code: string;
  message: string;
}

// MCP tunnel messages (Hub → World)

/** Forward a JSON-RPC message from an MCP client to the world's tunnel session. */
export interface HubMcpTunnelMessage {
  type: "mcp_tunnel_message";
  sessionId: string;
  message: unknown; // JSONRPCMessage
}

/** Tell the world to close a tunnel session (MCP client disconnected). */
export interface HubMcpTunnelClose {
  type: "mcp_tunnel_close";
  sessionId: string;
}

// MCP tunnel messages (World → Hub)

/** Forward a JSON-RPC response or notification from the world back to the hub. */
export interface WorldMcpTunnelResponse {
  type: "mcp_tunnel_response";
  sessionId: string;
  message: unknown; // JSONRPCMessage
}

// Union types

export type WorldToHubMessage =
  | WorldHandshakeMessage
  | WorldStateUpdateMessage
  | WorldPingMessage
  | WorldMcpTunnelResponse;

export type HubToWorldMessage =
  | HubHandshakeAckMessage
  | HubPongMessage
  | HubErrorMessage
  | HubMcpTunnelMessage
  | HubMcpTunnelClose;
