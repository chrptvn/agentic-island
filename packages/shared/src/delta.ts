import type { EntityInstance } from "./types/entity.js";
import type { CharacterState } from "./types/character.js";

// ---------------------------------------------------------------------------
// Patch types
// ---------------------------------------------------------------------------

export interface EntityPatch {
  action: "upsert" | "remove";
  /** Composite key: "x,y" */
  key: string;
  entity?: EntityInstance;
}

export interface OverridePatch {
  action: "set" | "remove";
  x: number;
  y: number;
  layer: number;
  tileId?: string;
}

// ---------------------------------------------------------------------------
// Delta message (island → hub → viewer)
// ---------------------------------------------------------------------------

export interface StateDelta {
  tick: number;
  characters?: CharacterState[];
  entities?: EntityPatch[];
  overrides?: OverridePatch[];
}
