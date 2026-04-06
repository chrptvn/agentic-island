export interface InventoryItem {
  item: string;
  qty: number;
}

export type EquipmentSlots = Record<string, InventoryItem | null>;

export interface CharacterStats {
  health: number;
  hunger: number;
  energy: number;
  maxHealth: number;
  maxHunger: number;
  maxEnergy: number;
}

export type CharacterGender = "male" | "female";
export type CharacterFacing = "n" | "s" | "e" | "w";

export interface CharacterAppearance {
  gender: CharacterGender;
  skinColor: string;
}

export interface CharacterState {
  id: string;
  x: number;
  y: number;
  tileId?: string;
  hairTileId?: string;
  beardTileId?: string;
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
