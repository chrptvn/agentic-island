/**
 * Main renderer orchestrator.
 *
 * Owns the render loop, sprite cache, camera, input handling, and composites
 * all layers plus overlays onto a single <canvas>.
 */

import type { IslandState, TileRegistry, CharacterState } from "@agentic-island/shared";
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

const DEFAULT_TILE_SIZE = 64;
const DEFAULT_SCALE_FACTOR = 1;
const ZOOM_STEP = 1.25;

/** Duration in ms over which a character smoothly moves one tile. */
const LERP_DURATION_MS = 400;

/** Cubic ease-out: fast start, smooth deceleration into the target tile. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface CharacterLerp {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  duration: number;
}

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
  private state: IslandState | null = null;
  private running = false;
  private rafId = 0;

  /** Per-character position interpolation state. */
  private lerpMap = new Map<string, CharacterLerp>();
  /** Last known integer tile positions (for detecting movement). */
  private lastPositions = new Map<string, { x: number; y: number }>();

  /** High-resolution overlay canvas for speech bubbles (crisp text). */
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

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

  /** Clear all cached sprite sheets so they can be reloaded. */
  clearSprites(): void {
    this.sprites.clear();
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
  setState(state: IslandState): void {
    const now = performance.now();

    // Detect character moves and start position lerps
    const incomingIds = new Set<string>();
    for (const char of state.characters) {
      incomingIds.add(char.id);
      const last = this.lastPositions.get(char.id);
      if (last && (last.x !== char.x || last.y !== char.y)) {
        // Character moved — lerp from current visual position to new tile
        const visual = this.getVisualPositionAt(char.id, now);
        this.lerpMap.set(char.id, {
          fromX: visual?.x ?? last.x,
          fromY: visual?.y ?? last.y,
          toX: char.x,
          toY: char.y,
          startTime: now,
          duration: LERP_DURATION_MS,
        });
      }
      this.lastPositions.set(char.id, { x: char.x, y: char.y });
    }

    // Clean up state for characters that left the map
    for (const id of this.lerpMap.keys()) {
      if (!incomingIds.has(id)) this.lerpMap.delete(id);
    }
    for (const id of this.lastPositions.keys()) {
      if (!incomingIds.has(id)) this.lastPositions.delete(id);
    }

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

    // Render tile layers 0-3 (terrain, ground cover, paths, entity bases)
    renderLayers(
      buf as CanvasRenderingContext2D,
      layerData,
      tileRegistry,
      this.sprites,
      viewport,
      effectiveTile,
      this.animState.frame,
      'water',
      0,
      3,
    );

    // Render characters with bilinear smoothing for cleaner LPC sprites
    (buf as CanvasRenderingContext2D).imageSmoothingEnabled = true;
    (buf as CanvasRenderingContext2D).imageSmoothingQuality = "medium";
    for (const char of characters) {
      const visual = this.getVisualPositionAt(char.id, now);
      drawCharacter(
        buf as CanvasRenderingContext2D,
        char,
        tileRegistry,
        this.sprites,
        viewport,
        effectiveTile,
        this.animState.frame,
        visual?.x,
        visual?.y,
      );
    }
    // Restore pixel-perfect rendering for canopy layer
    (buf as CanvasRenderingContext2D).imageSmoothingEnabled = false;

    // Render layer 4 (canopy) above characters for walk-under effect
    renderLayers(
      buf as CanvasRenderingContext2D,
      layerData,
      tileRegistry,
      this.sprites,
      viewport,
      effectiveTile,
      this.animState.frame,
      undefined,
      4,
      4,
    );

    buf.restore();

    // Atomic blit: copy completed frame to visible canvas (no intermediate blank)
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.buffer!, 0, 0);

    // Draw speech bubbles on the overlay canvas (high-res for crisp text)
    this.renderSpeechOverlays(characters, now);

    // Notify host (e.g. React) so it can update overlays and capture frames
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

  /** Access the underlying canvas element (e.g. for video recording). */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Access the overlay canvas (e.g. for video recording compositing). */
  getOverlayCanvas(): HTMLCanvasElement | null {
    return this.overlayCanvas;
  }

  /** Attach a high-resolution overlay canvas for speech bubbles. */
  setOverlayCanvas(canvas: HTMLCanvasElement | null): void {
    this.overlayCanvas = canvas;
    this.overlayCtx = canvas?.getContext("2d") ?? null;
  }

  /** Clean up resources. */
  destroy(): void {
    this.stop();
    this.input.detach();
    this.sprites.clear();
    this.state = null;
    this.buffer = null;
    this.bufCtx = null;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.lerpMap.clear();
    this.lastPositions.clear();
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

  /**
   * Return the current interpolated (fractional) tile position for a character.
   * Returns `null` if the character is unknown.
   * Use this for smooth camera follow and overlay positioning.
   */
  getVisualPosition(charId: string): { x: number; y: number } | null {
    return this.getVisualPositionAt(charId, performance.now());
  }

  // ── Private ─────────────────────────────────────────────────────────

  /**
   * Compute the interpolated visual position for a character at a given time.
   * Falls back to last known integer position when no lerp is active.
   */
  private getVisualPositionAt(charId: string, now: number): { x: number; y: number } | null {
    const lerp = this.lerpMap.get(charId);
    const last = this.lastPositions.get(charId);
    if (!last) return null;
    if (!lerp) return { x: last.x, y: last.y };

    const t = Math.min(1, (now - lerp.startTime) / lerp.duration);
    const e = easeOut(t);
    return {
      x: lerp.fromX + (lerp.toX - lerp.fromX) * e,
      y: lerp.fromY + (lerp.toY - lerp.fromY) * e,
    };
  }

  /**
   * Draw speech bubbles on the high-res overlay canvas.
   * Uses a scale transform so game-canvas coordinates map to overlay resolution,
   * giving text the same sharpness as HTML.
   */
  private renderSpeechOverlays(characters: CharacterState[], now: number): void {
    const ctx = this.overlayCtx;
    const overlay = this.overlayCanvas;
    if (!ctx || !overlay) return;

    const ow = overlay.width;
    const oh = overlay.height;
    ctx.clearRect(0, 0, ow, oh);

    const gw = this.canvas.width;
    const gh = this.canvas.height;
    if (gw === 0 || gh === 0) return;

    // Scale from game-canvas space to overlay space
    const sx = ow / gw;
    const sy = oh / gh;

    const dateNow = Date.now();

    for (const char of characters) {
      if (!char.speech?.text || char.speech.expiresAt <= dateNow) continue;
      if (char.shelter) continue; // hidden in tent

      const visual = this.getVisualPositionAt(char.id, now);
      if (!visual) continue;

      const screen = this.camera.worldToScreen(
        (visual.x + 0.5) * this.tileSize,
        visual.y * this.tileSize,
        gw,
        gh,
      );

      ctx.save();
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      drawSpeechBubble(ctx, char.speech.text, screen.x, screen.y, char.id);
      ctx.restore();
    }
  }

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
