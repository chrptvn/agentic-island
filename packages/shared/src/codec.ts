import type { TileRegistry, MapData, TileOverride } from "./types/island.js";
import type { EntityInstance } from "./types/entity.js";
import type {
  CharacterState,
  CharacterStats,
  InventoryItem,
  EquipmentSlots,
  CharacterAppearance,
  CharacterFacing,
} from "./types/character.js";
import type { StateDelta, EntityPatch, OverridePatch } from "./delta.js";

// ---------------------------------------------------------------------------
// Wire format types — compact numeric tile IDs for transport
// ---------------------------------------------------------------------------

export interface WireMapData {
  width: number;
  height: number;
  seed: number;
  terrain: number[][];
}

export interface WireEntityInstance {
  x: number;
  y: number;
  tileId: number;
  stats: Record<string, number>;
  name?: string;
  inventory?: { item: string; qty: number }[];
  occupants?: string[];
}

export interface WireCharacterState {
  id: string;
  x: number;
  y: number;
  layerTiles: Record<string, number>;
  appearance?: CharacterAppearance;
  facing?: CharacterFacing;
  stats: CharacterStats;
  inventory: InventoryItem[];
  equipment: EquipmentSlots;
  goal: string;
  speech?: { text: string; expiresAt: number };
  shelter?: string;
}

export interface WireOverride {
  x: number;
  y: number;
  layer: number;
  tileId: number;
}

export interface WireEntityPatch {
  action: "upsert" | "remove";
  key: string;
  entity?: WireEntityInstance;
}

export interface WireOverridePatch {
  action: "set" | "remove";
  x: number;
  y: number;
  layer: number;
  tileId?: number;
}

export interface WireStateDelta {
  tick: number;
  stateHash: string;
  characters?: WireCharacterState[];
  entities?: WireEntityPatch[];
  overrides?: WireOverridePatch[];
}

// ---------------------------------------------------------------------------
// Lookup builder
// ---------------------------------------------------------------------------

/** Build a sorted tile lookup array: index → tileId string. */
export function buildTileLookup(registry: TileRegistry): string[] {
  return Object.keys(registry).sort();
}

/** Build an encoder map from a lookup array: tileId string → index. */
export function buildEncoderMap(lookup: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < lookup.length; i++) {
    map.set(lookup[i], i);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Encoders (string tile IDs → numeric indices)
// ---------------------------------------------------------------------------

function encodeTileId(id: string, enc: Map<string, number>): number {
  return enc.get(id) ?? -1;
}

export function encodeMap(map: MapData, enc: Map<string, number>): WireMapData {
  return {
    width: map.width,
    height: map.height,
    seed: map.seed,
    terrain: map.terrain.map(row => row.map(id => encodeTileId(id, enc))),
  };
}

export function encodeEntity(e: EntityInstance, enc: Map<string, number>): WireEntityInstance {
  const wire: WireEntityInstance = {
    x: e.x,
    y: e.y,
    tileId: encodeTileId(e.tileId, enc),
    stats: e.stats,
  };
  if (e.name !== undefined) wire.name = e.name;
  if (e.inventory) wire.inventory = e.inventory;
  if (e.occupants) wire.occupants = e.occupants;
  return wire;
}

export function encodeEntities(entities: EntityInstance[], enc: Map<string, number>): WireEntityInstance[] {
  return entities.map(e => encodeEntity(e, enc));
}

export function encodeCharacter(c: CharacterState, enc: Map<string, number>): WireCharacterState {
  const layerTiles: Record<string, number> = {};
  for (const key of Object.keys(c.layerTiles)) {
    layerTiles[key] = encodeTileId(c.layerTiles[key], enc);
  }
  const wire: WireCharacterState = {
    id: c.id,
    x: c.x,
    y: c.y,
    layerTiles,
    stats: c.stats,
    inventory: c.inventory,
    equipment: c.equipment,
    goal: c.goal,
  };
  if (c.appearance) wire.appearance = c.appearance;
  if (c.facing) wire.facing = c.facing;
  if (c.speech) wire.speech = c.speech;
  if (c.shelter) wire.shelter = c.shelter;
  return wire;
}

export function encodeCharacters(chars: CharacterState[], enc: Map<string, number>): WireCharacterState[] {
  return chars.map(c => encodeCharacter(c, enc));
}

export function encodeOverrides(overrides: TileOverride[], enc: Map<string, number>): WireOverride[] {
  return overrides.map(o => ({
    x: o.x,
    y: o.y,
    layer: o.layer,
    tileId: encodeTileId(o.tileId, enc),
  }));
}

export function encodeEntityPatch(p: EntityPatch, enc: Map<string, number>): WireEntityPatch {
  const wire: WireEntityPatch = { action: p.action, key: p.key };
  if (p.entity) wire.entity = encodeEntity(p.entity, enc);
  return wire;
}

export function encodeOverridePatch(p: OverridePatch, enc: Map<string, number>): WireOverridePatch {
  const wire: WireOverridePatch = { action: p.action, x: p.x, y: p.y, layer: p.layer };
  if (p.tileId !== undefined) wire.tileId = encodeTileId(p.tileId, enc);
  return wire;
}

export function encodeDelta(delta: StateDelta, enc: Map<string, number>): WireStateDelta {
  const wire: WireStateDelta = {
    tick: delta.tick,
    stateHash: delta.stateHash,
  };
  if (delta.characters) {
    wire.characters = encodeCharacters(delta.characters, enc);
  }
  if (delta.entities) {
    wire.entities = delta.entities.map(p => encodeEntityPatch(p, enc));
  }
  if (delta.overrides) {
    wire.overrides = delta.overrides.map(p => encodeOverridePatch(p, enc));
  }
  return wire;
}

// ---------------------------------------------------------------------------
// Decoders (numeric indices → string tile IDs)
// ---------------------------------------------------------------------------

function decodeTileId(id: number, lookup: string[]): string {
  return lookup[id] ?? "";
}

export function decodeMap(map: WireMapData, lookup: string[]): MapData {
  return {
    width: map.width,
    height: map.height,
    seed: map.seed,
    terrain: map.terrain.map(row => row.map(id => decodeTileId(id, lookup))),
  };
}

export function decodeEntity(e: WireEntityInstance, lookup: string[]): EntityInstance {
  const decoded: EntityInstance = {
    x: e.x,
    y: e.y,
    tileId: decodeTileId(e.tileId, lookup),
    stats: e.stats,
  };
  if (e.name !== undefined) decoded.name = e.name;
  if (e.inventory) decoded.inventory = e.inventory;
  if (e.occupants) decoded.occupants = e.occupants;
  return decoded;
}

export function decodeEntities(entities: WireEntityInstance[], lookup: string[]): EntityInstance[] {
  return entities.map(e => decodeEntity(e, lookup));
}

export function decodeCharacter(c: WireCharacterState, lookup: string[]): CharacterState {
  const layerTiles: Record<string, string> = {};
  for (const key of Object.keys(c.layerTiles)) {
    layerTiles[key] = decodeTileId(c.layerTiles[key], lookup);
  }
  const decoded: CharacterState = {
    id: c.id,
    x: c.x,
    y: c.y,
    layerTiles,
    stats: c.stats,
    inventory: c.inventory,
    equipment: c.equipment,
    goal: c.goal,
  };
  if (c.appearance) decoded.appearance = c.appearance;
  if (c.facing) decoded.facing = c.facing;
  if (c.speech) decoded.speech = c.speech;
  if (c.shelter) decoded.shelter = c.shelter;
  return decoded;
}

export function decodeCharacters(chars: WireCharacterState[], lookup: string[]): CharacterState[] {
  return chars.map(c => decodeCharacter(c, lookup));
}

export function decodeOverrides(overrides: WireOverride[], lookup: string[]): TileOverride[] {
  return overrides.map(o => ({
    x: o.x,
    y: o.y,
    layer: o.layer,
    tileId: decodeTileId(o.tileId, lookup),
  }));
}

export function decodeDelta(delta: WireStateDelta, lookup: string[]): StateDelta {
  const result: StateDelta = {
    tick: delta.tick,
    stateHash: delta.stateHash,
  };
  if (delta.characters) {
    result.characters = decodeCharacters(delta.characters, lookup);
  }
  if (delta.entities) {
    result.entities = delta.entities.map(p => {
      const decoded: EntityPatch = { action: p.action, key: p.key };
      if (p.entity) decoded.entity = decodeEntity(p.entity, lookup);
      return decoded;
    });
  }
  if (delta.overrides) {
    result.overrides = delta.overrides.map(p => {
      const decoded: OverridePatch = { action: p.action, x: p.x, y: p.y, layer: p.layer };
      if (p.tileId !== undefined) decoded.tileId = decodeTileId(p.tileId, lookup);
      return decoded;
    });
  }
  return result;
}
