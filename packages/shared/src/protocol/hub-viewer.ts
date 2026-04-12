import type { IslandState } from "../types/island.js";
import type { IslandMeta } from "../types/hub.js";
import type { StateDelta } from "../delta.js";

// Viewer → Hub messages

export interface ViewerSubscribeMessage {
  type: "subscribe";
  islandId: string;
}

export interface ViewerUnsubscribeMessage {
  type: "unsubscribe";
  islandId: string;
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
  islandId: string;
  islandName: string;
  state: IslandState;
  spriteBaseUrl: string;
  spriteVersion?: string;
}

export interface ViewerSpriteVersionMessage {
  type: "sprite_version";
  islandId: string;
  spriteVersion: string;
}

export interface ViewerIslandOfflineMessage {
  type: "island_offline";
  islandId: string;
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
  islandId: string;
}

export interface ViewerCharacterUpdateMessage {
  type: "character_update";
  islandId: string;
  characters: import("../types/character.js").CharacterState[];
}

export interface ViewerStateDeltaMessage {
  type: "state_delta";
  islandId: string;
  delta: StateDelta;
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
  | ViewerUnsubscribeLobbyMessage
  | ViewerResyncRequestMessage;

export interface ViewerResyncRequestMessage {
  type: "resync_request";
  islandId: string;
}

export type HubToViewerMessage =
  | ViewerIslandStateMessage
  | ViewerSpriteVersionMessage
  | ViewerIslandOfflineMessage
  | ViewerIslandListMessage
  | ViewerIslandMetaUpdateMessage
  | ViewerIslandRemovedMessage
  | ViewerCharacterUpdateMessage
  | ViewerStateDeltaMessage
  | ViewerErrorMessage;
