/**
 * Main renderer orchestrator.
 *
 * Owns the render loop, sprite cache, camera, input handling, and composites
 * all layers plus overlays onto a single <canvas>.
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
import { drawSpeechBubble } from "./overlays.js";
import { Camera, type CameraOptions } from "./camera.js";
import { InputHandler } from "./input.js";

const DEFAULT_TILE_SIZE = 16;
const DEFAULT_SCALE_FACTOR = 2;
const ZOOM_STEP = 1.25;

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  /** Base tile size in pixels (default: 16) */
  tileSize?: number;
  /** Integer scale factor for pixel-perfect rendering (default: 2) */
  scaleFactor?: number;
  /** Camera configuration (zoom limits, initial zoom). */
  camera?: CameraOptions;
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

  readonly camera: Camera;
  private input: InputHandler;
  private mapSizeSet = false;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D rendering context");
    this.ctx = ctx;

    this.sprites = new SpriteCache();
    this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
    this.scaleFactor = options.scaleFactor ?? DEFAULT_SCALE_FACTOR;
    this.animState = createAnimationState();

    this.camera = new Camera({ ...options.camera, scaleFactor: this.scaleFactor });
    this.input = new InputHandler({ camera: this.camera });
    this.input.attach(this.canvas);

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

    // Initialize camera position on first state with a map
    if (!this.mapSizeSet && state.map) {
      this.camera.setMapSize(state.map.width, state.map.height, this.tileSize);
      this.camera.reset(this.canvas.width, this.canvas.height);
      this.mapSizeSet = true;
    }
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
    const baseTileSize = this.tileSize;
    const scale = this.camera.scale;
    const effectiveTile = baseTileSize * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const { map, tileRegistry, overrides, entities, characters } = this.state;

    // Compute viewport in output-pixel space (offsets already scaled & rounded)
    const viewport = this.camera.toViewport(
      this.canvas.width,
      this.canvas.height,
      baseTileSize,
    );

    // No ctx.scale() — rendering is done in output pixel space to avoid
    // sub-pixel seams between tiles.

    // Prepare layer data
    const layerData: LayerData = {
      terrain: map.terrain,
      overrides,
      entities,
    };

    // Render tile layers (effectiveTile may be fractional; renderLayers
    // rounds per-tile positions to integers internally)
    renderLayers(
      ctx,
      layerData,
      tileRegistry,
      this.sprites,
      viewport,
      effectiveTile,
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
        effectiveTile,
        this.animState.frame,
      );
    }

    ctx.restore();

    // Draw overlays at screen scale
    this.drawOverlays(characters, entities, tileRegistry, viewport, effectiveTile);
  }

  /** Resize the canvas. */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;

    if (!this.mapSizeSet && this.state?.map) {
      // First resize with a known map — initialize camera
      this.camera.setMapSize(this.state.map.width, this.state.map.height, this.tileSize);
      this.camera.reset(width, height);
      this.mapSizeSet = true;
    } else if (this.mapSizeSet) {
      // Subsequent resizes — recalculate bounds (dynamic minZoom may change)
      this.camera.reset(width, height);
    }
  }

  /** Clean up resources. */
  destroy(): void {
    this.stop();
    this.input.detach();
    this.sprites.clear();
    this.state = null;
  }

  // ── Public camera controls ─────────────────────────────────────────

  /** Zoom in by one step, centered on the canvas. */
  zoomIn(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.camera.zoomAt(ZOOM_STEP, w / 2, h / 2, w, h);
  }

  /** Zoom out by one step, centered on the canvas. */
  zoomOut(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.camera.zoomAt(1 / ZOOM_STEP, w / 2, h / 2, w, h);
  }

  /** Reset camera to show the full map. */
  resetCamera(): void {
    this.camera.reset(this.canvas.width, this.canvas.height);
  }

  /**
   * Convert a screen-space point (relative to canvas bounding rect) to
   * integer tile coordinates. Useful for hit-testing from the host UI.
   */
  screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
    return this.camera.screenToTile(
      screenX,
      screenY,
      this.canvas.width,
      this.canvas.height,
      this.tileSize,
    );
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

      const cx = Math.round(screenCol * tileSize + viewport.offsetX) + Math.round(tileSize / 2);
      const cy = Math.round(screenRow * tileSize + viewport.offsetY);

      // TODO: speech bubble rendering (requires speech state tracking)
    }
  }
}
