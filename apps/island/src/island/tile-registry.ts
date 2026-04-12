import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildAtlas, type CompiledConfig } from "./atlas-builder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../..", "config", "tileset.json");

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

// ── Mutable state populated by initTileRegistry() ────────────────────────────

export let TILES: TileDefinition[] = [];
export let TILE_BY_ID: Map<string, TileDefinition> = new Map();
export let TILE_SIZE: number = 32;
export let TILE_GAP: number = 0;
export let TILE_SHEET: string = "";
export let SHEET_OVERRIDES: Record<string, SheetOverride> = {};

/** Atlas PNG buffer (available after init) */
let _atlasPng: Buffer | null = null;

/** Get the atlas PNG buffer. Must call initTileRegistry() first. */
export function getAtlasPng(): Buffer {
  if (!_atlasPng) throw new Error("Tile registry not initialized — call initTileRegistry() first");
  return _atlasPng;
}

/**
 * Initialize the tile registry by building the atlas in-memory.
 * Must be called once at startup before using any exports.
 */
export async function initTileRegistry(): Promise<void> {
  const { config, png } = await buildAtlas();
  _applyConfig(config);
  _atlasPng = png;
}

function _applyConfig(config: CompiledConfig): void {
  TILES = config.tiles as TileDefinition[];
  TILE_BY_ID = new Map(TILES.map((t) => [t.id, t]));
  TILE_SIZE = config.tileSize;
  TILE_GAP = config.tileGap;
  TILE_SHEET = config.sheet ?? "";
  SHEET_OVERRIDES = config.sheets ?? {};
}

// Default tile ID for procedurally generated terrain types
export const CHAR_TO_TILE: Record<string, string> = {
  ".": "grass",
  "#": "grass",
  "~": "water",
};

export function CONFIG_PATH_TILES() { return CONFIG_PATH; }

