import type { WorldState } from "../types/world.js";
import type { WorldMeta } from "../types/hub.js";

// Viewer → Hub messages

export interface ViewerSubscribeMessage {
  type: "subscribe";
  worldId: string;
}

export interface ViewerUnsubscribeMessage {
  type: "unsubscribe";
  worldId: string;
}

// Hub → Viewer messages

export interface ViewerWorldStateMessage {
  type: "world_state";
  worldId: string;
  state: WorldState;
  spriteBaseUrl: string;
}

export interface ViewerWorldOfflineMessage {
  type: "world_offline";
  worldId: string;
}

export interface ViewerWorldListMessage {
  type: "world_list";
  worlds: WorldMeta[];
}

export interface ViewerErrorMessage {
  type: "error";
  code: string;
  message: string;
}

// Union types

export type ViewerToHubMessage =
  | ViewerSubscribeMessage
  | ViewerUnsubscribeMessage;

export type HubToViewerMessage =
  | ViewerWorldStateMessage
  | ViewerWorldOfflineMessage
  | ViewerWorldListMessage
  | ViewerErrorMessage;
