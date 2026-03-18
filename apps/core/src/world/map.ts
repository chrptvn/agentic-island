export type TileType = "grass" | "water";

export interface MapOptions {
  width?: number;
  height?: number;
  seed?: number;
}

export interface Tile {
  x: number;
  y: number;
  type: TileType;
}

const DEFAULT_WIDTH = 30;
const DEFAULT_HEIGHT = 20;

export class WorldMap {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  private tiles: Map<string, TileType>;

  constructor(options: MapOptions = {}) {
    this.width = options.width ?? DEFAULT_WIDTH;
    this.height = options.height ?? DEFAULT_HEIGHT;
    this.seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.tiles = new Map();

    this.generate();
  }

  private generate(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.tiles.set(`${x},${y}`, "water");
      }
    }
  }

  getTile(x: number, y: number): Tile | null {
    const type = this.tiles.get(`${x},${y}`);
    if (type === undefined) return null;
    return { x, y, type };
  }

  iterateTerrain(): IterableIterator<[string, TileType]> {
    return this.tiles.entries();
  }

  setTile(x: number, y: number, type: TileType): void {
    this.tiles.set(`${x},${y}`, type);
  }

  /** Returns the map as a 2D grid of terrain types plus per-cell layer-1+ overlays.
   *  grid[y][x]       = "grass" | "water"  (layer-0 terrain)
   *  overlays["x,y"]  = [l1_tile_id, ...]  (layer-1 and above, sparse)
   */
  toJSON(overrides: Map<string, string[]> = new Map()) {
    const grid: string[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: string[] = [];
      for (let x = 0; x < this.width; x++) {
        const key = `${x},${y}`;
        const base = this.tiles.get(key) ?? "water";
        const ov = overrides.get(key);
        const terrain = (ov?.[0] && ov[0] !== "") ? ov[0] : base;
        row.push(terrain);
      }
      grid.push(row);
    }

    // Collect layer-1+ data (skip layer-0 which is already in grid)
    const overlays: Record<string, string[]> = {};
    for (const [key, layers] of overrides) {
      const upper = layers.slice(1);
      if (upper.some((l) => l && l !== "")) {
        overlays[key] = upper;
      }
    }

    return {
      width: this.width,
      height: this.height,
      seed: this.seed,
      grid,
      overlays,
    };
  }
}
