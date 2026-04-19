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
import type { StateDelta, EntityPatch, OverridePatch, CharacterPatch } from "./delta.js";

// ---------------------------------------------------------------------------
// Wire format types — compact short-key JSON for transport
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
  /** tileId (numeric index) */
  t: number;
  /** stats */
  s: Record<string, number>;
  /** name */
  n?: string;
  /** inventory */
  i?: { item: string; qty: number }[];
  /** occupants */
  o?: string[];
  /** renderScale */
  rs?: number;
}

export interface WireCharacterState {
  /** id */
  i: string;
  x: number;
  y: number;
  /** layerTiles */
  lt: Record<string, number>;
  /** appearance */
  a?: CharacterAppearance;
  /** facing */
  f?: CharacterFacing;
  /** stats */
  s: CharacterStats;
  /** inventory */
  iv: InventoryItem[];
  /** equipment */
  eq: EquipmentSlots;
  /** goal */
  g: string;
  /** speech */
  sp?: { text: string; expiresAt: number };
  /** shelter */
  sh?: string;
}

export interface WireOverride {
  x: number;
  y: number;
  /** layer */
  l: number;
  /** tileId (numeric index) */
  t: number;
}

export interface WireEntityPatch {
  /** action */
  a: "upsert" | "remove";
  /** key */
  k: string;
  /** entity */
  e?: WireEntityInstance;
}

export interface WireCharacterPatch {
  /** action */
  a: "upsert" | "remove";
  /** key (character id) */
  k: string;
  /** character */
  c?: WireCharacterState;
}

export interface WireOverridePatch {
  /** action */
  a: "set" | "remove";
  x: number;
  y: number;
  /** layer */
  l: number;
  /** tileId (numeric index) */
  t?: number;
}

export interface WireStateDelta {
  /** tick */
  tk: number;
  /** character patches */
  c?: WireCharacterPatch[];
  /** entities */
  e?: WireEntityPatch[];
  /** overrides */
  o?: WireOverridePatch[];
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
    t: encodeTileId(e.tileId, enc),
    s: e.stats,
  };
  if (e.name !== undefined) wire.n = e.name;
  if (e.inventory) wire.i = e.inventory;
  if (e.occupants) wire.o = e.occupants;
  if (e.renderScale != null) wire.rs = e.renderScale;
  return wire;
}

export function encodeEntities(entities: EntityInstance[], enc: Map<string, number>): WireEntityInstance[] {
  return entities.map(e => encodeEntity(e, enc));
}

export function encodeCharacter(c: CharacterState, enc: Map<string, number>): WireCharacterState {
  const lt: Record<string, number> = {};
  for (const key of Object.keys(c.layerTiles)) {
    lt[key] = encodeTileId(c.layerTiles[key], enc);
  }
  const wire: WireCharacterState = {
    i: c.id,
    x: c.x,
    y: c.y,
    lt,
    s: c.stats,
    iv: c.inventory,
    eq: c.equipment,
    g: c.goal,
  };
  if (c.appearance) wire.a = c.appearance;
  if (c.facing) wire.f = c.facing;
  if (c.speech) wire.sp = c.speech;
  if (c.shelter) wire.sh = c.shelter;
  return wire;
}

export function encodeCharacters(chars: CharacterState[], enc: Map<string, number>): WireCharacterState[] {
  return chars.map(c => encodeCharacter(c, enc));
}

export function encodeOverrides(overrides: TileOverride[], enc: Map<string, number>): WireOverride[] {
  return overrides.map(o => ({
    x: o.x,
    y: o.y,
    l: o.layer,
    t: encodeTileId(o.tileId, enc),
  }));
}

export function encodeEntityPatch(p: EntityPatch, enc: Map<string, number>): WireEntityPatch {
  const wire: WireEntityPatch = { a: p.action, k: p.key };
  if (p.entity) wire.e = encodeEntity(p.entity, enc);
  return wire;
}

export function encodeCharacterPatch(p: CharacterPatch, enc: Map<string, number>): WireCharacterPatch {
  const wire: WireCharacterPatch = { a: p.action, k: p.key };
  if (p.character) wire.c = encodeCharacter(p.character, enc);
  return wire;
}

export function encodeOverridePatch(p: OverridePatch, enc: Map<string, number>): WireOverridePatch {
  const wire: WireOverridePatch = { a: p.action, x: p.x, y: p.y, l: p.layer };
  if (p.tileId !== undefined) wire.t = encodeTileId(p.tileId, enc);
  return wire;
}

export function encodeDelta(delta: StateDelta, enc: Map<string, number>): WireStateDelta {
  const wire: WireStateDelta = {
    tk: delta.tick,
  };
  if (delta.characters) {
    wire.c = delta.characters.map(p => encodeCharacterPatch(p, enc));
  }
  if (delta.entities) {
    wire.e = delta.entities.map(p => encodeEntityPatch(p, enc));
  }
  if (delta.overrides) {
    wire.o = delta.overrides.map(p => encodeOverridePatch(p, enc));
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
    tileId: decodeTileId(e.t, lookup),
    stats: e.s,
  };
  if (e.n !== undefined) decoded.name = e.n;
  if (e.i) decoded.inventory = e.i;
  if (e.o) decoded.occupants = e.o;
  if (e.rs != null) decoded.renderScale = e.rs;
  return decoded;
}

export function decodeEntities(entities: WireEntityInstance[], lookup: string[]): EntityInstance[] {
  return entities.map(e => decodeEntity(e, lookup));
}

export function decodeCharacter(c: WireCharacterState, lookup: string[]): CharacterState {
  const layerTiles: Record<string, string> = {};
  for (const key of Object.keys(c.lt)) {
    layerTiles[key] = decodeTileId(c.lt[key], lookup);
  }
  const decoded: CharacterState = {
    id: c.i,
    x: c.x,
    y: c.y,
    layerTiles,
    stats: c.s,
    inventory: c.iv,
    equipment: c.eq,
    goal: c.g,
  };
  if (c.a) decoded.appearance = c.a;
  if (c.f) decoded.facing = c.f;
  if (c.sp) decoded.speech = c.sp;
  if (c.sh) decoded.shelter = c.sh;
  return decoded;
}

export function decodeCharacters(chars: WireCharacterState[], lookup: string[]): CharacterState[] {
  return chars.map(c => decodeCharacter(c, lookup));
}

export function decodeOverrides(overrides: WireOverride[], lookup: string[]): TileOverride[] {
  return overrides.map(o => ({
    x: o.x,
    y: o.y,
    layer: o.l,
    tileId: decodeTileId(o.t, lookup),
  }));
}

export function decodeDelta(delta: WireStateDelta, lookup: string[]): StateDelta {
  const result: StateDelta = {
    tick: delta.tk,
  };
  if (delta.c) {
    result.characters = delta.c.map(p => {
      const decoded: CharacterPatch = { action: p.a, key: p.k };
      if (p.c) decoded.character = decodeCharacter(p.c, lookup);
      return decoded;
    });
  }
  if (delta.e) {
    result.entities = delta.e.map(p => {
      const decoded: EntityPatch = { action: p.a, key: p.k };
      if (p.e) decoded.entity = decodeEntity(p.e, lookup);
      return decoded;
    });
  }
  if (delta.o) {
    result.overrides = delta.o.map(p => {
      const decoded: OverridePatch = { action: p.a, x: p.x, y: p.y, layer: p.l };
      if (p.t !== undefined) decoded.tileId = decodeTileId(p.t, lookup);
      return decoded;
    });
  }
  return result;
}
