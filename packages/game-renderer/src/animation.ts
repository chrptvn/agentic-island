/**
 * Character and entity animation helpers.
 *
 * Characters animate with 2 frames at ~250 ms per frame (4 fps default).
 * Action animations (slash/thrust) use a per-character clock that resets to
 * frame 0 when the action starts, advancing at the action's own fps (12fps).
 * This is purely visual — no game logic is tied to animation frames.
 */

import type { CharacterState, TileRegistry } from "@agentic-island/shared";
import type { SpriteCache } from "./sprite-loader.js";
import type { Viewport } from "./layers.js";
import { drawTile } from "./layers.js";

/** Default character animation: 4 fps → ~250 ms per frame */
const DEFAULT_CHARACTER_FPS = 4;

/** Action animations run at 16 fps */
const ACTION_FPS = 16;

/** Character tile ID used in the registry */
const CHARACTER_TILE_ID = "human";

// ── Per-character action animation clocks (purely client-side / visual) ───────

interface CharActionClock {
  /** The body tile ID that triggered this clock (encodes action + facing). */
  tileKey: string;
  /** performance.now() when this action started. */
  startedAt: number;
  /** performance.now() at which the animation fully completes. */
  endTime: number;
  /** Total frames for this action (from body tile def at start time). */
  maxFrames: number;
  /** Snapshot of layerTiles captured when the action began. */
  cachedTiles: Record<string, string>;
}

const charActionClocks = new Map<string, CharActionClock>();

/**
 * Returns action state if an action animation is active or still finishing,
 * null otherwise.
 *
 * - If the body tile encodes an action (slash/thrust): start or continue the clock.
 * - If the body tile reverted to idle/walk but the clock hasn't expired: keep
 *   playing the cached action tiles until endTime.
 * - Once endTime is reached: clear the clock and return null.
 *
 * The returned `tiles` should replace `character.layerTiles` when drawing, so
 * the correct action sprites are used even after the server has sent idle state.
 */
function getActiveActionState(
  charId: string,
  bodyTileId: string,
  now: number,
  bodyMaxFrames: number,
  layerTiles: Record<string, string>,
): { frame: number; tiles: Record<string, string> } | null {
  const isSlash = bodyTileId.includes("_slash_") || bodyTileId.includes("_slash128_");
  const isThrust = bodyTileId.includes("_thrust_");
  const isAction = isSlash || isThrust;

  const existing = charActionClocks.get(charId);

  if (isAction) {
    if (!existing || existing.tileKey !== bodyTileId) {
      // New or changed action — start a fresh clock
      const duration = (bodyMaxFrames / ACTION_FPS) * 1000;
      charActionClocks.set(charId, {
        tileKey: bodyTileId,
        startedAt: now,
        endTime: now + duration,
        maxFrames: bodyMaxFrames,
        cachedTiles: { ...layerTiles },
      });
      return { frame: 0, tiles: layerTiles };
    }
    // Same action — advance frame
    const frame = Math.min(
      Math.floor(((now - existing.startedAt) * ACTION_FPS) / 1000),
      existing.maxFrames - 1,
    );
    return { frame, tiles: existing.cachedTiles };
  }

  // Not an action tile — check if we're still finishing a prior animation
  if (existing) {
    if (now < existing.endTime) {
      const frame = Math.min(
        Math.floor(((now - existing.startedAt) * ACTION_FPS) / 1000),
        existing.maxFrames - 1,
      );
      return { frame, tiles: existing.cachedTiles };
    }
    charActionClocks.delete(charId);
  }

  return null;
}

export interface AnimationState {
  frame: number;
  lastFrameTime: number;
}

/** Create a fresh animation state. */
export function createAnimationState(): AnimationState {
  return { frame: 0, lastFrameTime: 0 };
}

/** Large modulo so frame counters wrap cleanly without overflow. */
const FRAME_COUNTER_MAX = 10_000;

/** Get the current animation frame for a character based on elapsed time. */
export function getCharacterFrame(
  state: AnimationState,
  now: number,
  fps: number = DEFAULT_CHARACTER_FPS,
): number {
  const msPerFrame = 1000 / fps;
  const elapsed = now - state.lastFrameTime;
  if (elapsed >= msPerFrame) {
    return (state.frame + 1) % FRAME_COUNTER_MAX;
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
 *
 * `visualX` / `visualY` are optional fractional tile coordinates for smooth
 * interpolated movement. If omitted, `character.x / character.y` are used.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  character: CharacterState,
  registry: TileRegistry,
  sprites: SpriteCache,
  viewport: Viewport,
  tileSize: number,
  animFrame: number,
  visualX?: number,
  visualY?: number,
  now?: number,
): void {
  // Don't render characters sheltered inside tents
  if (character.shelter) return;

  const { startCol, startRow, offsetX, offsetY } = viewport;

  const charX = visualX ?? character.x;
  const charY = visualY ?? character.y;

  const screenCol = charX - startCol;
  const screenRow = charY - startRow;

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

  const renderNow = now ?? performance.now();
  const bodyTile = character.layerTiles?.body ?? "";

  // Draw layers: tool background → character body → tool foreground
  const LAYER_ORDER = ["toolBg", "body", "toolFg"];
  if (character.layerTiles) {
    const bodyDef = registry[bodyTile];
    const bodyMaxFrames = bodyDef?.frames?.length ?? 1;

    // Determine action state once — may override tiles if animation is finishing
    const actionState = getActiveActionState(
      character.id,
      bodyTile,
      renderNow,
      bodyMaxFrames,
      character.layerTiles,
    );
    const tilesToDraw = actionState?.tiles ?? character.layerTiles;

    for (const layer of LAYER_ORDER) {
      const tid = tilesToDraw[layer];
      if (tid && registry[tid]) {
        const def = registry[tid];
        const maxFrames = def.frames?.length ?? 1;
        const frame = actionState
          ? Math.min(actionState.frame, maxFrames - 1)
          : animFrame;
        const defTileSize = def.tileSize ?? 64;
        if (defTileSize > 64) {
          // Oversized tile (e.g. 128px): draw at native ratio, centered
          const ratio = defTileSize / 64;
          const dSize = Math.round(size * ratio);
          const offset = Math.round(size * (ratio - 1) / 2);
          drawTile(ctx, tid, registry, sprites, cx - offset, cy - offset, dSize, dSize, frame);
        } else {
          drawTile(ctx, tid, registry, sprites, cx, cy, size, size, frame);
        }
      }
    }
  } else {
    // Fallback for legacy characters without layerTiles
    drawTile(ctx, CHARACTER_TILE_ID, registry, sprites, cx, cy, size, size, animFrame);
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
      frame: (state.frame + 1) % FRAME_COUNTER_MAX,
      lastFrameTime: now,
    };
  }
  return state;
}
