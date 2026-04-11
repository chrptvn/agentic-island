export interface InventoryItem {
  item: string;
  qty: number;
}

export type EquipmentSlots = Record<string, InventoryItem | null>;

export interface EmotionPair {
  /** Storage key (e.g. "enraged_glad"). */
  key: string;
  /** Adjective when value < 50 (e.g. "enraged"). */
  low: string;
  /** Adjective when value ≥ 50 (e.g. "glad"). */
  high: string;
}

export const EMOTION_PAIRS: EmotionPair[] = [
  { key: "enraged_glad",      low: "enraged",  high: "glad"      },
  { key: "anxious_confident", low: "anxious",  high: "confident" },
  { key: "sad_happy",         low: "sad",      high: "happy"     },
];

export interface CharacterStats {
  health: number;
  hunger: number;
  energy: number;
  maxHealth: number;
  maxHunger: number;
  maxEnergy: number;
  /** Bipolar emotion stats keyed by EmotionPair.key, each 0–100. */
  emotions?: Record<string, number>;
}

export type CharacterGender = "male" | "female";
export type CharacterFacing = "n" | "s" | "e" | "w";

/** Layer-based appearance: each key is a catalog layer name, value is the catalog entry id. */
export type CharacterAppearance = Record<string, string>;

/** Tile IDs for each rendered layer, computed from appearance + facing + action. */
export type CharacterLayerTiles = Record<string, string>;

export interface CharacterState {
  id: string;
  x: number;
  y: number;
  /** Per-layer tile IDs for rendering (shadow, base, legs, body, hair). */
  layerTiles: CharacterLayerTiles;
  appearance?: CharacterAppearance;
  facing?: CharacterFacing;
  stats: CharacterStats;
  inventory: InventoryItem[];
  equipment: EquipmentSlots;
  goal: string;
  speech?: { text: string; expiresAt: number };
  /** "x,y" key of the tent base position when the character is sheltered inside a tent. */
  shelter?: string;
}
