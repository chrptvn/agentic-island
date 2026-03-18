export interface MapData {
  width: number;
  height: number;
  seed: number;
  terrain: string[][];
}

export interface TileDef {
  id: string;
  col: number;
  row: number;
  sheet: string;
  tileSize?: number;
  gap?: number;
  step?: number;
  frames?: number;
  fps?: number;
  category?: string;
  layer?: number;
}

export type TileRegistry = Record<string, TileDef>;

export interface MapGenConfig {
  fillProbability: number;
  smoothingPasses: number;
  grassThreshold: number;
  gapFillPasses: number;
  lakeProbability: number;
  vegetationDensity: number;
}

export interface WorldConfig {
  tickMs: number;
  hungerDrainPerSecond: number;
  healthDrainPerSecond: number;
  healthRegenPassive: number;
  energyRegenPassive: number;
  energyCosts: Record<string, number>;
  characterStats: {
    maxHealth: number;
    maxHunger: number;
    maxEnergy: number;
  };
  equipmentSlots: string[];
  mapGen: MapGenConfig;
}

export interface TileOverride {
  x: number;
  y: number;
  layer: number;
  tileId: string;
}

export interface WorldState {
  map: MapData;
  tileRegistry: TileRegistry;
  entities: import("./entity.js").EntityInstance[];
  characters: import("./character.js").CharacterState[];
  overrides: TileOverride[];
}
