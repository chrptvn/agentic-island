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

  private mapWidthPx = 0;
  private mapHeightPx = 0;
  private canvasW = 0;
  private canvasH = 0;

  constructor(options: CameraOptions = {}) {
    this._minZoom = options.minZoom ?? 0.5;
    this.maxZoom = options.maxZoom ?? 4.0;
    this.zoom = options.initialZoom ?? 1.0;
    this.scaleFactor = options.scaleFactor ?? 2;
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
   * Reset the camera to show the center of the map at the default zoom.
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
   * Clamp camera center so the visible area never extends beyond the map.
   * The center must stay at least halfVisible pixels from each edge.
   * If the map is smaller than the canvas on an axis, center on that axis.
   */
  private clamp(): void {
    if (this.mapWidthPx === 0 || this.mapHeightPx === 0) return;

    const s = this.scale;
    const halfVisW = this.canvasW / (2 * s);
    const halfVisH = this.canvasH / (2 * s);

    if (this.mapWidthPx <= halfVisW * 2) {
      // Map fits inside canvas horizontally — center it
      this.x = this.mapWidthPx / 2;
    } else {
      this.x = Math.max(halfVisW, Math.min(this.mapWidthPx - halfVisW, this.x));
    }

    if (this.mapHeightPx <= halfVisH * 2) {
      // Map fits inside canvas vertically — center it
      this.y = this.mapHeightPx / 2;
    } else {
      this.y = Math.max(halfVisH, Math.min(this.mapHeightPx - halfVisH, this.y));
    }
  }

  /**
   * Compute the zoom level at which the map exactly fills the canvas on
   * both axes (no void visible). Uses Math.max so the map covers the
   * canvas completely — one axis fits exactly, the other may be cropped.
   */
  private computeFillZoom(): number {
    if (this.mapWidthPx === 0 || this.mapHeightPx === 0 || this.canvasW === 0 || this.canvasH === 0) {
      return this._minZoom;
    }
    const fillZoom = Math.max(
      this.canvasW / (this.mapWidthPx * this.scaleFactor),
      this.canvasH / (this.mapHeightPx * this.scaleFactor),
    );
    return Math.max(this._minZoom, Math.min(this.maxZoom, fillZoom));
  }
}
