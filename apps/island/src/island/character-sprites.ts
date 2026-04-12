/**
 * Character sprite helpers — LPC Characters system with server-side compositing.
 *
 * Each agent gets a single composite sprite sheet (576×1024) containing all
 * animations (idle, walk, slash, thrust). The compositor merges appearance
 * layers (body, feet, legs, torso, headwear, hair) into one PNG per agent.
 *
 * Composite layout (rows, 4 dirs each):
 *   0-3:   idle   (2 frames)
 *   4-7:   walk   (9 frames)
 *   8-11:  slash  (6 frames)
 *   12-15: thrust (8 frames)
 */

import type { CharacterAppearance, CharacterFacing, TileDef } from "@agentic-island/shared";
import type { CharacterInstance } from "./character-registry.js";
import {
  TILE_SIZE,
  TILE_SIZE_128,
  ANIMATIONS,
  COMPOSITE_LAYOUT,
  DIRECTION_ORDER,
  compositeCharacter,
  compositeCharacterSlash128,
  invalidateComposite,
  randomAppearance as compositorRandomAppearance,
} from "./character-compositor.js";

export { randomAppearance } from "./character-compositor.js";

// Re-export tile size
export const TILE_SIZE_LPC = TILE_SIZE;

// ── Animation types ──────────────────────────────────────────────────────────

export type AnimAction = "idle" | "walk" | "slash" | "slash128" | "thrust";

const FACINGS: CharacterFacing[] = ["n", "w", "s", "e"];
const DIR_TO_ROW_OFFSET: Record<CharacterFacing, number> = { n: 0, w: 1, s: 2, e: 3 };

// ── Tile ID helpers ──────────────────────────────────────────────────────────

/** Tile ID for a character's animation frame */
export function charTileId(charId: string, action: AnimAction, facing: CharacterFacing): string {
  return `char_${charId}_${action}_${facing}`;
}

/** For backwards compatibility */
export function layerTileId(charId: string, facing: CharacterFacing, action: "idle" | "walk"): string {
  return charTileId(charId, action, facing);
}

// ── Dynamic tile defs for active characters ──────────────────────────────────

const ANIM_ORDER: AnimAction[] = ["idle", "walk", "slash", "thrust"];

/**
 * Build TileDef entries for active characters.
 * Each character gets tile defs pointing to their composite sheet,
 * plus slash128 tile defs for the oversized slash animation.
 */
export function buildCharacterTileDefs(
  characters: Iterable<CharacterInstance>,
): TileDef[] {
  const defs: TileDef[] = [];

  for (const c of characters) {
    const sheetName = `char_${c.id}.png`;

    for (const anim of ANIM_ORDER) {
      const animDef = ANIMATIONS[anim];
      const layout = COMPOSITE_LAYOUT[anim];
      const startRow = layout.startRow;

      for (const dir of FACINGS) {
        const row = startRow + DIR_TO_ROW_OFFSET[dir];

        defs.push({
          id: charTileId(c.id, anim, dir),
          col: 0,
          row,
          sheet: sheetName,
          tileSize: TILE_SIZE,
          gap: 0,
          frames: Array.from({ length: animDef.frames }, (_, i) => ({
            col: i,
            row,
          })),
          fps: animDef.fps,
          category: "character",
          layer: 3,
        });
      }
    }

    // Slash128 tile defs — separate sheet at 128×128 per cell
    const slash128Sheet = `char_${c.id}_slash128.png`;
    const slashAnim = ANIMATIONS.slash;
    for (const dir of FACINGS) {
      const row = DIR_TO_ROW_OFFSET[dir];
      defs.push({
        id: charTileId(c.id, "slash128", dir),
        col: 0,
        row,
        sheet: slash128Sheet,
        tileSize: TILE_SIZE_128,
        gap: 0,
        frames: Array.from({ length: slashAnim.frames }, (_, i) => ({
          col: i,
          row,
        })),
        fps: slashAnim.fps,
        category: "character",
        layer: 3,
      });
    }
  }

  return defs;
}

/**
 * Composite a character's sprite sheet and return it as a SpriteAsset payload.
 * The sheet filename is `char_{charId}.png`.
 */
export async function buildCharacterSprite(
  character: CharacterInstance,
): Promise<{ filename: string; data: string; mimeType: string }> {
  const result = await compositeCharacter(character.appearance, character.stats.equipment);
  return {
    filename: `char_${character.id}.png`,
    mimeType: "image/png",
    data: result.png.toString("base64"),
  };
}

/**
 * Composite a character's slash_128 sheet (768×512, 128×128 per cell).
 * The sheet filename is `char_{charId}_slash128.png`.
 */
export async function buildCharacterSlash128Sprite(
  character: CharacterInstance,
): Promise<{ filename: string; data: string; mimeType: string }> {
  const result = await compositeCharacterSlash128(character.appearance, character.stats.equipment);
  return {
    filename: `char_${character.id}_slash128.png`,
    mimeType: "image/png",
    data: result.png.toString("base64"),
  };
}

/**
 * Invalidate a character's cached composite (call when equipment changes).
 */
export function invalidateCharacterComposite(character: CharacterInstance): void {
  invalidateComposite(character.appearance, character.stats.equipment);
}

// ── Render layers (for backwards compat) ─────────────────────────────────────

/** Render layers — with composites, there's just one: "body" */
export const RENDER_LAYERS: readonly string[] = ["body"];


