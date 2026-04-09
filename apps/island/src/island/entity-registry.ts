import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { TILE_BY_ID } from "./tile-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../..", "config", "entities.json");

// ── JSON schema types ─────────────────────────────────────────────────────────

/** A single tile within a multi-tile entity layout. */
export interface TilePlacement {
  /** Horizontal offset from the anchor tile (0 = anchor column). */
  dx: number;
  /** Vertical offset from the anchor tile (0 = anchor row, negative = above). */
  dy: number;
  /** Rendering layer: 3 = entity base (same as player), 4 = canopy (above player). */
  layer: number;
  /** Tile ID from tileset.json to render at this position. */
  tileId: string;
}

export interface EntityDef {
  id: string;
  /** Human-readable display name shown in tooltips. */
  name?: string;
  /** All tiles that compose this entity, relative to the anchor at (0,0).
   *  Omit or leave empty for pure inventory items that are never rendered on the map. */
  tiles: TilePlacement[];
  /** If true, this entity is a solid obstacle — characters cannot walk through layer-3 tiles. */
  blocks?: boolean;
  spawn?: {
    /** Relative spawn weight; higher = more frequent. */
    weight: number;
    /** If true, this entity only spawns inside forest zones. */
    forestOnly?: boolean;
    /** If true, this entity never spawns inside forest zones. */
    noForest?: boolean;
    /** If true, this entity only spawns on lake-border water cells. */
    lakeOnly?: boolean;
    /** If true, this entity only spawns on lake-interior water cells (not adjacent to grass). */
    lakeInterior?: boolean;
  };

  // ── Functional fields (kept for backward compat, currently unused) ──────
  stats?: EntityStats;
  harvest?: HarvestDef;
  build?: BuildDef;
  interact?: InteractDef;
  searchTarget?: string;
  container?: boolean;
  acceptedItems?: string[];
  rejectedItems?: string[];
  maxItems?: number;
  energyRegen?: number;
  decay?: DecayDef;
  repair?: RepairDef;
  fireDamage?: number;
  growthStages?: GrowthStagesDef;
  randomStats?: Record<string, { min: number; max: number }>;
  /** Fires a sensory event when a character moves within range. */
  proximityTrigger?: ProximityTriggerDef;
  /** Fires effects when a character interacts with this entity. */
  interactionEffect?: InteractionEffectDef;
}

/** Recipe cost to build an entity onto the map from an adjacent cell. */
export interface BuildDef {
  /** Items consumed from the character's inventory. */
  costs: Record<string, number>;
}

/** Interaction that replaces this entity with another, optionally consuming inventory items. */
export interface InteractDef {
  /** Items consumed from the character's inventory. Empty object = free interaction. */
  costs: Record<string, number>;
  /** Tile ID of the entity to place at this cell after the interaction. */
  result: string;
  /** Minimum health the entity must have for the interaction to be allowed. */
  minHealth?: number;
  /** If true, carry the current entity's health over to the resulting entity's stats. */
  preserveHealth?: boolean;
}

/** Triggered when a character moves within range of this entity. */
export interface ProximityTriggerDef {
  /** Sensory message added to the nearby character's buffer (e.g. "It smells so good"). */
  message: string;
  /** Chebyshev distance to check; default 1 (strictly adjacent). */
  radius?: number;
}

/** Emotion delta applied by an interaction effect. */
export interface EmotionEffectDef {
  /** EmotionPair key, e.g. "anxious_confident". */
  key: string;
  /** How much to shift the emotion (positive = toward high pole, negative = toward low pole). */
  delta: number;
  /** If true, also apply to the interacting character. Default false. */
  self?: boolean;
}

/** Triggered when a character interacts with this entity. */
export interface InteractionEffectDef {
  /** Message added to the interacting character's sensory buffer. */
  message?: string;
  /** Message added to nearby characters' sensory buffers (e.g. "You hear a squeaky sound"). */
  nearbyMessage?: string;
  /** Chebyshev radius to affect nearby characters; default 3. */
  radius?: number;
  /** Permanent emotion changes applied to nearby characters (and self if self:true). */
  emotionEffects?: EmotionEffectDef[];
}

/** Gradual health decay: entity loses health over time, replenished by adding fuel items. */
export interface DecayDef {
  /** Health lost per second. */
  ratePerSecond: number;
  /** Item name consumed from a character's inventory to replenish health. */
  fuelItem: string;
  /** Health restored per 1 unit of fuelItem. */
  healthPerFuel: number;
  /** Tile ID to replace this entity with when health reaches 0. null = remove entirely. */
  onEmpty: string | null;
}

/** Static repair config: entity can be refuelled while idle (no decay timer). */
export interface RepairDef {
  /** Item consumed from a character's inventory to restore health. */
  fuelItem: string;
  /** Health restored per 1 unit of fuelItem. */
  healthPerFuel: number;
}

/** Staged growth config: entity automatically advances to the next tile after a delay. */
export interface GrowthStagesDef {
  /** Tile ID this entity becomes when it finishes growing. */
  nextStage: string;
  /** Milliseconds until the entity advances to nextStage. */
  growthMs: number;
}

interface EntitiesConfig {
  entities: EntityDef[];
}

export interface EntityStats {
  health: number;
  maxHealth: number;
  [resource: string]: number;
}

export interface HarvestDef {
  emptyBase?: string;
  emptyTop?: string;
  fullBase: string;
  fullTop?: string;
  /** For quad-canopy entities: the full tile ID at (x+1, y) — base right.
   *  Also used for two-tile-h entities: the secondary tile at (x+1, y). */
  fullRight?: string;
  /** For quad-canopy entities: the full tile ID at (x+1, y-1) — canopy right. */
  fullTopRight?: string;
  /** For two-tile-v entities: the secondary tile at (x, y+1). */
  fullBottom?: string;
  regrowMs?: number;
  /** Capability tags required on the character's equipped (hands) item. Omit = no restriction. */
  requires?: string[];
  /** Base number of resources to yield per drain-mode harvest action.
   *  Actual yield = Math.max(1, Math.round(harvestYield × toolCapabilityLevel)).
   *  Omit to drain all available resources in one action (legacy behaviour). */
  harvestYield?: number;
  /** Health damage dealt per harvest command. Omit = one-shot resource drain (legacy behavior). */
  damage?: number;
  /** Resources added to entity stats on each successful damage hit (before any collection). */
  dropPerHit?: Record<string, number>;
  /** What happens when entity health reaches 0 (only used when damage is set). */
  onDeath?: {
    /** Tile ID of an entity to place at the same map cell after death. */
    spawnEntity?: string;
    /** Items immediately added to the character's inventory on death. */
    drops?: Record<string, number>;
    /**
     * When true, the entity is NOT destroyed at health=0.
     * It remains on the map so the player can harvest pending resources.
     * Entity is removed only when resources are fully drained.
     */
    keepForPickup?: boolean;
  };
}

// ── Load config ───────────────────────────────────────────────────────────────

function loadConfig(): EntitiesConfig {
  const raw: EntitiesConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  // Normalize: ensure every entity has a tiles array (items may omit it in JSON)
  for (const e of raw.entities) {
    (e as { tiles?: TilePlacement[] }).tiles ??= [];
  }
  return raw;
}

function buildDerivedExports(defs: EntityDef[]) {
  const ENTITY_DEFAULTS: Record<string, EntityStats> = Object.fromEntries(
    defs.map((e) => [e.id, e.stats ?? { health: 0, maxHealth: 0 }])
  );

  const SINGLE_TILE_IDS: string[] = defs.filter((e) => e.tiles.length <= 1).map((e) => e.id);

  // Legacy: two-tile tree pairs for backward compat (empty if no entities use old format)
  const TWO_TILE_TREE_PAIRS: [string, string][] = [];

  const HARVEST_DEFS: Record<string, HarvestDef> = Object.fromEntries(
    defs.filter((e) => e.harvest !== undefined).map((e) => [e.id, e.harvest!])
  );

  const BUILD_DEFS: Record<string, BuildDef> = Object.fromEntries(
    defs.filter((e) => e.build !== undefined).map((e) => [e.id, e.build!])
  );

  const INTERACT_DEFS: Record<string, InteractDef> = Object.fromEntries(
    defs.filter((e) => e.interact !== undefined).map((e) => [e.id, e.interact!])
  );

  const SEARCH_TARGET_MAP: Map<string, Set<string>> = new Map();
  for (const e of defs) {
    if (!e.searchTarget) continue;
    const group = SEARCH_TARGET_MAP.get(e.searchTarget) ?? new Set<string>();
    group.add(e.id);
    SEARCH_TARGET_MAP.set(e.searchTarget, group);
  }

  // Derive BLOCKING_IDS from tiles array: all tileIds on layer 3 of blocking entities
  const BLOCKING_IDS: Set<string> = new Set<string>();
  for (const e of defs) {
    if (!e.blocks) continue;
    for (const t of e.tiles) {
      if (t.layer === 3) BLOCKING_IDS.add(t.tileId);
    }
  }

  const ENTITY_DEF_BY_ID: Map<string, EntityDef> = new Map(defs.map((e) => [e.id, e]));

  // Index by anchor tileId (tile at dx=0, dy=0) for reverse-lookup from tile overrides.
  // This allows entity.id and the anchor tileId to differ (e.g. "my_tree" entity with tileId "big_tree_light").
  const ENTITY_DEF_BY_TILE_ID: Map<string, EntityDef> = new Map();
  for (const e of defs) {
    const anchor = e.tiles?.find((t) => t.dx === 0 && t.dy === 0);
    if (anchor) {
      ENTITY_DEF_BY_TILE_ID.set(anchor.tileId, e);
      if (!TILE_BY_ID.has(anchor.tileId)) {
        process.stderr.write(`[entity-registry] WARNING: entity "${e.id}" anchor tileId "${anchor.tileId}" not found in tileset.json — it will spawn but render as invisible\n`);
      }
    }
    // Warn on non-anchor tiles too
    for (const t of (e.tiles ?? [])) {
      if ((t.dx !== 0 || t.dy !== 0) && !TILE_BY_ID.has(t.tileId)) {
        process.stderr.write(`[entity-registry] WARNING: entity "${e.id}" tile tileId "${t.tileId}" (dx=${t.dx}, dy=${t.dy}) not found in tileset.json\n`);
      }
    }
  }

  const DECAY_DEFS: Record<string, DecayDef> = Object.fromEntries(
    defs.filter((e) => e.decay !== undefined).map((e) => [e.id, e.decay!])
  );

  const REPAIR_DEFS: Record<string, RepairDef> = Object.fromEntries(
    defs.filter((e) => e.repair !== undefined).map((e) => [e.id, e.repair!])
  );

  const GROWTH_DEFS: Record<string, GrowthStagesDef> = Object.fromEntries(
    defs.filter((e) => e.growthStages !== undefined).map((e) => [e.id, e.growthStages!])
  );

  const RANDOM_STATS: Record<string, Record<string, { min: number; max: number }>> = Object.fromEntries(
    defs.filter((e) => e.randomStats !== undefined).map((e) => [e.id, e.randomStats!])
  );

  const PROXIMITY_TRIGGERS: Map<string, ProximityTriggerDef> = new Map();
  const INTERACTION_EFFECTS: Map<string, InteractionEffectDef> = new Map();
  for (const e of defs) {
    const anchor = e.tiles?.find((t) => t.dx === 0 && t.dy === 0);
    if (!anchor) continue;
    if (e.proximityTrigger) PROXIMITY_TRIGGERS.set(anchor.tileId, e.proximityTrigger);
    if (e.interactionEffect) INTERACTION_EFFECTS.set(anchor.tileId, e.interactionEffect);
  }

  return { ENTITY_DEFAULTS, SINGLE_TILE_IDS, TWO_TILE_TREE_PAIRS, HARVEST_DEFS, BUILD_DEFS, INTERACT_DEFS, SEARCH_TARGET_MAP, BLOCKING_IDS, ENTITY_DEF_BY_ID, ENTITY_DEF_BY_TILE_ID, DECAY_DEFS, REPAIR_DEFS, GROWTH_DEFS, RANDOM_STATS, PROXIMITY_TRIGGERS, INTERACTION_EFFECTS };
}

/** Full entity definitions as loaded from config/entities.json. */
export const ENTITY_DEFS: EntityDef[] = [...loadConfig().entities];

/** Returns all harvestable resource amounts from an EntityStats object.
 * Keys starting with "max" (e.g. maxHealth, maxRocks) are excluded as they represent caps, not resources. */
export function getResources(stats: EntityStats): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    if (k !== "health" && !k.startsWith("max") && typeof v === "number" && v > 0) result[k] = v;
  }
  return result;
}

/** Apply randomStats rules to a stats object, mutating it in place.
 *  @param rng  A () => number function returning [0,1). Falls back to Math.random. */
export function applyRandomStats(entityId: string, stats: Record<string, unknown>, rng: () => number = Math.random): void {
  const rules = RANDOM_STATS[entityId];
  if (!rules) return;
  for (const [key, { min, max }] of Object.entries(rules)) {
    (stats as Record<string, number>)[key] = min + Math.floor(rng() * (max - min + 1));
  }
}

let _derived = buildDerivedExports(ENTITY_DEFS);

/** Default stats keyed by layer-2 tile ID (the "root" tile of each entity). */
export let ENTITY_DEFAULTS: Record<string, EntityStats> = _derived.ENTITY_DEFAULTS;

/** Single-tile entity IDs (layer 2 only, no canopy). */
export let SINGLE_TILE_IDS: string[] = _derived.SINGLE_TILE_IDS;

/**
 * 2-tile tree pairs: [baseTileId, topTileId].
 * Base goes at (x, y) layer 2; top goes at (x, y-1) layer 3.
 */
export let TWO_TILE_TREE_PAIRS: [string, string][] = _derived.TWO_TILE_TREE_PAIRS;

export let HARVEST_DEFS: Record<string, HarvestDef> = _derived.HARVEST_DEFS;

export let BUILD_DEFS: Record<string, BuildDef> = _derived.BUILD_DEFS;

export let INTERACT_DEFS: Record<string, InteractDef> = _derived.INTERACT_DEFS;

/** Decay definitions keyed by entity tile ID. */
export let DECAY_DEFS: Record<string, DecayDef> = _derived.DECAY_DEFS;

/** Repair definitions (static refuel, no decay timer) keyed by entity tile ID. */
export let REPAIR_DEFS: Record<string, RepairDef> = _derived.REPAIR_DEFS;

/** Growth stage definitions keyed by entity tile ID. */
export let GROWTH_DEFS: Record<string, GrowthStagesDef> = _derived.GROWTH_DEFS;

/** Per-entity stat randomization rules. Keys are entity IDs → stat name → { min, max }. */
export let RANDOM_STATS: Record<string, Record<string, { min: number; max: number }>> = _derived.RANDOM_STATS;

/** Maps anchor tileId → ProximityTriggerDef for entities with proximity sensory triggers. */
export let PROXIMITY_TRIGGERS: Map<string, ProximityTriggerDef> = _derived.PROXIMITY_TRIGGERS;

/** Maps anchor tileId → InteractionEffectDef for entities with interaction sensory/emotion effects. */
export let INTERACTION_EFFECTS: Map<string, InteractionEffectDef> = _derived.INTERACTION_EFFECTS;

/** Set of entity tile IDs that are solid obstacles — never walkable, harvest requires adjacency. */
export let BLOCKING_IDS: Set<string> = _derived.BLOCKING_IDS;

/** Maps entity id → full EntityDef for O(1) lookup (e.g. in tick aura checks). */
export let ENTITY_DEF_BY_ID: Map<string, EntityDef> = _derived.ENTITY_DEF_BY_ID;

/** Maps anchor tileId → full EntityDef. Use this when looking up from tile override strings. */
export let ENTITY_DEF_BY_TILE_ID: Map<string, EntityDef> = _derived.ENTITY_DEF_BY_TILE_ID;

/**
 * Maps each searchTarget group name to the set of tile IDs belonging to that group.
 * e.g. "trees" → Set { "young_tree", "old_tree_base" }
 */
export let SEARCH_TARGET_MAP: Map<string, Set<string>> = _derived.SEARCH_TARGET_MAP;

export function reloadEntities(): void {
  const defs = loadConfig().entities;
  ENTITY_DEFS.length = 0;
  ENTITY_DEFS.push(...defs);
  _derived = buildDerivedExports(defs);
  ENTITY_DEFAULTS   = _derived.ENTITY_DEFAULTS;
  SINGLE_TILE_IDS   = _derived.SINGLE_TILE_IDS;
  TWO_TILE_TREE_PAIRS = _derived.TWO_TILE_TREE_PAIRS;
  HARVEST_DEFS      = _derived.HARVEST_DEFS;
  BUILD_DEFS        = _derived.BUILD_DEFS;
  INTERACT_DEFS     = _derived.INTERACT_DEFS;
  DECAY_DEFS        = _derived.DECAY_DEFS;
  REPAIR_DEFS       = _derived.REPAIR_DEFS;
  BLOCKING_IDS      = _derived.BLOCKING_IDS;
  ENTITY_DEF_BY_ID  = _derived.ENTITY_DEF_BY_ID;
  ENTITY_DEF_BY_TILE_ID = _derived.ENTITY_DEF_BY_TILE_ID;
  SEARCH_TARGET_MAP = _derived.SEARCH_TARGET_MAP;
  GROWTH_DEFS       = _derived.GROWTH_DEFS;
  RANDOM_STATS      = _derived.RANDOM_STATS;
  PROXIMITY_TRIGGERS    = _derived.PROXIMITY_TRIGGERS;
  INTERACTION_EFFECTS   = _derived.INTERACTION_EFFECTS;
}

export function CONFIG_PATH_ENTITIES() { return CONFIG_PATH; }

