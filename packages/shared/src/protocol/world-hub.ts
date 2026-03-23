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

// Union types

export type WorldToHubMessage =
  | WorldHandshakeMessage
  | WorldStateUpdateMessage
  | WorldPingMessage;

export type HubToWorldMessage =
  | HubHandshakeAckMessage
  | HubPongMessage
  | HubErrorMessage;
