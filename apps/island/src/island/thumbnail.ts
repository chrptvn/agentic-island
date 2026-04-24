/**
 * Generates a small pixel-art thumbnail from the world's terrain grid.
 *
 * Each tile maps to a single color; the output is a base64-encoded PNG
 * suitable for embedding in the hub handshake payload.
 */

import { encodePNG } from "./png.js";

// Color palette (RGB)
const COLOR_WATER: [number, number, number] = [30, 64, 175]; // #1e40af
const COLOR_GRASS: [number, number, number] = [34, 197, 94]; // #22c55e
const COLOR_VEGETATION: [number, number, number] = [22, 101, 52]; // #166534
const COLOR_SAND: [number, number, number] = [217, 190, 127]; // #d9be7f

const SCALE = 2;

/**
 * Returns true if the tile ID represents vegetation / a tree / a blocking entity.
 * We check common prefixes from the entity and tile registries.
 */
function isVegetationTile(tileId: string): boolean {
  return (
    tileId.startsWith("tree_") ||
    tileId.startsWith("shrub") ||
    tileId.startsWith("bush") ||
    tileId.startsWith("flower") ||
    tileId.includes("blossom") ||
    tileId.startsWith("berry") ||
    tileId.startsWith("cotton") ||
    tileId === "oak" ||
    tileId === "pine"
  );
}

/**
 * Generate a pixel-art thumbnail PNG from terrain and entity data.
 *
 * @param grassGrid      2-D boolean grid from buildIslandLayer1: grassGrid[y][x]
 * @param overrides      Island overrides map: "x,y" → [layer0, layer1, ...]
 * @param width          Map width in tiles
 * @param height         Map height in tiles
 * @returns base64-encoded PNG string
 */
export function generateThumbnail(
  grassGrid: boolean[][],
  overrides: Map<string, string[]>,
  width: number,
  height: number,
): string {
  const imgW = width * SCALE;
  const imgH = height * SCALE;
  const rgb = new Uint8Array(imgW * imgH * 3);

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const isGrass = grassGrid[ty]?.[tx] ?? false;
      const key = `${tx},${ty}`;
      const layers = overrides.get(key);

      let color: [number, number, number];

      if (isGrass) {
        // Check for vegetation on entity layers (3+)
        const hasVegetation =
          layers &&
          layers.some(
            (tileId, i) => i >= 3 && tileId && isVegetationTile(tileId),
          );
        color = hasVegetation ? COLOR_VEGETATION : COLOR_GRASS;
      } else {
        // Non-grass: sand cells have sand_at_ on layer 1 with no water overlay on layer 2.
        // All water variants (water_at_, water_sand_at_, marsh_water_at_) render as water.
        const l1 = layers?.[1] ?? "";
        const l2 = layers?.[2] ?? "";
        const isSandCell =
          l1.startsWith("sand_at_") &&
          !l2.startsWith("water_at_") &&
          !l2.startsWith("water_sand_at_") &&
          !l2.startsWith("marsh_water_at_");
        color = isSandCell ? COLOR_SAND : COLOR_WATER;
      }

      // Fill SCALE×SCALE block
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const px = tx * SCALE + dx;
          const py = ty * SCALE + dy;
          const idx = (py * imgW + px) * 3;
          rgb[idx] = color[0];
          rgb[idx + 1] = color[1];
          rgb[idx + 2] = color[2];
        }
      }
    }
  }

  const pngBuf = encodePNG(imgW, imgH, rgb);
  return pngBuf.toString("base64");
}
