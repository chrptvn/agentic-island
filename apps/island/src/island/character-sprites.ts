/**
 * Character sprite helpers for the LPC two-layer (body + head) system.
 *
 * Each idle sprite sheet is a 2×4 grid of 64×64 tiles:
 *   Row 0 = North, Row 1 = West, Row 2 = South, Row 3 = East
 *   Col 0 = frame 0, Col 1 = frame 1
 */

import type { CharacterAppearance, CharacterFacing, TileDef } from "@agentic-island/shared";
import type { CharacterInstance } from "./character-registry.js";

export const TILE_SIZE_LPC = 64;

/** Skin colors common to body and both head sets. */
export const SKIN_COLORS = [
  "amber", "black", "blue", "bright_green", "bronze", "brown", "dark_green",
  "fur_black", "fur_brown", "fur_copper", "fur_gold", "fur_grey", "fur_tan",
  "fur_white", "green", "lavender", "light", "olive", "pale_green", "taupe",
  "zombie_green",
] as const;

export type SkinColor = (typeof SKIN_COLORS)[number];

export const GENDERS = ["male", "female"] as const;

const FACING_ROW: Record<CharacterFacing, number> = {
  n: 0,
  w: 1,
  s: 2,
  e: 3,
};

// ── Tile ID helpers ──────────────────────────────────────────────────────────

export function bodyTileId(skinColor: string, facing: CharacterFacing): string {
  return `char_body_${skinColor}_${facing}`;
}

export function headTileId(
  gender: CharacterAppearance["gender"],
  skinColor: string,
  facing: CharacterFacing,
): string {
  return `char_head_${gender}_${skinColor}_${facing}`;
}

// ── Sheet path helpers ───────────────────────────────────────────────────────

export function bodySheetPath(skinColor: string): string {
  return `lpc-character-bases-v3_1/bodies/male/idle/${skinColor}.png`;
}

export function headSheetPath(
  gender: CharacterAppearance["gender"],
  skinColor: string,
): string {
  return `lpc-character-bases-v3_1/heads/human_${gender}/idle/${skinColor}.png`;
}

// ── Dynamic tile defs for active characters ──────────────────────────────────

const FACINGS: CharacterFacing[] = ["n", "s", "e", "w"];

/**
 * Build TileDef entries for the unique appearance combos among active
 * characters.  Returns only the tiles that aren't already in the static
 * registry, so callers should merge the result into the registry object.
 */
export function buildCharacterTileDefs(
  characters: Iterable<CharacterInstance>,
): TileDef[] {
  const seen = new Set<string>();
  const defs: TileDef[] = [];

  for (const c of characters) {
    const { gender, skinColor } = c.appearance;
    const key = `${gender}:${skinColor}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const dir of FACINGS) {
      const row = FACING_ROW[dir];

      // Body tile
      defs.push({
        id: bodyTileId(skinColor, dir),
        col: 0,
        row,
        sheet: bodySheetPath(skinColor),
        tileSize: TILE_SIZE_LPC,
        gap: 0,
        frames: [
          { col: 0, row },
          { col: 1, row },
        ],
        category: "character",
        layer: 3,
      });

      // Head tile
      defs.push({
        id: headTileId(gender, skinColor, dir),
        col: 0,
        row,
        sheet: headSheetPath(gender, skinColor),
        tileSize: TILE_SIZE_LPC,
        gap: 0,
        frames: [
          { col: 0, row },
          { col: 1, row },
        ],
        category: "character",
        layer: 3,
      });
    }
  }

  return defs;
}
