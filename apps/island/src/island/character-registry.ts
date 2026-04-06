import { getIslandConfig } from "./island-config.js";
import type { CharacterAppearance, CharacterFacing } from "@agentic-island/shared";

export interface Point { x: number; y: number }

export type EquipmentSlot = string;
export type Equipment = Record<EquipmentSlot, { item: string; qty: number } | null>;

export function getEquipmentSlots(): EquipmentSlot[] {
  return getIslandConfig().equipmentSlots;
}

export function defaultEquipment(): Equipment {
  const eq: Equipment = {};
  for (const slot of getEquipmentSlots()) eq[slot] = null;
  return eq;
}

export interface CharacterStats {
  health:    number;
  maxHealth: number;
  hunger:    number;
  maxHunger: number;
  energy:    number;
  maxEnergy: number;
  inventory: unknown[];
  equipment: Equipment;
  goal:      string;
}

export interface CharacterSpeech {
  text:      string;
  expiresAt: number; // Unix ms timestamp
}

export interface CharacterInstance {
  id:      string;
  x:       number;
  y:       number;
  tileId:  string;
  hairTileId?:  string;
  beardTileId?: string;
  appearance: CharacterAppearance;
  facing:  CharacterFacing;
  stats:   CharacterStats;
  path:    { x: number; y: number }[];
  action:  string; // "idle" | "moving" | "searching"
  speech?: CharacterSpeech;
  /** "x,y" key of the tent base position when the character is inside a tent. */
  shelter?: string;
}

export function getDefaultCharacterStats(): CharacterStats {
  const cfg = getIslandConfig().characterStats;
  return {
    health:    cfg.maxHealth,
    maxHealth: cfg.maxHealth,
    hunger:    cfg.maxHunger,
    maxHunger: cfg.maxHunger,
    energy:    cfg.maxEnergy,
    maxEnergy: cfg.maxEnergy,
    inventory: [],
    equipment: defaultEquipment(),
    goal:      "",
  };
}

/** @deprecated Use getDefaultCharacterStats() instead */
export const DEFAULT_CHARACTER_STATS: CharacterStats = {
  health:    100,
  maxHealth: 100,
  hunger:    100,
  maxHunger: 100,
  energy:    100,
  maxEnergy: 100,
  inventory: [],
  equipment: { hands: null, head: null, body: null, legs: null, feet: null },
  goal:      "",
};
