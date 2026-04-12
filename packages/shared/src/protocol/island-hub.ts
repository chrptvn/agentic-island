import type { IslandConfig, IslandState } from "../types/island.js";
import type { SpriteAsset } from "../types/hub.js";
import type { CharacterAppearance } from "../types/character.js";
import type { CharacterCatalog } from "../types/passport.js";
import type { StateDelta } from "../delta.js";

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
  islandId: string;
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
  /** Passport key from the Bearer token — included on the first (initialize) message only. */
  passportKey?: string;
}

/** Tell the island to close a tunnel session (MCP client disconnected). */
export interface HubMcpTunnelClose {
  type: "mcp_tunnel_close";
  sessionId: string;
}

/** Viewer requested a full state resync (hash mismatch). Hub forwards to island. */
export interface HubResyncRequest {
  type: "resync_request";
  /** Viewer that requested the resync (opaque, for routing the response). */
  viewerTag?: string;
}

// MCP tunnel messages (Island → Hub)

/** Forward a JSON-RPC response or notification from the island back to the hub. */
export interface IslandMcpTunnelResponse {
  type: "mcp_tunnel_response";
  sessionId: string;
  message: unknown; // JSONRPCMessage
}

/** Notify the hub that a tunnel session was closed from the island side (e.g. idle timeout). */
export interface IslandMcpTunnelSessionClosed {
  type: "mcp_tunnel_session_closed";
  sessionId: string;
}

export interface IslandSpriteUpdateMessage {
  type: "sprite_update";
  sprites: SpriteAsset[];
}

export interface IslandCharacterUpdateMessage {
  type: "character_update";
  characters: import("../types/character.js").CharacterState[];
}

export interface IslandStateDeltaMessage {
  type: "state_delta";
  delta: StateDelta;
}

// Passport messages (Hub → Island)

/** Request the island to create, update, or return catalog info for a passport. */
export interface HubPassportRequest {
  type: "passport_request";
  requestId: string;
  action: "create" | "update" | "get_catalog";
  email?: string;
  name?: string;
  appearance?: CharacterAppearance;
}

// Passport messages (Island → Hub)

/** Island's response to a passport request. */
export interface IslandPassportResponse {
  type: "passport_response";
  requestId: string;
  success: boolean;
  /** Raw passport key (plaintext) — only returned on create. */
  rawKey?: string;
  /** Masked email for display (e.g. "u***@example.com"). */
  maskedEmail?: string;
  error?: string;
  /** Character catalog — only returned for get_catalog action. */
  catalog?: CharacterCatalog;
}

// Union types

export type IslandToHubMessage =
  | IslandHandshakeMessage
  | IslandStateUpdateMessage
  | IslandPingMessage
  | IslandSpriteUpdateMessage
  | IslandCharacterUpdateMessage
  | IslandStateDeltaMessage
  | IslandMcpTunnelResponse
  | IslandMcpTunnelSessionClosed
  | IslandPassportResponse;

export type HubToIslandMessage =
  | HubHandshakeAckMessage
  | HubPongMessage
  | HubErrorMessage
  | HubMcpTunnelMessage
  | HubMcpTunnelClose
  | HubResyncRequest
  | HubPassportRequest;
