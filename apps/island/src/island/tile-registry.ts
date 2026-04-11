import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../..", "config", "tileset-compiled.json");

export interface TileDefinition {
  id: string;
  /** Sheet file path relative to sprites/. */
  sheet?: string;
  col: number;
  row: number;
  description: string;
  category: "terrain" | "water_transition" | "vegetation" | "item" | "structure" | "character";
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
  sheet?: string;
  tileSize: number;
  tileGap: number;
  sheets?: Record<string, SheetOverride>;
  tiles: TileDefinition[];
}

function loadConfig(): TilesetConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

const _config = loadConfig();

export const TILES: TileDefinition[] = [..._config.tiles];
export const TILE_BY_ID = new Map<string, TileDefinition>(TILES.map((t) => [t.id, t]));

// Default tile ID for procedurally generated terrain types
export const CHAR_TO_TILE: Record<string, string> = {
  ".": "grass",
  "#": "grass",
  "~": "water",
};

export const TILE_SIZE: number          = _config.tileSize;
export const TILE_GAP: number           = _config.tileGap;
export const TILE_SHEET: string         = _config.sheet ?? "";
export const SHEET_OVERRIDES: Record<string, SheetOverride> = _config.sheets ?? {};

export function CONFIG_PATH_TILES() { return CONFIG_PATH; }

