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
}

export interface IslandConfig {
  /** Game simulation tick interval in milliseconds. */
  tickMs:               number;
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
}

const DEFAULT_ISLAND_CONFIG: IslandConfig = {
  tickMs:               500,
  hungerDrainPerSecond: 0.2,
  healthDrainPerSecond: 0.5,
  healthRegenPassive:   0.5,
  energyRegenPassive:   0.5,
  energyCosts: { moveStep: 1, moveStepOnPath: 0.5, plow: 8, harvest: 5, build: 10, interact: 5, craft: 3, eat: 0 },
  characterStats: { maxHealth: 100, maxHunger: 100, maxEnergy: 100 },
  equipmentSlots: ["hands", "head", "body", "legs", "feet"],
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
    sandSeedProb:      0.25,
    sandGrowProb:      0.60,
    sandMaxDepth:      2,
  },
};

let _config: IslandConfig = loadIslandConfig();

function loadIslandConfig(): IslandConfig {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH_ISLAND, "utf-8")) as Partial<IslandConfig>;
    return {
      ...DEFAULT_ISLAND_CONFIG,
      ...raw,
      energyCosts:    { ...DEFAULT_ISLAND_CONFIG.energyCosts,    ...(raw.energyCosts    ?? {}) },
      characterStats: { ...DEFAULT_ISLAND_CONFIG.characterStats, ...(raw.characterStats ?? {}) },
      equipmentSlots: raw.equipmentSlots ?? DEFAULT_ISLAND_CONFIG.equipmentSlots,
      mapGen:         { ...DEFAULT_ISLAND_CONFIG.mapGen,         ...(raw.mapGen         ?? {}) },
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
