/**
 * Character and entity animation helpers.
 *
 * Characters animate with 2 frames at ~250 ms per frame (4 fps default).
 */

import type { CharacterState, TileRegistry } from "@agentic-island/shared";
import type { SpriteCache } from "./sprite-loader.js";
import type { Viewport } from "./layers.js";
import { drawTile } from "./layers.js";

/** Default character animation: 4 fps → ~250 ms per frame */
const DEFAULT_CHARACTER_FPS = 4;

/** Character tile ID used in the registry */
const CHARACTER_TILE_ID = "human";

export interface AnimationState {
  frame: number;
  lastFrameTime: number;
}

/** Create a fresh animation state. */
export function createAnimationState(): AnimationState {
  return { frame: 0, lastFrameTime: 0 };
}

/** Get the current animation frame for a character based on elapsed time. */
export function getCharacterFrame(
  state: AnimationState,
  now: number,
  fps: number = DEFAULT_CHARACTER_FPS,
): number {
  const msPerFrame = 1000 / fps;
  const elapsed = now - state.lastFrameTime;
  if (elapsed >= msPerFrame) {
    return (state.frame + 1) % 2;
  }
  return state.frame;
}

/**
 * Draw a character sprite at its world position, mapped through the viewport.
 *
 * The character is drawn using the "human" tile from the registry with the
 * given animation frame.
 *
 * `tileSize` is the effective output tile size (base × scale), possibly
 * fractional.  Positions are snapped to integer pixels.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  character: CharacterState,
  registry: TileRegistry,
  sprites: SpriteCache,
  viewport: Viewport,
  tileSize: number,
  animFrame: number,
): void {
  const { startCol, startRow, offsetX, offsetY } = viewport;

  const screenCol = character.x - startCol;
  const screenRow = character.y - startRow;

  // Skip if outside visible viewport
  if (
    screenCol < -1 ||
    screenRow < -1 ||
    screenCol > viewport.cols ||
    screenRow > viewport.rows
  ) {
    return;
  }

  const cx = Math.round(screenCol * tileSize + offsetX);
  const cy = Math.round(screenRow * tileSize + offsetY);
  const size = Math.round(tileSize);

  // Draw base character sprite
  const tileId = character.tileId ?? CHARACTER_TILE_ID;
  drawTile(ctx, tileId, registry, sprites, cx, cy, size, size, animFrame);

  // Draw hair & beard overlays (before equipment so hats could cover hair)
  if (character.hairTileId && registry[character.hairTileId]) {
    drawTile(ctx, character.hairTileId, registry, sprites, cx, cy, size, size);
  }
  if (character.beardTileId && registry[character.beardTileId]) {
    drawTile(ctx, character.beardTileId, registry, sprites, cx, cy, size, size);
  }

  // Draw equipped items on top of character
  if (character.equipment) {
    for (const slot of Object.keys(character.equipment)) {
      const equip = character.equipment[slot];
      if (equip && registry[equip.item]) {
        drawTile(ctx, equip.item, registry, sprites, cx, cy, size, size);
      }
    }
  }
}

/**
 * Advance the animation clock. Returns a new AnimationState if the frame
 * changed, or the same state if not.
 */
export function tickAnimation(
  state: AnimationState,
  now: number,
  fps: number = DEFAULT_CHARACTER_FPS,
): AnimationState {
  const msPerFrame = 1000 / fps;
  const elapsed = now - state.lastFrameTime;
  if (elapsed >= msPerFrame) {
    return {
      frame: (state.frame + 1) % 2,
      lastFrameTime: now,
    };
  }
  return state;
}
