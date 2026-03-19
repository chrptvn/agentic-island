/**
 * Main renderer orchestrator.
 *
 * Owns the render loop, sprite cache, and composites all layers plus overlays
 * onto a single <canvas>.
 */

import type { WorldState, TileRegistry, CharacterState } from "@agentic-island/shared";
import { SpriteCache } from "./sprite-loader.js";
import { renderLayers, type LayerData, type Viewport } from "./layers.js";
import {
  drawCharacter,
  tickAnimation,
  createAnimationState,
  type AnimationState,
} from "./animation.js";
import { drawHealthBar, drawSpeechBubble, drawNameLabel } from "./overlays.js";

const DEFAULT_TILE_SIZE = 16;
const DEFAULT_SCALE_FACTOR = 2;

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  /** Base tile size in pixels (default: 16) */
  tileSize?: number;
  /** Integer scale factor for pixel-perfect rendering (default: 2) */
  scaleFactor?: number;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites: SpriteCache;
  private tileSize: number;
  private scaleFactor: number;
  private animState: AnimationState;
  private state: WorldState | null = null;
  private running = false;
  private rafId = 0;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D rendering context");
    this.ctx = ctx;

    this.sprites = new SpriteCache();
    this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
    this.scaleFactor = options.scaleFactor ?? DEFAULT_SCALE_FACTOR;
    this.animState = createAnimationState();

    // Pixel-perfect rendering
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Load sprite sheets from URLs (Core local UI). */
  async loadSpritesFromUrls(
    sheets: Record<string, { url: string; tileSize?: number; gap?: number }>,
  ): Promise<void> {
    const promises = Object.entries(sheets).map(([name, cfg]) =>
      this.sprites.loadSheet(name, cfg.url, cfg.tileSize, cfg.gap),
    );
    await Promise.all(promises);
  }

  /** Load sprite sheets from base64 data (Hub viewer). */
  async loadSpritesFromData(
    sheets: Array<{
      name: string;
      data: string;
      mimeType: string;
      tileSize?: number;
      gap?: number;
    }>,
  ): Promise<void> {
    const promises = sheets.map((s) =>
      this.sprites.loadSheetFromData(s.name, s.data, s.mimeType, s.tileSize, s.gap),
    );
    await Promise.all(promises);
  }

  /** Update the world state (called on each WebSocket message). */
  setState(state: WorldState): void {
    this.state = state;
  }

  /** Start the render loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.animState = createAnimationState();
    this.loop(performance.now());
  }

  /** Stop the render loop. */
  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Render a single frame. Can be called manually or by the loop. */
  render(): void {
    // Skip render entirely when there's nothing to draw — this preserves
    // the last painted frame on the canvas (important during React StrictMode
    // remount where sprites are being reloaded from cache).
    if (!this.state || this.sprites.sheetCount === 0) return;

    const now = performance.now();
    this.animState = tickAnimation(this.animState, now);

    const ctx = this.ctx;
    const scale = this.scaleFactor;
    const ts = this.tileSize * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const { map, tileRegistry, overrides, entities, characters } = this.state;

    // Compute viewport (centered on the map for now)
    const viewCols = Math.ceil(this.canvas.width / ts);
    const viewRows = Math.ceil(this.canvas.height / ts);
    const viewport: Viewport = {
      startCol: 0,
      startRow: 0,
      cols: Math.min(viewCols, map.width),
      rows: Math.min(viewRows, map.height),
      offsetX: 0,
      offsetY: 0,
    };

    // Scale context for pixel-perfect tiles
    ctx.scale(scale, scale);

    const baseTileSize = this.tileSize;

    // Prepare layer data
    const layerData: LayerData = {
      terrain: map.terrain,
      overrides,
      entities,
    };

    // Render tile layers
    renderLayers(
      ctx,
      layerData,
      tileRegistry,
      this.sprites,
      viewport,
      baseTileSize,
      this.animState.frame,
    );

    // Render characters
    for (const char of characters) {
      drawCharacter(
        ctx,
        char,
        tileRegistry,
        this.sprites,
        viewport,
        baseTileSize,
        this.animState.frame,
      );
    }

    // Reset scale for overlays (they use screen-space pixels)
    ctx.restore();

    // Draw overlays at screen scale
    this.drawOverlays(characters, entities, tileRegistry, viewport, ts);
  }

  /** Resize the canvas. */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Clean up resources. */
  destroy(): void {
    this.stop();
    this.sprites.clear();
    this.state = null;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private loop(now: number): void {
    if (!this.running) return;
    this.render();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private drawOverlays(
    characters: CharacterState[],
    _entities: WorldState["entities"],
    _registry: TileRegistry,
    viewport: Viewport,
    tileSize: number,
  ): void {
    const ctx = this.ctx;

    for (const char of characters) {
      const screenCol = char.x - viewport.startCol;
      const screenRow = char.y - viewport.startRow;

      if (
        screenCol < -1 ||
        screenRow < -1 ||
        screenCol > viewport.cols ||
        screenRow > viewport.rows
      ) {
        continue;
      }

      const cx = screenCol * tileSize + viewport.offsetX + tileSize / 2;
      const cy = screenRow * tileSize + viewport.offsetY;

      // Health bar
      if (char.stats.health < char.stats.maxHealth) {
        drawHealthBar(
          ctx,
          char.stats.health,
          char.stats.maxHealth,
          cx,
          cy,
          tileSize * 0.8,
        );
      }

      // Name label below sprite
      drawNameLabel(ctx, char.id, cx, cy + tileSize + 1);

      // TODO: speech bubble rendering (requires speech state tracking)
    }
  }
}
