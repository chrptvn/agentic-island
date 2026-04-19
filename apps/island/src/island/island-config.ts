import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH_ISLAND = join(__dirname, "../..", "config", "world.json");

export interface EnergyCosts {
  moveStep:       number;
  moveStepOnPath: number;
  plow:           number;
  harvest:        number;
  build:          number;
  interact:       number;
  craft:          number;
  eat:            number;
}

export interface CharacterStats {
  maxHealth: number;
  maxHunger: number;
  maxEnergy: number;
}

/** Health-condition display thresholds: each entry is [minimumPercent, label]. Evaluated top-down. */
export interface HealthCondition {
  minPct: number;
  label:  string;
}

/** Plow/path-building tuning. */
export interface PlowConfig {
  /** Total progress needed to complete a path cell. */
  required:       number;
  /** Base damage dealt per hit (before tool scaling). */
  baseDamage:     number;
  /** Extra damage per plow-tool level. */
  damagePerLevel: number;
  /** Minimum energy cost per hit. */
  minCost:        number;
  /** Energy cost reduction per plow-tool level. */
  costReductionPerLevel: number;
}

/** Speech bubble tuning. */
export interface SpeechConfig {
  /** Maximum character count for a speech bubble. */
  maxChars:   number;
  /** How long (ms) a speech bubble stays visible. */
  durationMs: number;
}

/** Emotion system tuning. */
export interface EmotionConfig {
  /** Default emotion value when not yet set. */
  defaultValue: number;
  /** Minimum clamped value. */
  min: number;
  /** Maximum clamped value. */
  max: number;
}

/** Action animation tuning (frames / fps → duration). */
export interface AnimationConfig {
  frames: number;
  fps:    number;
}

/** Gameplay constants that were previously hardcoded. */
export interface GameplayConfig {
  healthConditions:   HealthCondition[];
  plow:               PlowConfig;
  speech:             SpeechConfig;
  emotion:            EmotionConfig;
  /** Energy regen multiplier inside a tent (per second). */
  tentRegenPerSecond: number;
  /** Starting inventory for newly spawned characters. */
  startingInventory:  Array<{ item: string; qty: number }>;
  /** Default radius for `scanNearby()` entity detection. */
  scanNearbyRadius:   number;
  /** Default radius for `getSurroundings()` character awareness. */
  surroundingsRadius: number;
  /** Fallback radius for interaction/eat/special-action nearby broadcasts. */
  defaultEffectRadius: number;
  /** Default animation timings per action type. */
  animations: Record<string, AnimationConfig>;
}

/** A named biome zone that is BFS-grown on the island during map generation.
 *  Each biome can override per-entity spawn weights via the entity's `spawn.biomes` map. */
export interface BiomeConfig {
  /** Unique biome identifier referenced by entity spawn configs (e.g. "forest", "flower_field"). */
  id: string;
  /** Number of zones of this biome to generate. */
  count: number;
  /** Minimum BFS radius for each zone (in cells). */
  radiusMin: number;
  /** Maximum BFS radius for each zone (in cells). */
  radiusMax: number;
  /** Fraction (0–1) of eligible cells inside this biome that receive vegetation. */
  vegetationDensity: number;
  /** If true, all unclaimed grass cells are assigned to this biome after BFS
   *  placement.  At most one biome should have fill=true; count/radius are
   *  ignored for fill biomes. */
  fill?: boolean;
}

export interface MapGenConfig {
  /** Initial probability (0–1) that a cell starts as grass before cellular automata. */
  fillProbability:  number;
  /** Number of cellular automata smoothing passes. */
  smoothingPasses:  number;
  /** Minimum live-neighbor count to become/stay grass. */
  grassThreshold:   number;
  /** Maximum live-neighbor count before becoming water. */
  waterThreshold:   number;
  /** Number of gap-fill passes to close thin water gaps. */
  gapFillPasses:    number;
  /** Probability (0–1) that a lake is carved into the island. */
  lakeProbability:  number;
  /** Minimum lake radius in cells. */
  lakeRadiusMin:    number;
  /** Maximum lake radius in cells. */
  lakeRadiusMax:    number;
  /** Fraction (0–1) of eligible inner cells that receive vegetation. */
  vegetationDensity: number;
  /** Fraction (0–1) of water-adjacent grass cells that seed a sand patch. */
  sandSeedProb: number;
  /** Probability (0–1) of sand spreading to each eligible neighbor (first wave). */
  sandGrowProb: number;
  /** Maximum distance from water (in cells) that sand can reach. */
  sandMaxDepth: number;
  /** Named biome zones generated via BFS on deep-interior grass cells. */
  biomes: BiomeConfig[];
  /** Fraction (0–1) of lake-border water cells that receive a lily pad. */
  lilyPadDensity: number;
  /** Minimum cardinal grass neighbors to fill a water gap during gap-fill. */
  gapFillThreshold: number;
  /** Biome center candidates must be this many cells from the map border. */
  biomeBorderMargin: number;
  /** Sand only seeds on cells exactly this distance from water. */
  sandSeedDistance: number;
  /** Probability multiplier for the third sand-spread wave (relative to sandGrowProb). */
  sandGrowProbWave3: number;
  /** Number of cells from the map edge that are forced to stay water.
   *  Prevents the island from filling edge-to-edge on small maps. */
  shorePadding: number;
}

export interface IslandConfig {
  /** Game simulation tick interval in milliseconds. */
  tickMs:               number;
  /** How many ticks between movement steps (higher = slower). */
  moveTickInterval:     number;
  hungerDrainPerSecond: number;
  healthDrainPerSecond: number;
  healthRegenPassive:   number;
  energyRegenPassive:   number;
  energyCosts:          EnergyCosts;
  /** Default starting/max stats for newly spawned characters. */
  characterStats:       CharacterStats;
  /** Ordered list of equipment slot names available to characters. */
  equipmentSlots:       string[];
  /** Procedural map generation tuning. */
  mapGen:               MapGenConfig;
  /** Map dimension presets by size name. */
  mapSizes:             Record<string, { width: number; height: number }>;
  /** Default map size preset name. */
  defaultMapSize:       string;
  /** How long (ms) before an unread sensory event expires from a character's buffer. */
  sensoryBufferTimeoutMs:    number;
  /** Cooldown (ms) before the same entity can fire another proximity event for the same character. */
  sensoryProximityCooldownMs: number;
  /** Gameplay constants (health conditions, plow, speech, emotions, etc.). */
  gameplay: GameplayConfig;
}

const DEFAULT_ISLAND_CONFIG: IslandConfig = {
  tickMs:               500,
  moveTickInterval:     2,
  hungerDrainPerSecond: 0.2,
  healthDrainPerSecond: 0.5,
  healthRegenPassive:   0.5,
  energyRegenPassive:   0.5,
  energyCosts: { moveStep: 1, moveStepOnPath: 0.5, plow: 8, harvest: 5, build: 10, interact: 5, craft: 3, eat: 0 },
  characterStats: { maxHealth: 100, maxHunger: 100, maxEnergy: 100 },
  equipmentSlots: ["hands", "head", "body", "legs", "feet"],
  sensoryBufferTimeoutMs:     10_000,
  sensoryProximityCooldownMs: 30_000,
  mapGen: {
    fillProbability:   0.55,
    smoothingPasses:   5,
    grassThreshold:    5,
    waterThreshold:    4,
    gapFillPasses:     10,
    lakeProbability:   0.30,
    lakeRadiusMin:     2,
    lakeRadiusMax:     4,
    vegetationDensity: 0.10,
    sandSeedProb:      0.07,
    sandGrowProb:      0.80,
    sandMaxDepth:      3,
    biomes: [
      { id: "forest", count: 2, radiusMin: 3, radiusMax: 6, vegetationDensity: 0.35 },
    ],
    lilyPadDensity:    0.25,
    gapFillThreshold:  3,
    biomeBorderMargin: 2,
    sandSeedDistance:   1,
    sandGrowProbWave3: 0.55,
    shorePadding:      5,
  },
  mapSizes: {
    very_small: { width: 120, height: 80  },
    small:      { width: 160, height: 110 },
    medium:     { width: 210, height: 140 },
    large:      { width: 280, height: 190 },
    very_large: { width: 400, height: 270 },
  },
  defaultMapSize: "medium",
  gameplay: {
    healthConditions: [
      { minPct: 80, label: "healthy"   },
      { minPct: 60, label: "scratched" },
      { minPct: 40, label: "damaged"   },
      { minPct: 20, label: "battered"  },
      { minPct:  1, label: "critical"  },
      { minPct:  0, label: "destroyed" },
    ],
    plow: { required: 40, baseDamage: 10, damagePerLevel: 30, minCost: 3, costReductionPerLevel: 5 },
    speech: { maxChars: 280, durationMs: 8000 },
    emotion: { defaultValue: 50, min: 0, max: 100 },
    tentRegenPerSecond: 5,
    startingInventory: [{ item: "rocks", qty: 1 }],
    scanNearbyRadius: 15,
    surroundingsRadius: 3,
    defaultEffectRadius: 3,
    animations: {
      slash:  { frames: 6, fps: 12 },
      thrust: { frames: 8, fps: 12 },
    },
  },
};

let _config: IslandConfig = loadIslandConfig();

/** Legacy mapGen fields from before the biome system. */
interface LegacyMapGen {
  forestCount?: number;
  forestRadiusMin?: number;
  forestRadiusMax?: number;
  forestVegetationDensity?: number;
}

function loadIslandConfig(): IslandConfig {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH_ISLAND, "utf-8")) as Partial<IslandConfig>;
    const rawMapGen = (raw.mapGen ?? {}) as Partial<MapGenConfig> & LegacyMapGen;
    const merged: MapGenConfig = { ...DEFAULT_ISLAND_CONFIG.mapGen, ...rawMapGen };

    // Backward compat: synthesize biomes from legacy forest fields if no biomes array provided
    if (!rawMapGen.biomes && (rawMapGen.forestCount !== undefined || rawMapGen.forestRadiusMin !== undefined)) {
      merged.biomes = [{
        id: "forest",
        count: rawMapGen.forestCount ?? 2,
        radiusMin: rawMapGen.forestRadiusMin ?? 3,
        radiusMax: rawMapGen.forestRadiusMax ?? 6,
        vegetationDensity: rawMapGen.forestVegetationDensity ?? 0.35,
      }];
    } else {
      merged.biomes = rawMapGen.biomes ?? DEFAULT_ISLAND_CONFIG.mapGen.biomes;
    }

    const rawGameplay = (raw.gameplay ?? {}) as Partial<GameplayConfig>;
    const mergedGameplay: GameplayConfig = {
      ...DEFAULT_ISLAND_CONFIG.gameplay,
      ...rawGameplay,
      plow:    { ...DEFAULT_ISLAND_CONFIG.gameplay.plow,    ...(rawGameplay.plow    ?? {}) },
      speech:  { ...DEFAULT_ISLAND_CONFIG.gameplay.speech,  ...(rawGameplay.speech  ?? {}) },
      emotion: { ...DEFAULT_ISLAND_CONFIG.gameplay.emotion, ...(rawGameplay.emotion ?? {}) },
      animations: { ...DEFAULT_ISLAND_CONFIG.gameplay.animations, ...(rawGameplay.animations ?? {}) },
    };

    return {
      ...DEFAULT_ISLAND_CONFIG,
      ...raw,
      energyCosts:    { ...DEFAULT_ISLAND_CONFIG.energyCosts,    ...(raw.energyCosts    ?? {}) },
      characterStats: { ...DEFAULT_ISLAND_CONFIG.characterStats, ...(raw.characterStats ?? {}) },
      equipmentSlots: raw.equipmentSlots ?? DEFAULT_ISLAND_CONFIG.equipmentSlots,
      mapGen:         merged,
      mapSizes:       { ...DEFAULT_ISLAND_CONFIG.mapSizes, ...(raw.mapSizes ?? {}) },
      gameplay:       mergedGameplay,
    };
  } catch {
    return { ...DEFAULT_ISLAND_CONFIG };
  }
}

export function reloadIslandConfig(): void {
  _config = loadIslandConfig();
}

export function getIslandConfig(): IslandConfig {
  return _config;
}
