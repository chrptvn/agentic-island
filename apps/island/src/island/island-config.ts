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
  /** How long (ms) before an unread sensory event expires from a character's buffer. */
  sensoryBufferTimeoutMs:    number;
  /** Cooldown (ms) before the same entity can fire another proximity event for the same character. */
  sensoryProximityCooldownMs: number;
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
    lilyPadDensity:          0.25,
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

    return {
      ...DEFAULT_ISLAND_CONFIG,
      ...raw,
      energyCosts:    { ...DEFAULT_ISLAND_CONFIG.energyCosts,    ...(raw.energyCosts    ?? {}) },
      characterStats: { ...DEFAULT_ISLAND_CONFIG.characterStats, ...(raw.characterStats ?? {}) },
      equipmentSlots: raw.equipmentSlots ?? DEFAULT_ISLAND_CONFIG.equipmentSlots,
      mapGen:         merged,
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
