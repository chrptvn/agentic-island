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

export interface ViewerSubscribeLobbyMessage {
  type: "subscribe_lobby";
}

export interface ViewerUnsubscribeLobbyMessage {
  type: "unsubscribe_lobby";
}

// Hub → Viewer messages

export interface ViewerWorldStateMessage {
  type: "world_state";
  worldId: string;
  worldName: string;
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

export interface ViewerWorldMetaUpdateMessage {
  type: "world_meta_update";
  world: WorldMeta;
}

export interface ViewerWorldRemovedMessage {
  type: "world_removed";
  worldId: string;
}

export interface ViewerErrorMessage {
  type: "error";
  code: string;
  message: string;
}

// Union types

export type ViewerToHubMessage =
  | ViewerSubscribeMessage
  | ViewerUnsubscribeMessage
  | ViewerSubscribeLobbyMessage
  | ViewerUnsubscribeLobbyMessage;

export type HubToViewerMessage =
  | ViewerWorldStateMessage
  | ViewerWorldOfflineMessage
  | ViewerWorldListMessage
  | ViewerWorldMetaUpdateMessage
  | ViewerWorldRemovedMessage
  | ViewerErrorMessage;
