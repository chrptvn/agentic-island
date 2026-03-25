/**
 * Main renderer orchestrator.
 *
 * Owns the render loop, sprite cache, camera, input handling, and composites
 * all layers plus overlays onto a single <canvas>.
 */

import type { WorldState, TileRegistry } from "@agentic-island/shared";
import { SpriteCache } from "./sprite-loader.js";
import { renderLayers, type LayerData, type Viewport } from "./layers.js";
import {
  drawCharacter,
  tickAnimation,
  createAnimationState,
  type AnimationState,
} from "./animation.js";
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
  /** Off-screen buffer for double-buffering (prevents visible clear flashes). */
  private buffer: OffscreenCanvas | null = null;
  private bufCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
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

  /** Optional callback invoked after each rendered frame. */
  onFrame?: () => void;

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
    this.ensureBuffer();
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

    const baseTileSize = this.tileSize;
    const scale = this.camera.scale;
    const effectiveTile = baseTileSize * scale;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // Ensure off-screen buffer matches canvas size
    this.ensureBuffer();
    const buf = this.bufCtx;
    if (!buf) return;

    buf.save();
    (buf as CanvasRenderingContext2D).imageSmoothingEnabled = false;

    // Clear the off-screen buffer (visible canvas is untouched)
    buf.clearRect(0, 0, w, h);

    const { map, tileRegistry, overrides, entities, characters } = this.state;

    // Compute viewport in output-pixel space (offsets already scaled & rounded)
    const viewport = this.camera.toViewport(w, h, baseTileSize);

    // Prepare layer data
    const layerData: LayerData = {
      terrain: map.terrain,
      overrides,
      entities,
    };

    // Render tile layers to off-screen buffer
    renderLayers(
      buf as CanvasRenderingContext2D,
      layerData,
      tileRegistry,
      this.sprites,
      viewport,
      effectiveTile,
      this.animState.frame,
      'water',
    );

    // Render characters to off-screen buffer
    for (const char of characters) {
      drawCharacter(
        buf as CanvasRenderingContext2D,
        char,
        tileRegistry,
        this.sprites,
        viewport,
        effectiveTile,
        this.animState.frame,
      );
    }

    buf.restore();

    // Atomic blit: copy completed frame to visible canvas (no intermediate blank)
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.buffer!, 0, 0);

    // Notify host (e.g. React) so it can update HTML overlays
    this.onFrame?.();
  }

  /** Resize the canvas. */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
    this.ensureBuffer();

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
    this.buffer = null;
    this.bufCtx = null;
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

  /**
   * Convert tile coordinates to canvas-pixel coordinates (center-top of tile).
   * Useful for positioning HTML overlays above characters.
   */
  tileToScreen(tileX: number, tileY: number): { x: number; y: number } {
    const world = this.camera.worldToScreen(
      (tileX + 0.5) * this.tileSize,
      tileY * this.tileSize,
      this.canvas.width,
      this.canvas.height,
    );
    return { x: world.x, y: world.y };
  }

  // ── Private ─────────────────────────────────────────────────────────

  /**
   * Ensure the off-screen buffer matches the visible canvas size.
   * Creates or resizes the buffer as needed for double-buffered rendering.
   */
  private ensureBuffer(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;
    if (this.buffer && this.buffer.width === w && this.buffer.height === h) return;

    this.buffer = new OffscreenCanvas(w, h);
    this.bufCtx = this.buffer.getContext("2d");
  }

  private loop(now: number): void {
    if (!this.running) return;
    this.render();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }
}
