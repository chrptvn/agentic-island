export type EntityStats = Record<string, number>;

export interface EntityInstance {
  x: number;
  y: number;
  tileId: string;
  stats: EntityStats;
  /** Human-readable display name for tooltips. */
  name?: string;
  /** Container entities (supply caches, log piles) may hold inventory items. */
  inventory?: { item: string; qty: number }[];
  /** Character IDs currently sheltered inside this entity (tents). */
  occupants?: string[];
}

export interface TilePlacement {
  dx: number;
  dy: number;
  layer: number;
  tileId: string;
}

export interface EntityDef {
  id: string;
  name?: string;
  tiles: TilePlacement[];
  blocks?: boolean;
  item?: boolean;
  spawn?: { weight: number };
}
