/**
 * In-memory tileset atlas builder.
 *
 * Reads tileset.json + source sprite sheet PNGs, extracts only the referenced
 * cells, composites them into a single atlas PNG buffer. Returns the compiled
 * TilesetConfig (remapped coords) and the atlas PNG as a Buffer.
 *
 * This replaces the old Python build-tileset.py script — no files written to disk.
 */

import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname2 = dirname(fileURLToPath(import.meta.url));

const CONFIG_DIR = join(__dirname2, "..", "..", "config");
const SPRITES_DIR = join(__dirname2, "..", "..", "sprites");
const SOURCE_JSON = join(CONFIG_DIR, "tileset.json");
const ENTITIES_JSON = join(CONFIG_DIR, "entities.json");

const ATLAS_TILE_SIZE = 32;
const ATLAS_TILE_GAP = 0;
const ATLAS_COLS = 32; // 32 columns → 1024px wide
const ATLAS_SHEET_NAME = "tileset-atlas.png";

// ── Source config types (tileset.json) ───────────────────────────────────────

interface SourceTile {
  id: string;
  sheet?: string;
  col: number;
  row: number;
  description?: string;
  category?: string;
  layer?: number;
  frames?: { col: number; row: number }[];
  fps?: number;
}

interface SourceConfig {
  sheet?: string;
  tileSize: number;
  tileGap: number;
  sheets?: Record<string, { tileSize?: number; tileGap?: number }>;
  tiles: SourceTile[];
}

// ── Compiled config types (output) ───────────────────────────────────────────

export interface CompiledTile {
  id: string;
  sheet: string;
  col: number;
  row: number;
  layer: number;
  category: string;
  description: string;
  frames?: { col: number; row: number }[];
  fps?: number;
}

export interface CompiledConfig {
  sheet: string;
  tileSize: number;
  tileGap: number;
  sheets: Record<string, { tileSize: number; tileGap: number }>;
  tiles: CompiledTile[];
}

export interface AtlasResult {
  config: CompiledConfig;
  png: Buffer;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTileSize(
  tile: SourceTile,
  config: SourceConfig,
): { tileSize: number; gap: number } {
  const sheet = tile.sheet ?? config.sheet ?? "";
  const override = config.sheets?.[sheet];
  const tileSize = override?.tileSize ?? config.tileSize;
  const gap = override?.tileGap ?? config.tileGap;
  return { tileSize, gap };
}

/**
 * Extract a single cell from a source sheet buffer and return it as a
 * 32×32 PNG buffer.
 */
async function extractCell(
  sheetBuf: Buffer,
  col: number,
  row: number,
  tileSize: number,
  gap: number,
): Promise<Buffer> {
  const x = col * (tileSize + gap);
  const y = row * (tileSize + gap);

  let cell = sharp(sheetBuf).extract({
    left: x,
    top: y,
    width: tileSize,
    height: tileSize,
  });

  if (tileSize !== ATLAS_TILE_SIZE) {
    cell = cell.resize(ATLAS_TILE_SIZE, ATLAS_TILE_SIZE, {
      kernel: sharp.kernel.nearest,
    });
  }

  return cell.png().toBuffer();
}

/**
 * Scale a 32×32 cell buffer down by `scale` (0–1) and center it on a
 * transparent 32×32 canvas.
 */
async function applyRenderScale(
  cellBuf: Buffer,
  scale: number,
): Promise<Buffer> {
  const s = Math.round(ATLAS_TILE_SIZE * scale);
  const offset = Math.round((ATLAS_TILE_SIZE - s) / 2);

  const resized = await sharp(cellBuf)
    .resize(s, s, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: ATLAS_TILE_SIZE,
      height: ATLAS_TILE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: offset, top: offset }])
    .png()
    .toBuffer();
}

/**
 * Load entities.json and return a map of tileId → renderScale for tiles
 * that have a custom render scale.
 */
function loadRenderScales(): Map<string, number> {
  const scales = new Map<string, number>();
  try {
    const raw = JSON.parse(readFileSync(ENTITIES_JSON, "utf-8"));
    const entities = Array.isArray(raw) ? raw : raw.entities ?? [];
    for (const ent of entities) {
      if (ent.renderScale != null && ent.renderScale > 0 && ent.renderScale < 1) {
        for (const t of ent.tiles ?? []) {
          scales.set(t.tileId, ent.renderScale);
        }
      }
    }
  } catch {
    // entities.json missing or malformed — no scales applied
  }
  return scales;
}

// ── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build the tileset atlas in memory.
 * Returns the compiled config and the atlas PNG buffer.
 */
export async function buildAtlas(): Promise<AtlasResult> {
  const config: SourceConfig = JSON.parse(
    readFileSync(SOURCE_JSON, "utf-8"),
  );

  // Cache loaded sheet buffers
  const sheetCache = new Map<string, Buffer>();
  function getSheet(sheetPath: string): Buffer {
    let buf = sheetCache.get(sheetPath);
    if (!buf) {
      buf = readFileSync(join(SPRITES_DIR, sheetPath));
      sheetCache.set(sheetPath, buf);
    }
    return buf;
  }

  // Collect all cells to extract
  interface CellRef {
    sheet: string;
    col: number;
    row: number;
    tileSize: number;
    gap: number;
    tileId: string;
  }
  const cells: CellRef[] = [];
  const tileMap = new Map<
    string,
    | { col: number; row: number }
    | { frames: { col: number; row: number }[] }
  >();

  for (const tile of config.tiles) {
    const sheet = tile.sheet ?? config.sheet ?? "";
    const { tileSize, gap } = getTileSize(tile, config);

    if (tile.frames) {
      const framePositions: { col: number; row: number }[] = [];
      for (const frame of tile.frames) {
        const idx = cells.length;
        cells.push({ sheet, col: frame.col, row: frame.row, tileSize, gap, tileId: tile.id });
        framePositions.push({
          col: idx % ATLAS_COLS,
          row: Math.floor(idx / ATLAS_COLS),
        });
      }
      tileMap.set(tile.id, { frames: framePositions });
    } else {
      const idx = cells.length;
      cells.push({ sheet, col: tile.col, row: tile.row, tileSize, gap, tileId: tile.id });
      tileMap.set(tile.id, {
        col: idx % ATLAS_COLS,
        row: Math.floor(idx / ATLAS_COLS),
      });
    }
  }

  const totalCells = cells.length;
  const atlasRows = Math.ceil(totalCells / ATLAS_COLS);
  const atlasW = ATLAS_COLS * ATLAS_TILE_SIZE;
  const atlasH = atlasRows * ATLAS_TILE_SIZE;

  // Load entity render scales
  const renderScales = loadRenderScales();

  // Extract all cells in parallel
  const rawBuffers = await Promise.all(
    cells.map((c) =>
      extractCell(getSheet(c.sheet), c.col, c.row, c.tileSize, c.gap),
    ),
  );

  // Apply renderScale where configured
  const cellBuffers = await Promise.all(
    rawBuffers.map((buf, idx) => {
      const scale = renderScales.get(cells[idx].tileId);
      if (scale != null) return applyRenderScale(buf, scale);
      return buf;
    }),
  );

  // Composite all cells onto the atlas canvas
  const overlays: sharp.OverlayOptions[] = cellBuffers.map((buf, idx) => ({
    input: buf,
    left: (idx % ATLAS_COLS) * ATLAS_TILE_SIZE,
    top: Math.floor(idx / ATLAS_COLS) * ATLAS_TILE_SIZE,
  }));

  const atlasPng = await sharp({
    create: {
      width: atlasW,
      height: atlasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();

  // Build compiled tile definitions
  const compiledTiles: CompiledTile[] = config.tiles.map((tile) => {
    const pos = tileMap.get(tile.id)!;

    const compiled: CompiledTile = {
      id: tile.id,
      sheet: ATLAS_SHEET_NAME,
      layer: (tile.layer ?? 0) as number,
      category: tile.category ?? "",
      description: tile.description ?? "",
      col: 0,
      row: 0,
    };

    if ("frames" in pos) {
      compiled.col = pos.frames[0].col;
      compiled.row = pos.frames[0].row;
      compiled.frames = pos.frames;
      compiled.fps = tile.fps ?? 10;
    } else {
      compiled.col = pos.col;
      compiled.row = pos.row;
    }

    return compiled;
  });

  const compiledConfig: CompiledConfig = {
    sheet: ATLAS_SHEET_NAME,
    tileSize: ATLAS_TILE_SIZE,
    tileGap: ATLAS_TILE_GAP,
    sheets: {
      [ATLAS_SHEET_NAME]: {
        tileSize: ATLAS_TILE_SIZE,
        tileGap: ATLAS_TILE_GAP,
      },
    },
    tiles: compiledTiles,
  };

  console.log(
    `[atlas] Built in-memory: ${config.tiles.length} tiles, ${totalCells} cells, ${ATLAS_COLS}×${atlasRows} = ${atlasW}×${atlasH}px (${(atlasPng.length / 1024).toFixed(0)}KB)`,
  );

  return { config: compiledConfig, png: atlasPng };
}
