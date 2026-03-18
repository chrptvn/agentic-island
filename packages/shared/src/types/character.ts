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

export interface CharacterState {
  id: string;
  x: number;
  y: number;
  stats: CharacterStats;
  inventory: InventoryItem[];
  equipment: EquipmentSlots;
  goal: string;
}
