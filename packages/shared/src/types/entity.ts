export type EntityStats = Record<string, number>;

export interface EntityInstance {
  x: number;
  y: number;
  tileId: string;
  stats: EntityStats;
  /** Container entities (chests, log piles, skulls) may hold inventory items. */
  inventory?: { item: string; qty: number }[];
}

export interface EntityDef {
  id: string;
  tileType: "single" | "two-tile";
  topTileId?: string;
  stats: EntityStats;
  harvest?: Record<string, unknown>;
  build?: Record<string, unknown>;
  interact?: Record<string, unknown>;
  container?: Record<string, unknown>;
  decay?: Record<string, unknown>;
  growthStages?: Record<string, unknown>[];
  blocks?: boolean;
  spawnWeight?: number;
}
