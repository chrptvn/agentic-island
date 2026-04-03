/**
 * Auto-tiling engine for grass-island generation.
 *
 * Uses the RPG Maker 48-tile "blob" autotile system (Pipoya Type 3 tilesheets).
 * 8-bit neighbor bitmask (bit=1 → neighbor is SAME terrain) with diagonal
 * masking produces exactly 48 unique configurations per terrain transition.
 */

import { getAutotileId } from "./rpgmaker-autotile.js";

/**
 * Mulberry32 — fast, seedable 32-bit PRNG.
 * Returns a function that yields floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Returns the layer-1 water autotile ID for a water cell at (x, y).
 * Uses the full 8-neighbor bitmask → 48-tile Pipoya mapping.
 *
 * "Same terrain" for water = neighbor is also water (not grass/sand).
 *
 * @param isWater  Predicate: is the cell at (nx, ny) a water cell?
 *                 Out-of-bounds positions count as water (return true).
 */
function autotileWaterCell(
  x: number,
  y: number,
  isWater: (nx: number, ny: number) => boolean,
): string {
  return getAutotileId("water_at", x, y, isWater);
}

/**
 * Returns the layer-1 sand autotile ID for a sand cell at (x, y).
 * The sand tilesheet transitions against grass: "same" = sand, "different" = grass.
 *
 * @param isSand  Predicate: is the cell at (nx, ny) sand (or water)?
 *                Sand-water borders are handled by the water autotile,
 *                so water neighbors count as "same" for sand autotiling.
 */
function autotileSandCell(
  x: number,
  y: number,
  isSandOrWater: (nx: number, ny: number) => boolean,
): string {
  return getAutotileId("sand_at", x, y, isSandOrWater);
}

/**
 * Generate the full set of layer-1 tile overrides for an organic grass island.
 *
 * Algorithm (all steps seeded for determinism):
 *   1. Random init    — interior cells start as grass with 55% probability
 *   2. CA smoothing   — 5 passes: cell → grass if ≥5/8 neighbours are grass
 *   3. Flood-fill     — keep only the largest connected grass region
 *   4. Gap fill       — 10 passes: water cell with ≥3 grass cardinal neighbours → grass
 *   5. Lake (60%)     — carve a random water blob from deep-interior grass
 *
 * The existing autotileCell() handles arbitrary grass/water patterns so no
 * changes are needed there.
 */
/**
 * Terrain type for each cell during generation.
 * "grass" = land, "sand" = beach fringe, "water" = ocean/lake.
 */
type TerrainCell = "grass" | "sand" | "water";

export function buildIslandLayer1(
  w: number,
  h: number,
  seed = 0,
): { overrides: Array<{ x: number; y: number; layer: number; tileId: string }>; grassGrid: boolean[][] } {
  const rng = mulberry32(seed);
  const mapGen = getIslandConfig().mapGen;

  // ── 1. Random initialisation ──────────────────────────────────────────────
  // grid[y][x]: true = grass, false = water
  const grid: boolean[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) =>
      x > 0 && x < w - 1 && y > 0 && y < h - 1 && rng() < mapGen.fillProbability
    )
  );

  // ── 2. Cellular-automata smoothing ────────────────────────────────────────
  const neighbourGrassCount = (gx: number, gy: number): number => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue; // OOB = water
        if (grid[ny][nx]) n++;
      }
    }
    return n;
  };

  for (let pass = 0; pass < mapGen.smoothingPasses; pass++) {
    const next: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) continue; // border stays water
        const n = neighbourGrassCount(x, y);
        if (n >= mapGen.grassThreshold) next[y][x] = true;
        else if (n < mapGen.waterThreshold) next[y][x] = false;
        else next[y][x] = grid[y][x]; // no change
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y][x] = next[y][x];
  }

  // ── 3. Keep only the largest connected grass region ───────────────────────
  const visited = Array.from({ length: h }, () => Array(w).fill(false));
  const regions: Array<[number, number][]> = [];

  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (!grid[sy][sx] || visited[sy][sx]) continue;
      const region: [number, number][] = [];
      const queue: [number, number][] = [[sx, sy]];
      visited[sy][sx] = true;
      while (queue.length) {
        const [cx, cy] = queue.shift()!;
        region.push([cx, cy]);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (!grid[ny][nx] || visited[ny][nx]) continue;
          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
      regions.push(region);
    }
  }

  // Wipe all grass, then restore only the largest region
  for (let y = 0; y < h; y++) grid[y].fill(false);
  if (regions.length > 0) {
    const largest = regions.reduce((a, b) => (a.length >= b.length ? a : b));
    for (const [x, y] of largest) grid[y][x] = true;
  }

  // ── 4 & 6. Fill narrow water gaps (helper, called before and after lake) ──
  const cardinalGrassCount = (gx: number, gy: number): number => {
    let n = 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (grid[ny][nx]) n++;
    }
    return n;
  };

  const hasOppositeDiagGrass = (gx: number, gy: number): boolean => {
    const nw = grid[gy - 1]?.[gx - 1] ?? false;
    const se = grid[gy + 1]?.[gx + 1] ?? false;
    const ne = grid[gy - 1]?.[gx + 1] ?? false;
    const sw = grid[gy + 1]?.[gx - 1] ?? false;
    return (nw && se) || (ne && sw);
  };

  const fillGaps = () => {
    for (let pass = 0; pass < mapGen.gapFillPasses; pass++) {
      let changed = false;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!grid[y][x] && (cardinalGrassCount(x, y) >= 3 || hasOppositeDiagGrass(x, y))) {
            grid[y][x] = true;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  };

  fillGaps(); // ── 4. Before lake

  // ── 5. Optional lake ──────────────────────────────────────────────────────
  if (rng() < mapGen.lakeProbability) {
    const deep: [number, number][] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!grid[y][x]) continue;
        let allGrass = true;
        for (let dy = -1; dy <= 1 && allGrass; dy++)
          for (let dx = -1; dx <= 1 && allGrass; dx++)
            if (!grid[y + dy]?.[x + dx]) allGrass = false;
        if (allGrass) deep.push([x, y]);
      }
    }

    if (deep.length > 0) {
      const [lx, ly] = deep[Math.floor(rng() * deep.length)];
      const radius = mapGen.lakeRadiusMin + Math.floor(rng() * (mapGen.lakeRadiusMax - mapGen.lakeRadiusMin + 1));
      const lakeQ: [number, number, number][] = [[lx, ly, 0]];
      const lakeVis = new Set<string>();
      lakeVis.add(`${lx},${ly}`);
      while (lakeQ.length) {
        const [cx, cy, d] = lakeQ.shift()!;
        grid[cy][cx] = false;
        if (d >= radius) continue;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, ny = cy + dy;
          const key = `${nx},${ny}`;
          if (lakeVis.has(key)) continue;
          if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) continue;
          if (!grid[ny][nx]) continue;
          lakeVis.add(key);
          lakeQ.push([nx, ny, d + 1]);
        }
      }
    }
  }

  fillGaps(); // ── 6. After lake

  // ── 7. Generate sand beach fringe ─────────────────────────────────────────
  // Convert grass cells that are cardinally adjacent to water → sand
  const terrain: TerrainCell[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (grid[y][x] ? "grass" : "water") as TerrainCell)
  );

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (terrain[y][x] !== "grass") continue;
      let adjacentWater = false;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || terrain[ny][nx] === "water") {
          adjacentWater = true;
          break;
        }
      }
      if (adjacentWater && rng() < 0.85) {
        terrain[y][x] = "sand";
      }
    }
  }

  // ── 8. Build tile overrides ───────────────────────────────────────────────
  // For water autotile: bit=1 means neighbor is water (same terrain)
  const isWater = (nx: number, ny: number): boolean =>
    nx < 0 || nx >= w || ny < 0 || ny >= h || terrain[ny][nx] === "water";

  // For sand autotile: bit=1 means neighbor is sand or water (not grass)
  const isSandOrWater = (nx: number, ny: number): boolean =>
    nx < 0 || nx >= w || ny < 0 || ny >= h || terrain[ny][nx] !== "grass";

  const result: Array<{ x: number; y: number; layer: number; tileId: string }> = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = terrain[y][x];
      if (t === "grass") {
        result.push({ x, y, layer: 1, tileId: "grass" });
      } else if (t === "sand") {
        const tileId = autotileSandCell(x, y, isSandOrWater);
        result.push({ x, y, layer: 1, tileId });
      } else {
        // Water cell — only add overlay if it has any non-water neighbors
        // (pure interior water shows the layer-0 water tile)
        const hasLandNeighbor = !isWater(x-1,y) || !isWater(x+1,y) || !isWater(x,y-1) || !isWater(x,y+1)
          || !isWater(x-1,y-1) || !isWater(x+1,y-1) || !isWater(x-1,y+1) || !isWater(x+1,y+1);
        if (hasLandNeighbor) {
          const tileId = autotileWaterCell(x, y, isWater);
          result.push({ x, y, layer: 1, tileId });
        }
      }
    }
  }

  // grassGrid: true for grass AND sand (both are walkable land for vegetation/pathfinding)
  // However, sand cells should not spawn vegetation, so provide the original grass-only grid.
  return { overrides: result, grassGrid: grid };
}

// ── Dirt-path autotiling ──────────────────────────────────────────────────────

/**
 * Cardinal bitmask used for thin-path tile selection: T=1, R=2, B=4, L=8.
 * A bit is SET when that cardinal neighbour is also a path cell.
 */
const CARDINAL_TO_PATH_TILE: Record<number, string> = {
  0:  "path_none",
  1:  "path_t",
  2:  "path_r",
  3:  "path_tr",
  4:  "path_b",
  5:  "path_tb",
  6:  "path_rb",
  7:  "path_trb",
  8:  "path_l",
  9:  "path_tl",
  10: "path_rl",
  11: "path_trl",
  12: "path_bl",
  13: "path_tbl",
  14: "path_rbl",
  15: "path_all",
};

/**
 * Diagonal bitmask used when all 4 cardinal neighbours are path: NW=1, NE=2, SW=4, SE=8.
 * A bit is SET when that diagonal neighbour is also a path cell.
 */
const DIAGONAL_TO_PATH_TILE: Record<number, string> = {
  15: "path_inner_plain",
  14: "path_inner_corner_tl",  // NW missing
  13: "path_inner_corner_tr",  // NE missing
  11: "path_inner_corner_bl",  // SW missing
   7: "path_inner_corner_br",  // SE missing
  12: "path_inner_border_t",   // NW+NE missing
   3: "path_inner_border_b",   // SW+SE missing
  10: "path_inner_border_l",   // NW+SW missing
   5: "path_inner_border_r",   // NE+SE missing
};

const PATH_TILE_IDS = new Set<string>([
  ...Object.values(CARDINAL_TO_PATH_TILE),
  ...Object.values(DIAGONAL_TO_PATH_TILE),
]);

/** Returns true if the tile ID is a dirt-path overlay tile. */
export function isPathTileId(tileId: string): boolean {
  return PATH_TILE_IDS.has(tileId);
}

/** Returns true if the tile ID represents walkable ground (grass, sand, or any path tile). */
export function isWalkableGround(tileId: string): boolean {
  return tileId === "grass" || tileId.startsWith("sand_at_") || PATH_TILE_IDS.has(tileId);
}

/**
 * Determine the terrain type from a layer-1 tile ID.
 * Used by island.ts to classify cells for game logic.
 */
export function terrainFromLayer1(l1: string): "grass" | "sand" | "water" {
  if (l1 === "grass") return "grass";
  if (l1.startsWith("sand_at_")) return "sand";
  return "water";
}

/**
 * Returns the correct dirt-path layer-1 tile ID for cell (x, y).
 *
 * Single-tier logic: cardinal bitmask (T=1, R=2, B=4, L=8) → always use CARDINAL_TO_PATH_TILE.
 * The crossroads tile (path_all, mask=15) handles the "all 4 cardinals connected" case.
 *
 * @param isPath  Predicate returning true if cell (x, y) is a path cell.
 */
export function autotilePathCell(
  x: number,
  y: number,
  isPath: (x: number, y: number) => boolean,
  w: number,
  h: number,
): string {
  const t  = (y > 0)     && isPath(x,     y - 1) ? 1 : 0;
  const r  = (x < w - 1) && isPath(x + 1, y)     ? 1 : 0;
  const b  = (y < h - 1) && isPath(x,     y + 1) ? 1 : 0;
  const l  = (x > 0)     && isPath(x - 1, y)     ? 1 : 0;
  const cardinalMask = t | (r << 1) | (b << 2) | (l << 3);

  return CARDINAL_TO_PATH_TILE[cardinalMask];
}

import {
  ENTITY_DEFS,
  ENTITY_DEFAULTS,
  type EntityStats,
  applyRandomStats,
} from "./entity-registry.js";
import { getIslandConfig } from "./island-config.js";

/**
 * Scatter vegetation on inner grass cells using a seeded RNG.
 * Spawn candidates and their relative weights are driven by config/entities.json
 * (entities with a `spawn` block).
 *
 * Returns two lists:
 *  - tileOverrides: layer-2 trunk tiles + layer-3 canopy tiles (for tile_overrides table)
 *  - entityStats:   per-cell stats from ENTITY_DEFAULTS (for entity_stats table)
 *
 * @param w          Map width
 * @param h          Map height
 * @param seed       Map seed (offset internally so it doesn't clash with island RNG)
 * @param grassGrid  2-D boolean grid: grassGrid[y][x] === true → grass cell
 */
export function buildVegetationLayer(
  w: number,
  h: number,
  seed: number,
  grassGrid: boolean[][],
): {
  tileOverrides: Array<{ x: number; y: number; layer: number; tileId: string }>;
  entityStats:   Array<{ x: number; y: number; stats: EntityStats }>;
} {
  // Use a different seed offset so vegetation doesn't correlate with island shape
  const rng = mulberry32(seed ^ 0xdeadbeef);

  // ── Build weighted spawn pool from entity definitions ─────────────────────
  // Separate shallow (single or two-tile on inner cell) from deep (two-tile requiring deepInner).
  interface SpawnCandidate {
    id: string;
    topId?: string;
    requiresDeep: boolean;
  }

  const spawnPool: SpawnCandidate[] = [];
  const spawnWeights: number[] = [];

  for (const def of ENTITY_DEFS) {
    if (!def.spawn || def.spawn.weight <= 0) continue;
    spawnPool.push({
      id: def.id,
      topId: def.tileType === "two-tile" ? def.topTileId : undefined,
      requiresDeep: def.spawn.requiresDeep,
    });
    spawnWeights.push(def.spawn.weight);
  }

  const totalWeight = spawnWeights.reduce((a, b) => a + b, 0);

  function pickCandidate(allowDeep: boolean): SpawnCandidate | null {
    const eligible = spawnPool
      .map((c, i) => ({ c, w: spawnWeights[i] }))
      .filter(({ c }) => !c.requiresDeep || allowDeep);
    if (eligible.length === 0) return null;
    const total = eligible.reduce((s, { w }) => s + w, 0);
    let r = rng() * total;
    for (const { c, w } of eligible) {
      r -= w;
      if (r <= 0) return c;
    }
    return eligible[eligible.length - 1].c;
  }

  // Spawn density from config; individual entity likelihood is controlled by weight.
  const SPAWN_DENSITY = totalWeight > 0 ? getIslandConfig().mapGen.vegetationDensity : 0;

  const isG = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && grassGrid[y]?.[x] === true;

  // ── Classify cells ────────────────────────────────────────────────────────
  // "inner"     → all 4 cardinal neighbours are grass
  // "deepInner" → inner AND the cell directly above is also inner (room for canopy)
  const inner    = new Set<string>();
  const deepInner= new Set<string>();

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!isG(x, y)) continue;
      if (isG(x,y-1) && isG(x,y+1) && isG(x-1,y) && isG(x+1,y)) {
        const key = `${x},${y}`;
        inner.add(key);
        // canopy cell (x, y-1) must also be inner
        if (isG(x,y-2) && isG(x-1,y-1) && isG(x+1,y-1)) {
          deepInner.add(key);
        }
      }
    }
  }

  const tileOverrides: Array<{ x: number; y: number; layer: number; tileId: string }> = [];
  const entityStats:   Array<{ x: number; y: number; stats: EntityStats }> = [];
  const occupied       = new Set<string>(); // prevent overlapping entities

  for (const key of inner) {
    if (rng() >= SPAWN_DENSITY) continue;
    if (occupied.has(key)) continue;

    const [x, y] = key.split(",").map(Number);
    const allowDeep = deepInner.has(key);
    const candidate = pickCandidate(allowDeep);
    if (!candidate) continue;

    if (candidate.topId) {
      // Two-tile entity: base at (x,y) layer 3, top at (x,y-1) layer 4
      const canopyKey = `${x},${y - 1}`;
      if (occupied.has(canopyKey)) continue;

      tileOverrides.push({ x, y,        layer: 3, tileId: candidate.id });
      tileOverrides.push({ x, y: y - 1, layer: 4, tileId: candidate.topId });
      const stats = { ...ENTITY_DEFAULTS[candidate.id] } as Record<string, unknown>;
      applyRandomStats(candidate.id, stats, rng);
      entityStats.push({ x, y, stats: stats as EntityStats });

      occupied.add(key);
      occupied.add(canopyKey);
    } else {
      // Single-tile entity
      tileOverrides.push({ x, y, layer: 3, tileId: candidate.id });
      const stats = { ...ENTITY_DEFAULTS[candidate.id] } as Record<string, unknown>;
      applyRandomStats(candidate.id, stats, rng);
      entityStats.push({ x, y, stats: stats as EntityStats });
      occupied.add(key);
    }
  }

  return { tileOverrides, entityStats };
}

