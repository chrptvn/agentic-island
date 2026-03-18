import type { WorldConfig, WorldState } from "../types/world.js";
import type { SpriteAsset } from "../types/hub.js";

// Core → Hub messages

export interface CoreHandshakeMessage {
  type: "handshake";
  apiKey: string;
  world: {
    name: string;
    id?: string;
    description?: string;
    config: Partial<WorldConfig>;
  };
  sprites: SpriteAsset[];
}

export interface CoreStateUpdateMessage {
  type: "state_update";
  state: WorldState;
}

export interface CorePingMessage {
  type: "ping";
  timestamp: number;
}

// Hub → Core messages

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

// Union types

export type CoreToHubMessage =
  | CoreHandshakeMessage
  | CoreStateUpdateMessage
  | CorePingMessage;

export type HubToCoreMessage =
  | HubHandshakeAckMessage
  | HubPongMessage
  | HubErrorMessage;
