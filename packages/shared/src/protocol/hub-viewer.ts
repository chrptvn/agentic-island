import type { TileRegistry } from "../types/island.js";
import type { IslandMeta } from "../types/hub.js";
import type {
  WireMapData,
  WireStateDelta,
} from "../codec.js";

// ---------------------------------------------------------------------------
// Island-scoped messages (Hub → Viewer over /ws/island/:id)
// No islandId needed — connection is scoped to one island.
// ---------------------------------------------------------------------------

/** Static map data — sent once per subscription, cached at hub. */
export interface ViewerMapInitMessage {
  type: "map_init";
  islandName: string;
  map: WireMapData;
  tileRegistry: TileRegistry;
  tileLookup: string[];
  spriteBaseUrl: string;
  spriteVersion?: string;
}

export interface ViewerSpriteVersionMessage {
  type: "sprite_version";
  spriteVersion: string;
}

export interface ViewerIslandOfflineMessage {
  type: "island_offline";
}

export interface ViewerStateDeltaMessage {
  type: "state_delta";
  delta: WireStateDelta;
}

/** Lightweight notification that the island's map has changed (e.g. island restart).
 * Clients should re-fetch the map via HTTP. */
export interface ViewerMapChangedMessage {
  type: "map_changed";
}

export interface ViewerErrorMessage {
  type: "error";
  code: string;
  message: string;
}

/** Messages sent over the island-scoped WS (/ws/island/:id). */
export type HubToIslandViewerMessage =
  | ViewerMapInitMessage
  | ViewerSpriteVersionMessage
  | ViewerIslandOfflineMessage
  | ViewerStateDeltaMessage
  | ViewerMapChangedMessage
  | ViewerErrorMessage;

// ---------------------------------------------------------------------------
// Lobby messages (Hub → Viewer over /ws/lobby)
// ---------------------------------------------------------------------------

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

/** Messages sent over the lobby WS (/ws/lobby). */
export type HubToLobbyMessage =
  | ViewerIslandListMessage
  | ViewerIslandMetaUpdateMessage
  | ViewerIslandRemovedMessage;

// ---------------------------------------------------------------------------
// Combined union (for client-side type narrowing)
// ---------------------------------------------------------------------------

export type HubToViewerMessage =
  | HubToIslandViewerMessage
  | HubToLobbyMessage;
