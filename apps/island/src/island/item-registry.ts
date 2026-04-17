import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface HallucinationEffect {
  /** Emotion pole to target, e.g. "anxious", "glad", "happy". */
  emotionPole: string;
  /** How much to shift the emotion when the hallucination starts (reversed on expiry). */
  delta: number;
}

export interface HallucinationTrigger {
  /** How long the hallucination lasts in milliseconds. */
  durationMs: number;
  /** Which emotion poles are affected and by how much. */
  effects: HallucinationEffect[];
}

export interface EatDef {
  /** Hunger restored (can be negative for nausea). Default 0. */
  hunger?: number;
  /** Direct health change (negative = damage, e.g. poison). Default 0. */
  health?: number;
  /** Energy change. Default 0. */
  energy?: number;
  /** Emotion deltas applied to the eater. */
  emotions?: { key: string; delta: number }[];
  /** Sensory message added to the eater's buffer. */
  message?: string;
  /** Sensory message added to nearby characters' buffers. */
  nearbyMessage?: string;
  /** Whether the item is consumed (removed from inventory). Default true. */
  consume?: boolean;
  /** If present, triggers a hallucination effect for the given duration. */
  hallucination?: HallucinationTrigger;
}

export interface SpecialItemAction {
  /** The verb displayed in examine output and used as a key in use_item calls (e.g. "squish", "sniff", "wave"). */
  verb: string;
  /** Short description shown by examine_item. */
  description: string;
  /** Sensory message added to the actor's buffer. */
  message?: string;
  /** Sensory message added to nearby characters' buffers. */
  nearbyMessage?: string;
  /** Chebyshev radius for nearby effects. Default 3. */
  radius?: number;
  /** Permanent emotion deltas applied to nearby characters (and self if self: true). */
  emotionEffects?: { key: string; delta: number; self?: boolean }[];
}

export interface ItemDef {
  equippable: boolean;
  wearable:   "head" | "body" | "legs" | "feet" | null;
  /** Capability levels this item provides (e.g. { "chop": 1.0, "mine": 0.3 }).
   *  A value of 1.0 is full efficiency; lower values yield proportionally fewer resources. */
  capabilities?: Record<string, number>;
  /** If present, the item can be eaten to restore hunger. */
  eat?: EatDef;
  /** If true, the item is not rendered as a visual overlay when equipped in the hands slot. */
  hideWhenEquipped?: boolean;
  /** Configurable special interactions for this item (e.g. squish, sniff, wave). */
  special?: SpecialItemAction[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../..", "config", "item-defs.json");

function loadConfig(): Map<string, ItemDef> {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Record<string, ItemDef>;
  return new Map(Object.entries(raw));
}

const ITEM_DEFS: Map<string, ItemDef> = loadConfig();

const FALLBACK: ItemDef = { equippable: false, wearable: null };

export function getItemDef(item: string): ItemDef {
  return ITEM_DEFS.get(item) ?? FALLBACK;
}

export function isEquippable(item: string): boolean {
  return getItemDef(item).equippable;
}

export function isWearable(item: string, slot: string): boolean {
  return getItemDef(item).wearable === slot;
}

export function getCapabilities(item: string): string[] {
  const caps = getItemDef(item).capabilities ?? {};
  return Object.keys(caps).filter(k => (caps[k] ?? 0) > 0);
}

export function hasCapability(item: string, capability: string): boolean {
  return (getItemDef(item).capabilities?.[capability] ?? 0) > 0;
}

export function getCapabilityLevel(item: string, capability: string): number {
  return getItemDef(item).capabilities?.[capability] ?? 0;
}

export function getEatDef(item: string): EatDef | undefined {
  return getItemDef(item).eat;
}

export function isEdible(item: string): boolean {
  return getItemDef(item).eat !== undefined;
}

export function allItemDefs(): Map<string, ItemDef> {
  return ITEM_DEFS;
}

export function reloadItemDefs(): void {
  const fresh = loadConfig();
  ITEM_DEFS.clear();
  for (const [k, v] of fresh) ITEM_DEFS.set(k, v);
}

export function CONFIG_PATH_ITEMS() { return CONFIG_PATH; }
