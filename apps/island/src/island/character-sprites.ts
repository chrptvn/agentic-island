/**
 * Character sprite helpers — catalog-driven, tag-based system.
 *
 * Sheets are 832×3456 (13 cols × 54 rows of 64×64 tiles).
 * Walk rows: 8=N, 9=W, 10=S, 11=E — 9 frames each.
 * Idle rows: 22=N, 23=W, 24=S, 25=E — 2 frames each.
 *
 * Layers rendered bottom-to-top: shadow → base → legs → body → hair.
 * Catalog loaded from characters/catalog.json at startup.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { CharacterAppearance, CharacterFacing, TileDef } from "@agentic-island/shared";
import type { CharacterInstance } from "./character-registry.js";

const __dirname2 = dirname(fileURLToPath(import.meta.url));

export const TILE_SIZE_LPC = 64;

// ── Catalog types ────────────────────────────────────────────────────────────

export interface CatalogEntry {
  id: string;
  path: string;
  layer: string;
  tags: string[];
}

interface CatalogFile {
  shadow: string;
  layers: string[];
  entries: CatalogEntry[];
}

// ── Load catalog ─────────────────────────────────────────────────────────────

const SPRITES_DIR = join(__dirname2, "..", "..", "sprites", "characters");
const catalogRaw = JSON.parse(readFileSync(join(SPRITES_DIR, "catalog.json"), "utf-8")) as CatalogFile;

export const CATALOG_ENTRIES: readonly CatalogEntry[] = catalogRaw.entries;
export const RENDER_LAYERS: readonly string[] = catalogRaw.layers;
const SHADOW_PATH = catalogRaw.shadow;

/** Sheet path prefix for sprite uploads (relative to sprites/ dir). */
const SHEET_PREFIX = "characters/";

function sheetPath(entryPath: string): string {
  return `${SHEET_PREFIX}${entryPath}`;
}

// ── Row mapping ──────────────────────────────────────────────────────────────

const WALK_ROW: Record<CharacterFacing, number> = { n: 8, w: 9, s: 10, e: 11 };
const IDLE_ROW: Record<CharacterFacing, number> = { n: 22, w: 23, s: 24, e: 25 };
const WALK_FRAME_COUNT = 9;
const IDLE_FRAME_COUNT = 2;

const FACINGS: CharacterFacing[] = ["n", "s", "e", "w"];

// ── Catalog query helpers ────────────────────────────────────────────────────

/** Get all entries for a given layer. */
export function entriesForLayer(layer: string): CatalogEntry[] {
  return CATALOG_ENTRIES.filter((e) => e.layer === layer);
}

/** Check if an entry has a specific tag. */
function hasTag(entry: CatalogEntry, tag: string): boolean {
  return entry.tags.includes(tag);
}

/** Filter entries compatible with a set of required tags (e.g. "gender:male"). */
export function filterByTags(entries: CatalogEntry[], requiredTags: string[]): CatalogEntry[] {
  return entries.filter((e) => {
    for (const req of requiredTags) {
      const [key] = req.split(":");
      // If entry has a tag for this key, it must match
      const entryTag = e.tags.find((t) => t.startsWith(`${key}:`));
      if (entryTag && entryTag !== req) return false;
    }
    return true;
  });
}

/** Get available genders from base layer entries. */
export function availableGenders(): string[] {
  const genders = new Set<string>();
  for (const e of entriesForLayer("base")) {
    const gTag = e.tags.find((t) => t.startsWith("gender:"));
    if (gTag) genders.add(gTag.split(":")[1]);
  }
  return [...genders];
}

// ── Tile ID helpers ──────────────────────────────────────────────────────────

export function layerTileId(catalogId: string, facing: CharacterFacing, action: "idle" | "walk"): string {
  return `char_${catalogId}_${action}_${facing}`;
}

export function shadowLayerTileId(facing: CharacterFacing, action: "idle" | "walk"): string {
  return `char_shadow_${action}_${facing}`;
}

// ── Random appearance ────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random appearance, filtering by gender tag for spawn defaults.
 * Each layer gets a random compatible entry. Layers with no matching entries are skipped.
 */
export function randomAppearance(): CharacterAppearance {
  const gender = pickRandom(availableGenders());
  const genderTag = `gender:${gender}`;
  const appearance: CharacterAppearance = {};

  for (const layer of RENDER_LAYERS) {
    if (layer === "shadow") continue; // shadow is universal
    const candidates = filterByTags(entriesForLayer(layer), [genderTag]);
    if (candidates.length > 0) {
      appearance[layer] = pickRandom(candidates).id;
    }
  }

  return appearance;
}

// ── Dynamic tile defs for active characters ──────────────────────────────────

/** Build a lookup from catalog entry id → sheet path. */
const entrySheetMap = new Map<string, string>();
for (const e of CATALOG_ENTRIES) {
  entrySheetMap.set(e.id, sheetPath(e.path));
}

function addTileDefsForEntry(
  defs: TileDef[],
  catalogId: string,
  entrySheet: string,
): void {
  for (const dir of FACINGS) {
    const walkRow = WALK_ROW[dir];
    const idleRow = IDLE_ROW[dir];

    // Idle (2 frames)
    defs.push({
      id: layerTileId(catalogId, dir, "idle"),
      col: 0, row: idleRow,
      sheet: entrySheet,
      tileSize: TILE_SIZE_LPC, gap: 0,
      frames: Array.from({ length: IDLE_FRAME_COUNT }, (_, i) => ({ col: i, row: idleRow })),
      category: "character", layer: 3,
    });

    // Walk (9 frames)
    defs.push({
      id: layerTileId(catalogId, dir, "walk"),
      col: 0, row: walkRow,
      sheet: entrySheet,
      tileSize: TILE_SIZE_LPC, gap: 0,
      frames: Array.from({ length: WALK_FRAME_COUNT }, (_, i) => ({ col: i, row: walkRow })),
      category: "character", layer: 3,
    });
  }
}

/**
 * Build TileDef entries for active characters.
 * Registers tiles for each unique catalog entry used, plus universal shadow.
 */
export function buildCharacterTileDefs(
  characters: Iterable<CharacterInstance>,
): TileDef[] {
  const seen = new Set<string>();
  const defs: TileDef[] = [];
  let shadowAdded = false;

  for (const c of characters) {
    // Add shadow tiles once
    if (!shadowAdded) {
      shadowAdded = true;
      const shadowSheet = sheetPath(SHADOW_PATH);
      for (const dir of FACINGS) {
        const walkRow = WALK_ROW[dir];
        const idleRow = IDLE_ROW[dir];
        defs.push({
          id: shadowLayerTileId(dir, "idle"),
          col: 0, row: idleRow,
          sheet: shadowSheet,
          tileSize: TILE_SIZE_LPC, gap: 0,
          frames: Array.from({ length: IDLE_FRAME_COUNT }, (_, i) => ({ col: i, row: idleRow })),
          category: "character", layer: 3,
        });
        defs.push({
          id: shadowLayerTileId(dir, "walk"),
          col: 0, row: walkRow,
          sheet: shadowSheet,
          tileSize: TILE_SIZE_LPC, gap: 0,
          frames: Array.from({ length: WALK_FRAME_COUNT }, (_, i) => ({ col: i, row: walkRow })),
          category: "character", layer: 3,
        });
      }
    }

    // Add tile defs for each layer's catalog entry
    for (const catalogId of Object.values(c.appearance)) {
      if (seen.has(catalogId)) continue;
      seen.add(catalogId);
      const sheet = entrySheetMap.get(catalogId);
      if (!sheet) continue;
      addTileDefsForEntry(defs, catalogId, sheet);
    }
  }

  return defs;
}

