import type { IslandState } from "../types/island.js";
import type { IslandMeta } from "../types/hub.js";

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

export interface ViewerIslandStateMessage {
  type: "island_state";
  worldId: string;
  worldName: string;
  state: IslandState;
  spriteBaseUrl: string;
}

export interface ViewerIslandOfflineMessage {
  type: "island_offline";
  worldId: string;
}

export interface ViewerIslandListMessage {
  type: "island_list";
  islands: IslandMeta[];
}

export interface ViewerIslandMetaUpdateMessage {
  type: "island_meta_update";
  island: IslandMeta;
}

export interface ViewerIslandRemovedMessage {
  type: "island_removed";
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
  | ViewerIslandStateMessage
  | ViewerIslandOfflineMessage
  | ViewerIslandListMessage
  | ViewerIslandMetaUpdateMessage
  | ViewerIslandRemovedMessage
  | ViewerErrorMessage;
