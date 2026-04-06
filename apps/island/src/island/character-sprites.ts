/**
 * Character sprite helpers for the LPC Universal Sprite Sheet system.
 *
 * Sheets are 832×1344 (13 cols × 21 rows of 64×64 tiles).
 * Walk rows: 8=N, 9=W, 10=S, 11=E — 9 frames each.
 * Idle = walk frame 0 (static standing pose).
 *
 * Two overlay layers: base body + hair (same sheet dimensions, composited).
 */

import type { CharacterAppearance, CharacterFacing, TileDef } from "@agentic-island/shared";
import type { CharacterInstance } from "./character-registry.js";

export const TILE_SIZE_LPC = 64;

// ── Available options ────────────────────────────────────────────────────────

export const SKIN_COLORS = ["black", "brown", "olive", "peach", "white"] as const;
export type SkinColor = (typeof SKIN_COLORS)[number];

export const GENDERS = ["man", "woman"] as const;

export const HAIR_COLORS = [
  "blonde", "blue", "brunette", "green", "pink", "raven", "redhead", "white-blonde",
] as const;
export type HairColor = (typeof HAIR_COLORS)[number];

/** Hair style directory per gender (auto-selected). */
const HAIR_STYLE: Record<string, string> = {
  man: "plain-male",
  woman: "ponytail2-female",
};

// ── Walk row mapping (direction → sprite sheet row) ──────────────────────────

const WALK_ROW: Record<CharacterFacing, number> = {
  n: 8,
  w: 9,
  s: 10,
  e: 11,
};

const WALK_FRAME_COUNT = 9;

const FACINGS: CharacterFacing[] = ["n", "s", "e", "w"];

// ── Tile ID helpers ──────────────────────────────────────────────────────────

export function bodyTileId(gender: string, skinColor: string, facing: CharacterFacing, action: "idle" | "walk"): string {
  return `char_body_${gender}_${skinColor}_${action}_${facing}`;
}

export function hairTileId(gender: string, hairColor: string, facing: CharacterFacing, action: "idle" | "walk"): string {
  return `char_hair_${gender}_${hairColor}_${action}_${facing}`;
}

// ── Sheet path helpers ───────────────────────────────────────────────────────

export function bodySheetPath(gender: string, skinColor: string): string {
  return `lpc-characters/base/${gender}_${skinColor}.png`;
}

export function hairSheetPath(gender: string, hairColor: string): string {
  const style = HAIR_STYLE[gender] ?? "plain-male";
  return `lpc-characters/hair/${style}/${hairColor}.png`;
}

// ── Dynamic tile defs for active characters ──────────────────────────────────

/**
 * Build TileDef entries for the unique appearance combos among active
 * characters. Returns idle + walk tiles for each direction.
 */
export function buildCharacterTileDefs(
  characters: Iterable<CharacterInstance>,
): TileDef[] {
  const seen = new Set<string>();
  const defs: TileDef[] = [];

  for (const c of characters) {
    const { gender, skinColor, hairColor } = c.appearance;
    const key = `${gender}:${skinColor}:${hairColor}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const dir of FACINGS) {
      const walkRow = WALK_ROW[dir];

      // ── Body idle (single frame) ──────────────────────────────────────
      defs.push({
        id: bodyTileId(gender, skinColor, dir, "idle"),
        col: 0,
        row: walkRow,
        sheet: bodySheetPath(gender, skinColor),
        tileSize: TILE_SIZE_LPC,
        gap: 0,
        category: "character",
        layer: 3,
      });

      // ── Body walk (9 frames) ──────────────────────────────────────────
      defs.push({
        id: bodyTileId(gender, skinColor, dir, "walk"),
        col: 0,
        row: walkRow,
        sheet: bodySheetPath(gender, skinColor),
        tileSize: TILE_SIZE_LPC,
        gap: 0,
        frames: Array.from({ length: WALK_FRAME_COUNT }, (_, i) => ({ col: i, row: walkRow })),
        category: "character",
        layer: 3,
      });

      // ── Hair idle (single frame) ──────────────────────────────────────
      defs.push({
        id: hairTileId(gender, hairColor, dir, "idle"),
        col: 0,
        row: walkRow,
        sheet: hairSheetPath(gender, hairColor),
        tileSize: TILE_SIZE_LPC,
        gap: 0,
        category: "character",
        layer: 3,
      });

      // ── Hair walk (9 frames) ──────────────────────────────────────────
      defs.push({
        id: hairTileId(gender, hairColor, dir, "walk"),
        col: 0,
        row: walkRow,
        sheet: hairSheetPath(gender, hairColor),
        tileSize: TILE_SIZE_LPC,
        gap: 0,
        frames: Array.from({ length: WALK_FRAME_COUNT }, (_, i) => ({ col: i, row: walkRow })),
        category: "character",
        layer: 3,
      });
    }
  }

  return defs;
}
