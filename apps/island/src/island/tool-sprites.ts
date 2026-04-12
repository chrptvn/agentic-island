/**
 * Shared tool sprite system — builds tool atlases at startup.
 *
 * Tools are rendered OVER characters at draw time (LPC principle), not
 * composited into per-character sheets.  Each tool has background and
 * foreground overlay sprites for its action animation (slash/thrust)
 * and optional walk overlays.
 *
 * Two atlases are built:
 *   - "tool-atlas.png"     — 64×64 px cells (64px tool actions + all walk overlays)
 *   - "tool-atlas-128.png" — 128×128 px cells (128px tool actions at native size)
 *
 * Tile ID format: `tool_{toolName}_{anim}_{layer}_{dir}`
 *   e.g. `tool_axe_slash_bg_s`, `tool_hoe_walk_fg_n`
 * Gender-specific: `tool_{toolName}_walk_fg_{gender}_{dir}`
 */

import sharp from "sharp";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { TileDef, CharacterFacing } from "@agentic-island/shared";

const __dirname2 = dirname(fileURLToPath(import.meta.url));

// ── Catalog types ────────────────────────────────────────────────────────────

interface AnimationDef {
  frames: number;
  fps: number;
}

interface ToolDef {
  action: "slash" | "thrust";
  pathPrefix: string;
  overlaySize: number;
}

interface ToolCatalog {
  tileSize: number;
  spriteDir: string;
  animations: Record<string, AnimationDef>;
  directionOrder: string[];
  compositeLayout: Record<string, { startRow: number }>;
  tools: Record<string, ToolDef>;
  toolItemMapping: Record<string, string>;
}

// ── Load catalog ─────────────────────────────────────────────────────────────

const CONFIG_DIR = join(__dirname2, "..", "..", "config");
const SPRITES_DIR = join(__dirname2, "..", "..", "sprites");

const catalog: ToolCatalog = JSON.parse(
  readFileSync(join(CONFIG_DIR, "character-catalog.json"), "utf-8"),
);

const LPC_DIR = join(SPRITES_DIR, catalog.spriteDir);
const TILE_SIZE = catalog.tileSize; // 64
const TILE_SIZE_128 = 128;

// Re-export tool mapping helpers
export function getToolForItem(itemId: string): ToolDef | undefined {
  const toolName = catalog.toolItemMapping[itemId];
  return toolName ? catalog.tools[toolName] : undefined;
}

export function getToolNameForItem(itemId: string): string | undefined {
  return catalog.toolItemMapping[itemId];
}

export const TOOL_ITEM_MAPPING = catalog.toolItemMapping;
export const TOOLS = catalog.tools;

// ── Sprite loading helpers ──────────────────────────────────────────────────

function loadPng(path: string): Buffer | null {
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

// ── Atlas constants ─────────────────────────────────────────────────────────

const ATLAS_COLS = 16;           // 16 × 64 = 1024px wide
const ATLAS_SHEET_NAME = "tool-atlas.png";
const ATLAS_128_COLS = 8;        // 8 × 128 = 1024px wide
const ATLAS_128_SHEET_NAME = "tool-atlas-128.png";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolAtlasResult {
  png: Buffer;
  tileDefs: TileDef[];
}

/** A sheet that has been loaded and is ready for frame extraction */
interface LoadedSheet {
  png: Buffer;
  toolName: string;
  anim: string;       // "slash" | "thrust" | "walk"
  layer: string;       // "bg" | "fg"
  gender?: string;     // "male" | "female"
  frameCount: number;
  dirCount: number;    // always 4 (n/w/s/e)
  fps: number;
  cellSize: number;    // 64 or 128
}

// ── Tile ID helpers ─────────────────────────────────────────────────────────

const FACINGS: CharacterFacing[] = ["n", "w", "s", "e"];
const DIR_TO_ROW: Record<CharacterFacing, number> = { n: 0, w: 1, s: 2, e: 3 };

export function toolTileId(
  toolName: string,
  anim: string,
  layer: string,
  dir: CharacterFacing,
  gender?: string,
): string {
  if (gender) return `tool_${toolName}_${anim}_${layer}_${gender}_${dir}`;
  return `tool_${toolName}_${anim}_${layer}_${dir}`;
}

// ── Build atlas from sheets ──────────────────────────────────────────────────

async function buildAtlasFromSheets(
  sheets: LoadedSheet[],
  cellSize: number,
  atlasCols: number,
  sheetName: string,
): Promise<ToolAtlasResult> {
  // Extract all cells from each sheet
  interface CellEntry { sheetIdx: number; col: number; row: number }
  const cells: CellEntry[] = [];

  for (let si = 0; si < sheets.length; si++) {
    const s = sheets[si];
    for (let dir = 0; dir < s.dirCount; dir++) {
      for (let f = 0; f < s.frameCount; f++) {
        cells.push({ sheetIdx: si, col: f, row: dir });
      }
    }
  }

  const totalCells = cells.length;
  if (totalCells === 0) {
    // Return a minimal 1×1 transparent atlas
    const emptyPng = await sharp({
      create: { width: cellSize, height: cellSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    return { png: emptyPng, tileDefs: [] };
  }

  const atlasRows = Math.ceil(totalCells / atlasCols);
  const atlasW = atlasCols * cellSize;
  const atlasH = Math.max(atlasRows, 1) * cellSize;

  // Extract each cell
  const cellBuffers = await Promise.all(
    cells.map(async (c) => {
      const srcPng = sheets[c.sheetIdx].png;
      return sharp(srcPng)
        .extract({
          left: c.col * cellSize,
          top: c.row * cellSize,
          width: cellSize,
          height: cellSize,
        })
        .png()
        .toBuffer();
    }),
  );

  // Composite onto single atlas canvas
  const overlays: sharp.OverlayOptions[] = cellBuffers.map((buf, idx) => ({
    input: buf,
    left: (idx % atlasCols) * cellSize,
    top: Math.floor(idx / atlasCols) * cellSize,
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

  // Build TileDefs with atlas coords
  const tileDefs: TileDef[] = [];
  let cellIdx = 0;

  for (const s of sheets) {
    for (const dir of FACINGS) {
      const dirRow = DIR_TO_ROW[dir];
      const dirStartIdx = cellIdx + dirRow * s.frameCount;
      const framePositions = Array.from({ length: s.frameCount }, (_, f) => {
        const idx = dirStartIdx + f;
        return {
          col: idx % atlasCols,
          row: Math.floor(idx / atlasCols),
        };
      });

      tileDefs.push({
        id: toolTileId(s.toolName, s.anim, s.layer, dir, s.gender),
        col: framePositions[0].col,
        row: framePositions[0].row,
        sheet: sheetName,
        tileSize: cellSize,
        gap: 0,
        frames: framePositions,
        fps: s.fps,
        category: "tool",
        layer: 3,
      });
    }
    cellIdx += s.dirCount * s.frameCount;
  }

  console.log(
    `[tool-atlas] ${sheetName}: ${tileDefs.length} tile defs, ${totalCells} cells, ${atlasCols}×${atlasRows} = ${atlasW}×${atlasH}px (${(atlasPng.length / 1024).toFixed(0)}KB)`,
  );

  return { png: atlasPng, tileDefs };
}

// ── Build tool atlases ───────────────────────────────────────────────────────

/**
 * Load all tool sheets and split them into two groups:
 *   - 64px sheets → tool-atlas.png
 *   - 128px action sheets → tool-atlas-128.png (native size, no scaling)
 */
async function loadAllToolSheets(): Promise<{ sheets64: LoadedSheet[]; sheets128: LoadedSheet[] }> {
  const sheets64: LoadedSheet[] = [];
  const sheets128: LoadedSheet[] = [];

  for (const [toolName, toolDef] of Object.entries(catalog.tools)) {
    const { action, pathPrefix, overlaySize } = toolDef;
    const toolDir = join(LPC_DIR, pathPrefix);
    if (!existsSync(toolDir)) continue;

    const sizeStr = overlaySize !== 64 ? `_${overlaySize}` : "";
    const actionAnim = catalog.animations[action];
    const walkAnim = catalog.animations.walk;

    // Action bg/fg — route to the correct atlas based on overlaySize
    const actionBg =
      loadPng(join(toolDir, `${action}${sizeStr}_background.png`)) ??
      loadPng(join(toolDir, `${action}_bg.png`)) ??
      loadPng(join(toolDir, `${action}_behind.png`));
    const actionFg =
      loadPng(join(toolDir, `${action}${sizeStr}_foreground.png`)) ??
      loadPng(join(toolDir, `${action}_fg.png`)) ??
      loadPng(join(toolDir, `${action}.png`));

    const targetSheets = overlaySize > 64 ? sheets128 : sheets64;

    if (actionBg) {
      targetSheets.push({
        png: actionBg,
        toolName, anim: action, layer: "bg",
        frameCount: actionAnim.frames, dirCount: 4, fps: actionAnim.fps,
        cellSize: overlaySize,
      });
    }
    if (actionFg) {
      targetSheets.push({
        png: actionFg,
        toolName, anim: action, layer: "fg",
        frameCount: actionAnim.frames, dirCount: 4, fps: actionAnim.fps,
        cellSize: overlaySize,
      });
    }

    // Walk overlays — always 64px, go into the 64px atlas
    const walkBg =
      loadPng(join(toolDir, "walk_background.png")) ??
      loadPng(join(toolDir, "walk_bg.png")) ??
      loadPng(join(toolDir, "walk_behind.png"));
    const walkFg =
      loadPng(join(toolDir, "walk_foreground.png")) ??
      loadPng(join(toolDir, "walk_fg.png")) ??
      loadPng(join(toolDir, "walk.png"));
    const walkMale = loadPng(join(toolDir, "walk_male.png"));
    const walkFemale = loadPng(join(toolDir, "walk_female.png"));

    if (walkBg) {
      sheets64.push({
        png: walkBg, toolName, anim: "walk", layer: "bg",
        frameCount: walkAnim.frames, dirCount: 4, fps: walkAnim.fps,
        cellSize: TILE_SIZE,
      });
    }
    if (walkMale || walkFemale) {
      if (walkMale) {
        sheets64.push({
          png: walkMale, toolName, anim: "walk", layer: "fg", gender: "male",
          frameCount: walkAnim.frames, dirCount: 4, fps: walkAnim.fps,
          cellSize: TILE_SIZE,
        });
      }
      if (walkFemale) {
        sheets64.push({
          png: walkFemale, toolName, anim: "walk", layer: "fg", gender: "female",
          frameCount: walkAnim.frames, dirCount: 4, fps: walkAnim.fps,
          cellSize: TILE_SIZE,
        });
      }
    } else if (walkFg) {
      sheets64.push({
        png: walkFg, toolName, anim: "walk", layer: "fg",
        frameCount: walkAnim.frames, dirCount: 4, fps: walkAnim.fps,
        cellSize: TILE_SIZE,
      });
    }
  }

  return { sheets64, sheets128 };
}

/** Build the 64px tool atlas. */
export async function buildToolAtlas(): Promise<ToolAtlasResult> {
  const { sheets64 } = await loadAllToolSheets();
  return buildAtlasFromSheets(sheets64, TILE_SIZE, ATLAS_COLS, ATLAS_SHEET_NAME);
}

/** Build the 128px tool atlas. */
export async function buildToolAtlas128(): Promise<ToolAtlasResult> {
  const { sheets128 } = await loadAllToolSheets();
  return buildAtlasFromSheets(sheets128, TILE_SIZE_128, ATLAS_128_COLS, ATLAS_128_SHEET_NAME);
}

// ── Module-level cache (populated by initToolAtlas) ─────────────────────────

let _toolAtlasPng: Buffer | null = null;
let _toolAtlas128Png: Buffer | null = null;
let _toolTileDefs: TileDef[] = [];

/** Initialize both tool atlases. Must be called once at startup. */
export async function initToolAtlas(): Promise<void> {
  const { sheets64, sheets128 } = await loadAllToolSheets();
  const result64 = await buildAtlasFromSheets(sheets64, TILE_SIZE, ATLAS_COLS, ATLAS_SHEET_NAME);
  const result128 = await buildAtlasFromSheets(sheets128, TILE_SIZE_128, ATLAS_128_COLS, ATLAS_128_SHEET_NAME);
  _toolAtlasPng = result64.png;
  _toolAtlas128Png = result128.png;
  _toolTileDefs = [...result64.tileDefs, ...result128.tileDefs];
}

/** Get the 64px tool atlas PNG buffer. Must call initToolAtlas() first. */
export function getToolAtlasPng(): Buffer {
  if (!_toolAtlasPng) throw new Error("Tool atlas not initialized — call initToolAtlas() first");
  return _toolAtlasPng;
}

/** Get the 128px tool atlas PNG buffer. Must call initToolAtlas() first. */
export function getToolAtlas128Png(): Buffer {
  if (!_toolAtlas128Png) throw new Error("Tool atlas not initialized — call initToolAtlas() first");
  return _toolAtlas128Png;
}

/** Get the cached tool tile definitions (atlas-relative coords). */
export function getToolTileDefs(): TileDef[] {
  return _toolTileDefs;
}

/** Get the set of all known tool tile IDs (for fast lookup). */
export function getToolTileIds(): Set<string> {
  return new Set(_toolTileDefs.map(d => d.id));
}

// ── Resolve tool tile IDs for a character's current state ────────────────────

/**
 * Compute tool overlay tile IDs for a character based on equipped item,
 * current animation action, facing, and gender.
 *
 * `registryHas` checks whether a tile ID exists in the registry, used to
 * resolve gender-specific vs generic walk tiles.
 *
 * Returns `{ toolBg?, toolFg? }` to merge into `layerTiles`.
 */
export function computeToolLayers(
  handsItem: string | undefined,
  action: string,
  facing: CharacterFacing,
  gender: string,
  registryHas: (id: string) => boolean,
): { toolBg?: string; toolFg?: string } {
  if (!handsItem) return {};

  const toolName = catalog.toolItemMapping[handsItem];
  if (!toolName) return {};
  const toolDef = catalog.tools[toolName];
  if (!toolDef) return {};

  const result: { toolBg?: string; toolFg?: string } = {};

  if (action === toolDef.action) {
    // Character is performing the tool's action animation (slash/thrust)
    const bgId = toolTileId(toolName, action, "bg", facing);
    const fgId = toolTileId(toolName, action, "fg", facing);
    if (registryHas(bgId)) result.toolBg = bgId;
    if (registryHas(fgId)) result.toolFg = fgId;
  } else if (action === "walk") {
    // Walk bg (thrust tools, weapons)
    const walkBgId = toolTileId(toolName, "walk", "bg", facing);
    if (registryHas(walkBgId)) result.toolBg = walkBgId;

    // Walk fg: prefer gender-specific (slash tools), fall back to generic
    const genderFg = toolTileId(toolName, "walk", "fg", facing, gender);
    const genericFg = toolTileId(toolName, "walk", "fg", facing);
    if (registryHas(genderFg)) result.toolFg = genderFg;
    else if (registryHas(genericFg)) result.toolFg = genericFg;
  }
  // idle: no tool overlay

  return result;
}
