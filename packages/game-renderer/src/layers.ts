/**
 * 5-layer tile compositing engine.
 *
 * Layer 0 – Terrain (grass, stone, water)
 * Layer 1 – Ground cover / autotile
 * Layer 2 – Paths (dirt, etc.)
 * Layer 3 – Entity base sprites
 * Layer 4 – Entity canopy (tree tops, etc.)
 */

import type {
  TileRegistry,
  TileDef,
  TileOverride,
  EntityInstance,
} from "@agentic-island/shared";
import type { SpriteCache } from "./sprite-loader.js";

export interface LayerData {
  /** Layer 0: base terrain grid (row-major: terrain[y][x]) */
  terrain: string[][];
  /** Layers 0-4 overrides from DB */
  overrides: TileOverride[];
  /** Entities on the map (rendered on layers 3-4) */
  entities: EntityInstance[];
}

export interface Viewport {
  startCol: number;
  startRow: number;
  cols: number;
  rows: number;
  /** Pixel offset for sub-tile scrolling */
  offsetX: number;
  offsetY: number;
}

/**
 * Draw a single tile from the sprite sheet at the given canvas coordinates.
 *
 * Looks up the tile definition in the registry, finds the correct sprite
 * sheet, and blits the correct sub-rectangle (accounting for gap, col, row,
 * animation frames, and optional step).
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  tileId: string,
  registry: TileRegistry,
  sprites: SpriteCache,
  canvasX: number,
  canvasY: number,
  tileSize: number,
  frame: number = 0,
): void {
  const def: TileDef | undefined = registry[tileId];
  if (!def) return;

  if (!sprites.hasSheet(def.sheet)) return;
  const sheet = sprites.getSheet(def.sheet);

  const srcTileSize = def.tileSize ?? sheet.tileSize;
  const gap = def.gap ?? sheet.gap;

  // Determine the animation frame column offset
  const totalFrames = def.frames ?? 1;
  const step = def.step ?? 1;
  const animCol = totalFrames > 1 ? (frame % totalFrames) * step : 0;

  const srcX = (def.col + animCol) * (srcTileSize + gap);
  const srcY = def.row * (srcTileSize + gap);

  ctx.drawImage(
    sheet.image,
    srcX,
    srcY,
    srcTileSize,
    srcTileSize,
    canvasX,
    canvasY,
    tileSize,
    tileSize,
  );
}

/**
 * Render all 5 layers for the visible viewport.
 *
 * Composites layers bottom-to-top: terrain → ground cover → paths →
 * entity base → entity canopy.
 */
export function renderLayers(
  ctx: CanvasRenderingContext2D,
  layerData: LayerData,
  registry: TileRegistry,
  sprites: SpriteCache,
  viewport: Viewport,
  tileSize: number,
  frame: number,
): void {
  const { startCol, startRow, cols, rows, offsetX, offsetY } = viewport;
  const { terrain, overrides, entities } = layerData;

  // Build override lookup: "layer,x,y" → tileId
  const overrideMap = new Map<string, string>();
  for (const ov of overrides) {
    overrideMap.set(`${ov.layer},${ov.x},${ov.y}`, ov.tileId);
  }

  // Build entity lookup: "x,y" → EntityInstance
  const entityMap = new Map<string, EntityInstance>();
  for (const ent of entities) {
    entityMap.set(`${ent.x},${ent.y}`, ent);
  }

  // Render layers 0-4 in order
  for (let layer = 0; layer <= 4; layer++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const worldCol = startCol + c;
        const worldRow = startRow + r;
        const cx = c * tileSize + offsetX;
        const cy = r * tileSize + offsetY;

        // Check for override on this layer
        const overrideKey = `${layer},${worldCol},${worldRow}`;
        const overrideTile = overrideMap.get(overrideKey);

        if (overrideTile) {
          drawTile(ctx, overrideTile, registry, sprites, cx, cy, tileSize, frame);
          continue;
        }

        if (layer === 0) {
          // Base terrain from the grid
          const tileId = terrain[worldRow]?.[worldCol];
          if (tileId) {
            drawTile(ctx, tileId, registry, sprites, cx, cy, tileSize, frame);
          }
        } else if (layer === 3) {
          // Entity base layer
          const ent = entityMap.get(`${worldCol},${worldRow}`);
          if (ent) {
            drawTile(ctx, ent.tileId, registry, sprites, cx, cy, tileSize, frame);
          }
        } else if (layer === 4) {
          // Entity canopy: look up the entity def's topTileId via registry
          const ent = entityMap.get(`${worldCol},${worldRow}`);
          if (ent) {
            const def = registry[ent.tileId];
            // Two-tile entities have a canopy tile rendered one row above
            if (def && (def as TileDef & { topTileId?: string }).topTileId) {
              // TODO: resolve topTileId from EntityDef once available
            }
          }
        }
        // Layers 1 and 2 without overrides are empty (transparent)
      }
    }
  }
}
