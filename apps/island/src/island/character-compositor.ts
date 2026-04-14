/**
 * Character compositor — composites LPC Character layers into a single
 * per-agent sprite sheet using sharp.
 *
 * Composite layout (64×64 tiles):
 *   Rows  0-3:  idle   (2 frames × 4 dirs)
 *   Rows  4-7:  walk   (9 frames × 4 dirs)
 *   Rows  8-11: slash  (6 frames × 4 dirs)
 *   Rows 12-15: thrust (8 frames × 4 dirs)
 *
 * Total: 576×1024 per agent
 */

import sharp from "sharp";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { CharacterAppearance } from "@agentic-island/shared";
import type { Equipment } from "./character-registry.js";

const __dirname2 = dirname(fileURLToPath(import.meta.url));

// ── Catalog types ────────────────────────────────────────────────────────────

interface AnimationDef {
  frames: number;
  fps: number;
}

interface LayerDef {
  order: number;
  required: boolean;
  items?: string[];
  pathTemplate: string;
  colors?: string[];
  colorKey?: string;
  colorableItems?: string[];
  colorPathTemplate?: string;
}

interface CharacterCatalog {
  tileSize: number;
  spriteDir: string;
  animations: Record<string, AnimationDef>;
  directionOrder: string[];
  compositeLayout: Record<string, { startRow: number }>;
  genders: string[];
  skinColors: string[];
  layers: Record<string, LayerDef>;
}

// ── Load catalog ─────────────────────────────────────────────────────────────

const CONFIG_DIR = join(__dirname2, "..", "..", "config");
const SPRITES_DIR = join(__dirname2, "..", "..", "sprites");

const catalog: CharacterCatalog = JSON.parse(
  readFileSync(join(CONFIG_DIR, "character-catalog.json"), "utf-8"),
);

const LPC_DIR = join(SPRITES_DIR, catalog.spriteDir);

export const TILE_SIZE = catalog.tileSize;
export const TILE_SIZE_128 = 128;
export const ANIMATIONS = catalog.animations;
export const COMPOSITE_LAYOUT = catalog.compositeLayout;
export const DIRECTION_ORDER = catalog.directionOrder;
export const GENDERS = catalog.genders;
export const SKIN_COLORS = catalog.skinColors;
export const LAYERS = catalog.layers;

/** Animations to include in composite, in row order */
const ANIM_ORDER = ["idle", "walk", "slash", "thrust"] as const;
type AnimName = (typeof ANIM_ORDER)[number];

/** Total rows = sum of 4 dirs per animation */
const TOTAL_ROWS = ANIM_ORDER.length * 4; // 16
/** Max frames across all animations (walk = 9) */
const MAX_COLS = Math.max(...ANIM_ORDER.map((a) => catalog.animations[a].frames));
/** Output dimensions */
const OUT_WIDTH = MAX_COLS * TILE_SIZE;  // 576
const OUT_HEIGHT = TOTAL_ROWS * TILE_SIZE; // 1024

// ── Slash_128 constants ──────────────────────────────────────────────────────

const SLASH128_FRAMES = catalog.animations.slash.frames; // 6
const SLASH128_DIRS = 4;
const SLASH128_WIDTH = SLASH128_FRAMES * TILE_SIZE_128; // 768
const SLASH128_HEIGHT = SLASH128_DIRS * TILE_SIZE_128;  // 512

// ── In-memory cache ──────────────────────────────────────────────────────────

interface CachedComposite {
  png: Buffer;
  hash: string;
}

const compositeCache = new Map<string, CachedComposite>();
const slash128Cache = new Map<string, CachedComposite>();

/** Build a cache key from appearance + wearable equipment (no hands — tools are separate) */
function cacheKey(appearance: CharacterAppearance, equipment: Equipment): string {
  const parts: string[] = [];
  // Appearance layers
  for (const key of Object.keys(catalog.layers).sort()) {
    parts.push(`${key}=${appearance[key] ?? ""}`);
  }
  // Color keys for colorable layers
  for (const layerDef of Object.values(catalog.layers)) {
    if (layerDef.colorKey) {
      parts.push(`${layerDef.colorKey}=${appearance[layerDef.colorKey] ?? ""}`);
    }
  }
  // Only wearable equipment slots affect the composited sprite (NOT hands)
  for (const slot of ["head", "body", "legs", "feet"]) {
    const eq = equipment[slot];
    parts.push(`eq:${slot}=${eq?.item ?? ""}`);
  }
  return parts.join("|");
}

// ── Sprite file loading ──────────────────────────────────────────────────────

/** Read a PNG file as a Buffer, or null if it doesn't exist */
function loadPng(path: string): Buffer | null {
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

function resolveLayerPath(
  layerName: string,
  layerDef: LayerDef,
  item: string | undefined,
  gender: string,
  anim: string,
  appearance: CharacterAppearance,
): string {
  // Choose the right template — colorable items get their own path template
  let template = layerDef.pathTemplate;
  if (item && layerDef.colorableItems && layerDef.colorPathTemplate && layerDef.colorableItems.includes(item)) {
    template = layerDef.colorPathTemplate;
  }

  let path = template;
  path = path.replace("{gender}", gender);
  path = path.replace("{anim}", anim);
  if (item) path = path.replace("{item}", item);

  // Substitute color placeholder if present
  if (path.includes("{color}")) {
    const color = (layerDef.colorKey ? appearance[layerDef.colorKey] : undefined)
      ?? layerDef.colors?.[0]
      ?? "brown";
    path = path.replace("{color}", color);
  }

  return join(LPC_DIR, path);
}

// ── Equipment → layer item mapping ──────────────────────────────────────────

/** Maps equipment slots to catalog layer names */
const EQUIP_TO_LAYER: Record<string, string> = {
  head: "headwear",
  body: "torso",
  legs: "legs",
  feet: "feet",
};

function getLayerItem(
  layerName: string,
  appearance: CharacterAppearance,
  equipment: Equipment,
): string | undefined {
  // Body and hair come from appearance
  if (layerName === "body" || layerName === "hair") {
    // Backward compat: passport UI previously stored skin color as "skinColor"
    if (layerName === "body" && !appearance[layerName] && appearance["skinColor"]) {
      return appearance["skinColor"];
    }
    return appearance[layerName];
  }
  // Clothing layers: prefer equipment, fall back to appearance defaults
  const equipSlot = Object.entries(EQUIP_TO_LAYER).find(([, v]) => v === layerName)?.[0];
  if (equipSlot) {
    const eq = equipment[equipSlot];
    if (eq) {
      const layer = catalog.layers[layerName];
      if (layer.items?.includes(eq.item)) return eq.item;
    }
    // Fall back to appearance default (e.g. tshirt, pants, shoes)
    return appearance[layerName];
  }
  return appearance[layerName];
}

// ── Compositing ──────────────────────────────────────────────────────────────

/**
 * Composite character layers into a single sprite sheet.
 * Tool overlays are NOT included — they are drawn at render time from
 * shared tool sprite sheets.
 */
export async function compositeCharacter(
  appearance: CharacterAppearance,
  equipment: Equipment,
): Promise<CachedComposite> {
  const key = cacheKey(appearance, equipment);
  const cached = compositeCache.get(key);
  if (cached) return cached;

  const gender = appearance.gender ?? "male";

  // Build the list of layer images to composite per animation
  const sortedLayers = Object.entries(catalog.layers)
    .sort(([, a], [, b]) => a.order - b.order);

  // Create a transparent base canvas
  const canvas = sharp({
    create: {
      width: OUT_WIDTH,
      height: OUT_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  // Collect all overlay inputs
  const overlays: sharp.OverlayOptions[] = [];

  for (const anim of ANIM_ORDER) {
    const layout = catalog.compositeLayout[anim];
    const startRow = layout.startRow;
    const animDef = catalog.animations[anim];

    for (const [layerName, layerDef] of sortedLayers) {
      const item = getLayerItem(layerName, appearance, equipment);

      // Skip non-required layers with no item
      if (!layerDef.required && !item) continue;
      if (layerName === "body" && !item) continue;

      const filePath = resolveLayerPath(
        layerName,
        layerDef,
        item,
        gender,
        anim,
        appearance,
      );

      const png = loadPng(filePath);
      if (!png) continue;

      // Extract only the frames we need (animation might be smaller than MAX_COLS)
      const srcWidth = animDef.frames * TILE_SIZE;
      const srcHeight = 4 * TILE_SIZE; // 4 directions

      // Crop the source if needed (source may be exactly srcWidth × srcHeight)
      const cropped = sharp(png)
        .extract({ left: 0, top: 0, width: srcWidth, height: srcHeight })
        .toBuffer();

      overlays.push({
        input: await cropped,
        left: 0,
        top: startRow * TILE_SIZE,
      });
    }
  }

  const result = await canvas.composite(overlays).png().toBuffer();

  // Generate a simple hash for cache-busting
  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(result).digest("hex").slice(0, 8);

  const entry: CachedComposite = { png: result, hash };
  compositeCache.set(key, entry);

  return entry;
}

/**
 * Invalidate cached composite for a character.
 * Call when appearance or equipment changes.
 */
export function invalidateComposite(
  appearance: CharacterAppearance,
  equipment: Equipment,
): void {
  const key = cacheKey(appearance, equipment);
  compositeCache.delete(key);
  slash128Cache.delete(key);
}

/** Clear all cached composites */
export function clearCompositeCache(): void {
  compositeCache.clear();
  slash128Cache.clear();
}

/**
 * Composite character layers for the slash_128 animation only.
 * Produces a 768×512 sheet (6 frames × 4 dirs at 128×128 per cell).
 * Uses the same cache key as the main composite (appearance + wearable equip).
 */
export async function compositeCharacterSlash128(
  appearance: CharacterAppearance,
  equipment: Equipment,
): Promise<CachedComposite> {
  const key = cacheKey(appearance, equipment);
  const cached = slash128Cache.get(key);
  if (cached) return cached;

  const gender = appearance.gender ?? "male";
  const sortedLayers = Object.entries(catalog.layers)
    .sort(([, a], [, b]) => a.order - b.order);

  const canvas = sharp({
    create: {
      width: SLASH128_WIDTH,
      height: SLASH128_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const overlays: sharp.OverlayOptions[] = [];

  for (const [layerName, layerDef] of sortedLayers) {
    const item = getLayerItem(layerName, appearance, equipment);
    if (!layerDef.required && !item) continue;
    if (layerName === "body" && !item) continue;

    const filePath = resolveLayerPath(layerName, layerDef, item, gender, "slash_128", appearance);
    const png = loadPng(filePath);
    if (!png) continue;

    const cropped = sharp(png)
      .extract({ left: 0, top: 0, width: SLASH128_WIDTH, height: SLASH128_HEIGHT })
      .toBuffer();

    overlays.push({ input: await cropped, left: 0, top: 0 });
  }

  const result = await canvas.composite(overlays).png().toBuffer();

  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(result).digest("hex").slice(0, 8);

  const entry: CachedComposite = { png: result, hash };
  slash128Cache.set(key, entry);

  return entry;
}

// ── Random appearance ────────────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random appearance from the catalog.
 * Returns a CharacterAppearance with gender, body (skin color), hair,
 * and default clothing for torso, legs, and feet.
 */
export function randomAppearance(): CharacterAppearance {
  const gender = pickRandom(catalog.genders);
  const skin = pickRandom(catalog.skinColors);
  const hair = pickRandom(catalog.layers.hair.items ?? ["buzzcut"]);

  return {
    gender,
    body: skin,
    hair,
    torso: "tshirt",
    legs: "pants",
    feet: "shoes",
  };
}
