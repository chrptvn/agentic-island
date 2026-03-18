import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../..", "config", "tileset.json");

export interface TileDefinition {
  id: string;
  /** Sheet file path relative to /public. Defaults to the top-level "sheet" value. */
  sheet?: string;
  col: number;
  row: number;
  description: string;
  category: "terrain" | "water_transition" | "vegetation" | "item" | "structure";
  /** Rendering layer: 0=base terrain, 1=water overlay, 2=entity base, 3=entity canopy */
  layer: 0 | 1 | 2 | 3;
  /** Additional frames for animated tiles. If present, the tile cycles through these frames. */
  frames?: { col: number; row: number }[];
  /** Animation speed in frames per second. Used when `frames` is defined. */
  fps?: number;
}

export interface SheetOverride {
  tileSize?: number;
  tileGap?: number;
}

interface TilesetConfig {
  sheet: string;
  tileSize: number;
  tileGap: number;
  /** Per-sheet overrides for tileSize/tileGap (keyed by sheet path relative to /public). */
  sheets?: Record<string, SheetOverride>;
  tiles: TileDefinition[];
}

function loadConfig(): TilesetConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

let _config = loadConfig();

export const TILES: TileDefinition[] = [..._config.tiles];
export const TILE_BY_ID = new Map<string, TileDefinition>(TILES.map((t) => [t.id, t]));

// Default tile ID for procedurally generated terrain types
export const CHAR_TO_TILE: Record<string, string> = {
  ".": "grass",
  "#": "grass",
  "~": "water",
};

export let TILE_SIZE     = _config.tileSize;
export let TILE_GAP      = _config.tileGap;
export let TILE_SHEET    = _config.sheet;
export let SHEET_OVERRIDES: Record<string, SheetOverride> = _config.sheets ?? {};

export function reloadTiles(): void {
  _config = loadConfig();
  TILES.length = 0;
  TILES.push(..._config.tiles);
  TILE_BY_ID.clear();
  for (const t of TILES) TILE_BY_ID.set(t.id, t);
  TILE_SIZE        = _config.tileSize;
  TILE_GAP         = _config.tileGap;
  TILE_SHEET       = _config.sheet;
  SHEET_OVERRIDES  = _config.sheets ?? {};
}

export function CONFIG_PATH_TILES() { return CONFIG_PATH; }

