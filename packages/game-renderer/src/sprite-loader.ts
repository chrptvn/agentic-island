/**
 * Sprite sheet loading and caching for DawnLike-format tile sheets.
 *
 * Each sheet is a grid of tiles with a fixed tile size and optional gap
 * between tiles (common in DawnLike sprite sheets).
 */

export interface SpriteSheet {
  image: HTMLImageElement | ImageBitmap;
  tileSize: number;
  gap: number;
}

const DEFAULT_TILE_SIZE = 16;
const DEFAULT_GAP = 0;

export class SpriteCache {
  private sheets = new Map<string, SpriteSheet>();
  private loading = new Map<string, Promise<SpriteSheet>>();

  /** Load a sprite sheet from a URL. Deduplicates concurrent requests. */
  async loadSheet(
    name: string,
    url: string,
    tileSize: number = DEFAULT_TILE_SIZE,
    gap: number = DEFAULT_GAP,
  ): Promise<SpriteSheet> {
    const existing = this.sheets.get(name);
    if (existing) return existing;

    const inflight = this.loading.get(name);
    if (inflight) return inflight;

    const promise = new Promise<SpriteSheet>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const sheet: SpriteSheet = { image: img, tileSize, gap };
        this.sheets.set(name, sheet);
        this.loading.delete(name);
        resolve(sheet);
      };
      img.onerror = (_e) => {
        this.loading.delete(name);
        reject(new Error(`Failed to load sprite sheet "${name}" from ${url}`));
      };
      img.src = url;
    });

    this.loading.set(name, promise);
    return promise;
  }

  /** Load a sprite sheet from base64-encoded data (used by Hub viewer). */
  async loadSheetFromData(
    name: string,
    data: string,
    mimeType: string,
    tileSize: number = DEFAULT_TILE_SIZE,
    gap: number = DEFAULT_GAP,
  ): Promise<SpriteSheet> {
    const existing = this.sheets.get(name);
    if (existing) return existing;

    const inflight = this.loading.get(name);
    if (inflight) return inflight;

    const promise = new Promise<SpriteSheet>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const sheet: SpriteSheet = { image: img, tileSize, gap };
        this.sheets.set(name, sheet);
        this.loading.delete(name);
        resolve(sheet);
      };
      img.onerror = (_e) => {
        this.loading.delete(name);
        reject(new Error(`Failed to load sprite sheet "${name}" from data`));
      };
      img.src = `data:${mimeType};base64,${data}`;
    });

    this.loading.set(name, promise);
    return promise;
  }

  /** Get a cached sheet. Throws if not loaded. */
  getSheet(name: string): SpriteSheet {
    const sheet = this.sheets.get(name);
    if (!sheet) {
      throw new Error(
        `Sprite sheet "${name}" not loaded. Call loadSheet() first.`,
      );
    }
    return sheet;
  }

  /** Check if a sheet is loaded and cached. */
  hasSheet(name: string): boolean {
    return this.sheets.has(name);
  }

  /** Number of loaded sheets. */
  get sheetCount(): number {
    return this.sheets.size;
  }

  /** Clear all cached sheets. */
  clear(): void {
    this.sheets.clear();
    this.loading.clear();
  }
}
