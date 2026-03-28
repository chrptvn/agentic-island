import type { IslandConfig, IslandState } from "../types/island.js";
import type { SpriteAsset } from "../types/hub.js";

// Island → Hub messages

export interface IslandHandshakeMessage {
  type: "handshake";
  apiKey: string;
  island: {
    name: string;
    id?: string;
    description?: string;
    config: Partial<IslandConfig>;
  };
  sprites: SpriteAsset[];
  thumbnail?: SpriteAsset;
}

export interface IslandStateUpdateMessage {
  type: "state_update";
  state: IslandState;
}

export interface IslandPingMessage {
  type: "ping";
  timestamp: number;
}

// Hub → Island messages

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

// MCP tunnel messages (Hub → Island)

/** Forward a JSON-RPC message from an MCP client to the island's tunnel session. */
export interface HubMcpTunnelMessage {
  type: "mcp_tunnel_message";
  sessionId: string;
  message: unknown; // JSONRPCMessage
}

/** Tell the island to close a tunnel session (MCP client disconnected). */
export interface HubMcpTunnelClose {
  type: "mcp_tunnel_close";
  sessionId: string;
}

// MCP tunnel messages (Island → Hub)

/** Forward a JSON-RPC response or notification from the island back to the hub. */
export interface IslandMcpTunnelResponse {
  type: "mcp_tunnel_response";
  sessionId: string;
  message: unknown; // JSONRPCMessage
}

// Union types

export type IslandToHubMessage =
  | IslandHandshakeMessage
  | IslandStateUpdateMessage
  | IslandPingMessage
  | IslandMcpTunnelResponse;

export type HubToIslandMessage =
  | HubHandshakeAckMessage
  | HubPongMessage
  | HubErrorMessage
  | HubMcpTunnelMessage
  | HubMcpTunnelClose;
