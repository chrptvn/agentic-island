/**
 * Camera — manages viewport position and zoom for the game renderer.
 *
 * Coordinates are in "world pixels" (tile-grid units × tileSize). The camera
 * tracks a center point and a continuous zoom level.
 */

import type { Viewport } from "./layers.js";

export interface CameraOptions {
  /** Minimum zoom multiplier (default: 0.5) */
  minZoom?: number;
  /** Maximum zoom multiplier (default: 4.0) */
  maxZoom?: number;
  /** Initial zoom level (default: 1.0) */
  initialZoom?: number;
  /** Base scale factor for pixel-perfect rendering (default: 2) */
  scaleFactor?: number;
  /** Virtual margin around the map in tiles (default: 20) */
  mapMargin?: number;
}

export class Camera {
  /** World-pixel X of the camera center */
  x = 0;
  /** World-pixel Y of the camera center */
  y = 0;
  /** Current zoom multiplier (1.0 = native tile size) */
  zoom: number;

  private readonly _minZoom: number;
  readonly maxZoom: number;
  /** Base scale factor (e.g. 2 for 2× pixel-perfect rendering) */
  private readonly scaleFactor: number;
  /** Virtual margin around the map in tiles */
  private readonly mapMarginTiles: number;
  /** Virtual margin in world pixels (set by setMapSize) */
  private marginPx = 0;

  private mapWidthPx = 0;
  private mapHeightPx = 0;
  private canvasW = 0;
  private canvasH = 0;

  constructor(options: CameraOptions = {}) {
    this._minZoom = options.minZoom ?? 0.5;
    this.maxZoom = options.maxZoom ?? 4.0;
    this.zoom = options.initialZoom ?? 1.0;
    this.scaleFactor = options.scaleFactor ?? 2;
    this.mapMarginTiles = options.mapMargin ?? 20;
  }

  /**
   * Effective minimum zoom — the larger of the configured floor and the
   * zoom level at which the map exactly fills the canvas (no void visible).
   */
  get minZoom(): number {
    const fill = this.computeFillZoom();
    return Math.max(this._minZoom, fill);
  }

  /** Full output scale: scaleFactor × zoom. */
  get scale(): number {
    return this.scaleFactor * this.zoom;
  }

  /**
   * Inform the camera about the current map size so it can clamp correctly.
   * Call whenever the map changes.
   */
  setMapSize(mapWidth: number, mapHeight: number, tileSize: number): void {
    this.mapWidthPx = mapWidth * tileSize;
    this.mapHeightPx = mapHeight * tileSize;
    this.marginPx = this.mapMarginTiles * tileSize;
    this.clampZoom();
    this.clamp();
  }

  /**
   * Pan by a screen-space delta (canvas buffer pixels). Internally divides
   * by the full scale so the world moves at the expected rate.
   */
  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.scale;
    this.y -= dyScreen / this.scale;
    this.clamp();
  }

  /**
   * Zoom toward a screen point, keeping that point stationary in world
   * space (the standard "zoom-toward-cursor" UX).
   *
   * @param factor  Multiplicative zoom delta (>1 = zoom in, <1 = zoom out)
   * @param screenX Screen X of the anchor point (canvas buffer pixels)
   * @param screenY Screen Y of the anchor point (canvas buffer pixels)
   * @param canvasW Canvas buffer width
   * @param canvasH Canvas buffer height
   */
  zoomAt(
    factor: number,
    screenX: number,
    screenY: number,
    canvasW: number,
    canvasH: number,
  ): void {
    this.canvasW = canvasW;
    this.canvasH = canvasH;

    const oldZoom = this.zoom;
    const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, oldZoom * factor));
    if (newZoom === oldZoom) return;

    // World point under the cursor before zoom
    const worldBefore = this.screenToWorld(screenX, screenY, canvasW, canvasH);

    this.zoom = newZoom;

    // World point under the cursor after zoom (camera center unchanged)
    const worldAfter = this.screenToWorld(screenX, screenY, canvasW, canvasH);

    // Adjust camera so the world point stays under the cursor
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
    this.clamp();
  }

  /**
   * Convert a screen-space point (canvas buffer pixels) to world pixel
   * coordinates. Returns fractional values.
   */
  screenToWorld(
    screenX: number,
    screenY: number,
    canvasW: number,
    canvasH: number,
  ): { x: number; y: number } {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    const s = this.scale;
    const worldX = this.x + (screenX - canvasW / 2) / s;
    const worldY = this.y + (screenY - canvasH / 2) / s;
    return { x: worldX, y: worldY };
  }

  /**
   * Convert a screen-space point to integer tile coordinates for hit-testing.
   */
  screenToTile(
    screenX: number,
    screenY: number,
    canvasW: number,
    canvasH: number,
    tileSize: number,
  ): { tileX: number; tileY: number } {
    const world = this.screenToWorld(screenX, screenY, canvasW, canvasH);
    return {
      tileX: Math.floor(world.x / tileSize),
      tileY: Math.floor(world.y / tileSize),
    };
  }

  /**
   * Convert world-pixel coordinates to canvas-pixel (screen) coordinates.
   * Inverse of screenToWorld.
   */
  worldToScreen(
    worldX: number,
    worldY: number,
    canvasW: number,
    canvasH: number,
  ): { x: number; y: number } {
    const s = this.scale;
    return {
      x: (worldX - this.x) * s + canvasW / 2,
      y: (worldY - this.y) * s + canvasH / 2,
    };
  }

  /** Jump camera center to a world-pixel position. */
  setCenter(worldX: number, worldY: number): void {
    this.x = worldX;
    this.y = worldY;
    this.clamp();
  }

  /** Center camera on a specific tile. */
  centerOnTile(col: number, row: number, tileSize: number): void {
    this.setCenter((col + 0.5) * tileSize, (row + 0.5) * tileSize);
  }

  /**
   * Reset the camera to show the full map (plus margin) centered in the
   * viewport. Uses fill-zoom so the entire world is visible by default.
   */
  reset(canvasW: number, canvasH: number): void {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.zoom = this.computeFillZoom();
    this.x = this.mapWidthPx / 2;
    this.y = this.mapHeightPx / 2;
    this.clamp();
  }

  /**
   * Compute a Viewport struct for the current camera state, suitable for
   * passing to `renderLayers` and `drawCharacter`.
   *
   * Offsets are returned in **output canvas pixels** (already scaled) so the
   * renderer can draw without `ctx.scale()`, eliminating sub-pixel seams.
   */
  toViewport(canvasW: number, canvasH: number, tileSize: number): Viewport {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    const s = this.scale;
    const effectiveTile = tileSize * s;

    // How many world pixels are visible on each axis
    const visibleW = canvasW / s;
    const visibleH = canvasH / s;

    // Top-left corner in world pixels
    const left = this.x - visibleW / 2;
    const top = this.y - visibleH / 2;

    // Top-left tile
    const startCol = Math.floor(left / tileSize);
    const startRow = Math.floor(top / tileSize);

    // Sub-tile offset in OUTPUT pixels, rounded to integer to avoid seams
    const offsetX = Math.round(-(left - startCol * tileSize) * s);
    const offsetY = Math.round(-(top - startRow * tileSize) * s);

    // How many tiles fit in the visible area (+ 2 for partial tiles on edges)
    const cols = Math.ceil(canvasW / effectiveTile) + 2;
    const rows = Math.ceil(canvasH / effectiveTile) + 2;

    return { startCol, startRow, cols, rows, offsetX, offsetY };
  }

  // ── Private ─────────────────────────────────────────────────────────

  /** Clamp zoom to the effective minimum (in case canvas/map changed). */
  private clampZoom(): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
  }

  /**
   * Clamp camera center so the visible area stays within the map plus
   * the virtual margin. The margin allows zooming out to see void space
   * around the map edges.
   */
  private clamp(): void {
    if (this.mapWidthPx === 0 || this.mapHeightPx === 0) return;

    const s = this.scale;
    const halfVisW = this.canvasW / (2 * s);
    const halfVisH = this.canvasH / (2 * s);
    const m = this.marginPx;

    const virtualW = this.mapWidthPx + 2 * m;
    const virtualH = this.mapHeightPx + 2 * m;

    if (virtualW <= halfVisW * 2) {
      this.x = this.mapWidthPx / 2;
    } else {
      this.x = Math.max(-m + halfVisW, Math.min(this.mapWidthPx + m - halfVisW, this.x));
    }

    if (virtualH <= halfVisH * 2) {
      this.y = this.mapHeightPx / 2;
    } else {
      this.y = Math.max(-m + halfVisH, Math.min(this.mapHeightPx + m - halfVisH, this.y));
    }
  }

  /**
   * Compute the zoom level at which the map (plus virtual margin) exactly
   * fills the canvas. The margin ensures the user can always zoom out to
   * see void space around the map edges.
   */
  private computeFillZoom(): number {
    const m = this.marginPx;
    const vw = this.mapWidthPx + 2 * m;
    const vh = this.mapHeightPx + 2 * m;
    if (vw === 0 || vh === 0 || this.canvasW === 0 || this.canvasH === 0) {
      return this._minZoom;
    }
    const fillZoom = Math.max(
      this.canvasW / (vw * this.scaleFactor),
      this.canvasH / (vh * this.scaleFactor),
    );
    return Math.max(this._minZoom, Math.min(this.maxZoom, fillZoom));
  }
}
