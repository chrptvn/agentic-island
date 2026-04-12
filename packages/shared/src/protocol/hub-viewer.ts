import type { IslandState, TileRegistry } from "../types/island.js";
import type { IslandMeta } from "../types/hub.js";
import type { StateDelta } from "../delta.js";
import type {
  WireMapData,
  WireEntityInstance,
  WireCharacterState,
  WireCharacterPosition,
  WireOverride,
  WireStateDelta,
} from "../codec.js";

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

/** Static map data — sent once per subscription, cached at hub. */
export interface ViewerMapInitMessage {
  type: "map_init";
  islandId: string;
  islandName: string;
  map: WireMapData;
  tileRegistry: TileRegistry;
  tileLookup: string[];
  spriteBaseUrl: string;
  spriteVersion?: string;
}

/** Dynamic state (entities, characters, overrides) — no map. */
export interface ViewerDynamicStateMessage {
  type: "dynamic_state";
  islandId: string;
  entities: WireEntityInstance[];
  characters: WireCharacterState[];
  overrides: WireOverride[];
}

/**
 * @deprecated Legacy full-state message. Kept for backward compatibility.
 * New code uses map_init + dynamic_state instead.
 */
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
  characters: WireCharacterPosition[];
}

export interface ViewerStateDeltaMessage {
  type: "state_delta";
  islandId: string;
  delta: WireStateDelta;
}

/** Lightweight notification that the island's map has changed (e.g. island restart).
 * Clients should re-fetch the map via HTTP. */
export interface ViewerMapChangedMessage {
  type: "map_changed";
  islandId: string;
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
  | ViewerMapInitMessage
  | ViewerDynamicStateMessage
  | ViewerIslandStateMessage
  | ViewerSpriteVersionMessage
  | ViewerIslandOfflineMessage
  | ViewerIslandListMessage
  | ViewerIslandMetaUpdateMessage
  | ViewerIslandRemovedMessage
  | ViewerCharacterUpdateMessage
  | ViewerStateDeltaMessage
  | ViewerMapChangedMessage
  | ViewerErrorMessage;
