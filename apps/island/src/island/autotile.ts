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

/** Returns the water/sand border autotile ID (Water7 sheet) for a water cell at (x, y). */
function autotileWaterSandCell(
  x: number,
  y: number,
  isWater: (nx: number, ny: number) => boolean,
): string {
  return getAutotileId("water_sand_at", x, y, isWater);
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
): { overrides: Array<{ x: number; y: number; layer: number; tileId: string }>; grassGrid: boolean[][]; sandGrid: Set<string>; forestGrid: Set<string>; lakeGrid: Set<string> } {
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

  // ── 7. Detect lake water cells ────────────────────────────────────────────
  // Ocean = water cells reachable from the map border by BFS through water.
  // Lake  = water cells not reachable (enclosed inside the grass island).
  const lakeGrid = new Set<string>();
  {
    const oceanVis = new Set<string>();
    const oceanQ: [number, number][] = [];
    for (let x = 0; x < w; x++) {
      for (const y of [0, h - 1]) {
        if (!grid[y][x]) { const k = `${x},${y}`; if (!oceanVis.has(k)) { oceanVis.add(k); oceanQ.push([x, y]); } }
      }
    }
    for (let y = 0; y < h; y++) {
      for (const x of [0, w - 1]) {
        if (!grid[y][x]) { const k = `${x},${y}`; if (!oceanVis.has(k)) { oceanVis.add(k); oceanQ.push([x, y]); } }
      }
    }
    for (let qi = 0; qi < oceanQ.length; qi++) {
      const [cx, cy] = oceanQ[qi];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (grid[ny][nx]) continue; // grass — stop
        const nk = `${nx},${ny}`;
        if (oceanVis.has(nk)) continue;
        oceanVis.add(nk);
        oceanQ.push([nx, ny]);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!grid[y][x] && !oceanVis.has(`${x},${y}`)) lakeGrid.add(`${x},${y}`);
      }
    }
  }

  // ── 8. Generate forest zones ──────────────────────────────────────────────
  // BFS-grow N roughly-circular forest blobs from random deep-interior grass
  // cells.  Forest zones get higher vegetation density and are the only places
  // where forestOnly entities (e.g. fallen trees) can spawn.
  const { forestCount, forestRadiusMin, forestRadiusMax } = mapGen;
  const forestGrid = new Set<string>();

  if (forestCount > 0) {
    // Collect deep-interior grass cells (all 8 neighbors are grass) as center candidates
    const forestCandidates: [number, number][] = [];
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        if (!grid[y][x]) continue;
        let deep = true;
        for (let dy = -1; dy <= 1 && deep; dy++)
          for (let dx = -1; dx <= 1 && deep; dx++)
            if (!grid[y + dy]?.[x + dx]) deep = false;
        if (deep) forestCandidates.push([x, y]);
      }
    }

    for (let f = 0; f < forestCount && forestCandidates.length > 0; f++) {
      const idx = Math.floor(rng() * forestCandidates.length);
      const [fx, fy] = forestCandidates.splice(idx, 1)[0];
      const radius = forestRadiusMin + Math.floor(rng() * (forestRadiusMax - forestRadiusMin + 1));

      // BFS-grow forest zone, staying within grass cells
      const forestQ: [number, number, number][] = [[fx, fy, 0]];
      const forestVis = new Set<string>([`${fx},${fy}`]);
      while (forestQ.length) {
        const [cx, cy, d] = forestQ.shift()!;
        forestGrid.add(`${cx},${cy}`);
        if (d >= radius) continue;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
          const nx = cx + dx, ny = cy + dy;
          const key = `${nx},${ny}`;
          if (forestVis.has(key)) continue;
          if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) continue;
          if (!grid[ny][nx]) continue;
          forestVis.add(key);
          forestQ.push([nx, ny, d + 1]);
        }
      }
    }
  }

  // ── 8. Generate natural sand patches near water ───────────────────────────
  // Two-pass seeded patch growth:
  //   Phase 1 (seed): ~sandSeedProb of water-adjacent grass cells become sand
  //   Phase 2 (grow): each seeded cell spreads to grass neighbors within sandMaxDepth
  //   Phase 3 (second grow): second wave at lower probability for rounder patches
  const terrain: TerrainCell[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (grid[y][x] ? "grass" : "water") as TerrainCell)
  );

  const { sandSeedProb, sandGrowProb, sandMaxDepth } = mapGen;
  const CARDINALS: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];

  // BFS from all water cells to compute distance-to-water for each grass cell
  const distToWater: number[][] = Array.from({ length: h }, () => new Array(w).fill(Infinity));
  const distQ: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid[y][x]) { distToWater[y][x] = 0; distQ.push([x, y]); }
    }
  }
  for (let qi = 0; qi < distQ.length; qi++) {
    const [cx, cy] = distQ[qi];
    const nextDist = distToWater[cy][cx] + 1;
    for (const [dx, dy] of CARDINALS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (distToWater[ny][nx] > nextDist) {
        distToWater[ny][nx] = nextDist;
        distQ.push([nx, ny]);
      }
    }
  }

  // Phase 1: seed sand on water-adjacent grass cells
  const wave1: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (terrain[y][x] === "grass" && distToWater[y][x] === 1 && rng() < sandSeedProb) {
        terrain[y][x] = "sand";
        wave1.push([x, y]);
      }
    }
  }

  // Phase 2: spread from seeds to nearby grass neighbors
  const wave2: [number, number][] = [];
  for (const [cx, cy] of wave1) {
    for (const [dx, dy] of CARDINALS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (terrain[ny][nx] === "grass" && distToWater[ny][nx] <= sandMaxDepth && rng() < sandGrowProb) {
        terrain[ny][nx] = "sand";
        wave2.push([nx, ny]);
      }
    }
  }

  // Phase 3: second wave at lower probability for organic rounded edges
  for (const [cx, cy] of wave2) {
    for (const [dx, dy] of CARDINALS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (terrain[ny][nx] === "grass" && distToWater[ny][nx] <= sandMaxDepth && rng() < sandGrowProb * 0.55) {
        terrain[ny][nx] = "sand";
      }
    }
  }

  // ── 8. Build tile overrides ───────────────────────────────────────────────
  // Layer 0: grass or sand base (sand cells use sand autotile)
  // Layer 1: water autotile on ALL water cells (border tiles transparent)
  const isWater = (nx: number, ny: number): boolean =>
    nx < 0 || nx >= w || ny < 0 || ny >= h || terrain[ny][nx] === "water";

  const isSandOrWater = (nx: number, ny: number): boolean =>
    nx < 0 || nx >= w || ny < 0 || ny >= h || terrain[ny][nx] === "water" || terrain[ny][nx] === "sand";

  const result: Array<{ x: number; y: number; layer: number; tileId: string }> = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = terrain[y][x];
      if (t === "water") {
        // Check if this water cell has any land neighbors (border cell)
        const hasLandNeighbor = !isWater(x-1,y) || !isWater(x+1,y) || !isWater(x,y-1) || !isWater(x,y+1)
          || !isWater(x-1,y-1) || !isWater(x+1,y-1) || !isWater(x-1,y+1) || !isWater(x+1,y+1);

        if (hasLandNeighbor) {
          const hasSandNeighbor =
            terrain[y]?.[x-1] === "sand" || terrain[y]?.[x+1] === "sand" ||
            terrain[y-1]?.[x] === "sand" || terrain[y+1]?.[x] === "sand" ||
            terrain[y-1]?.[x-1] === "sand" || terrain[y-1]?.[x+1] === "sand" ||
            terrain[y+1]?.[x-1] === "sand" || terrain[y+1]?.[x+1] === "sand";

          // Always show grass on layer 0 (sand sits on top of grass, never replaces it)
          result.push({ x, y, layer: 0, tileId: "grass" });

          if (hasSandNeighbor) {
            // Sand on layer 1, water/sand border on layer 2 — proper grass → sand → water stack
            result.push({ x, y, layer: 1, tileId: autotileSandCell(x, y, isSandOrWater) });
            result.push({ x, y, layer: 2, tileId: autotileWaterSandCell(x, y, isWater) });
            continue;
          }
        }

        // Regular border or interior water: water autotile on layer 1
        const tileId = autotileWaterCell(x, y, isWater);
        result.push({ x, y, layer: 1, tileId });
      } else if (t === "sand") {
        // Sand cells: layer 0 = grass (base), layer 1 = sand autotile on top
        result.push({ x, y, layer: 0, tileId: "grass" });
        result.push({ x, y, layer: 1, tileId: autotileSandCell(x, y, isSandOrWater) });
      } else {
        // Grass cells: override layer 0 to "grass" (base map defaults to "water")
        result.push({ x, y, layer: 0, tileId: "grass" });
      }
    }
  }

  // grassGrid: true only for pure grass cells (not sand) — used for vegetation spawning
  const grassOnlyGrid = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => terrain[y][x] === "grass")
  );
  const sandGrid = new Set<string>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (terrain[y][x] === "sand") sandGrid.add(`${x},${y}`);
  return { overrides: result, grassGrid: grassOnlyGrid, sandGrid, forestGrid, lakeGrid };
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

/** Returns true if the tile ID represents walkable ground.
 * With two-layer rendering, grass cells have no layer-1 override (empty string).
 * Pass l2 when the cell may have a water overlay on layer 2 (sand-adjacent water border). */
export function isWalkableGround(l1: string, l2?: string): boolean {
  if (l2?.startsWith("water_at_") || l2?.startsWith("water_sand_at_")) return false;
  if (l1.startsWith("water_at_") || l1.startsWith("water_sand_at_")) return false;
  return l1 === "" || l1 === "grass" || l1.startsWith("sand_at_") || PATH_TILE_IDS.has(l1);
}

/**
 * Determine the terrain type from layer overrides.
 * Layer 2 takes priority for water detection (sand-adjacent water border cells
 * have sand_at on layer 1 and water_sand_at on layer 2).
 */
export function terrainFromLayer1(l1: string, l2?: string): "grass" | "sand" | "water" {
  if (l2?.startsWith("water_at_") || l2?.startsWith("water_sand_at_")) return "water";
  if (l1.startsWith("water_at_") || l1.startsWith("water_sand_at_")) return "water";
  if (l1.startsWith("sand_at_")) return "sand";
  return "grass";
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
  type TilePlacement,
  applyRandomStats,
} from "./entity-registry.js";
import { getIslandConfig } from "./island-config.js";

/**
 * Scatter vegetation on inner grass cells using a seeded RNG.
 *
 * Placement is fully generic — entity footprint and canopy are derived
 * from the `tiles` array in entities.json.  No special-case code per shape.
 */
export function buildVegetationLayer(
  w: number,
  h: number,
  seed: number,
  grassGrid: boolean[][],
  sandGrid: Set<string>,
  forestGrid: Set<string>,
  lakeGrid: Set<string>,
): {
  tileOverrides: Array<{ x: number; y: number; layer: number; tileId: string }>;
  entityStats:   Array<{ x: number; y: number; stats: EntityStats }>;
} {
  const rng = mulberry32(seed ^ 0xdeadbeef);

  // ── Build weighted spawn pool from entity definitions ─────────────────────
  interface SpawnCandidate {
    id: string;
    tiles: TilePlacement[];
    isBlocking: boolean;
    requiresDeep: boolean;
    requiresWide: boolean;
    forestOnly: boolean;
    noForest: boolean;
    lakeOnly: boolean;
    lakeInterior: boolean;
  }

  const spawnPool: SpawnCandidate[] = [];
  const spawnWeights: number[] = [];

  for (const def of ENTITY_DEFS) {
    if (!def.spawn || def.spawn.weight <= 0) continue;
    const tiles = def.tiles;
    const maxDx = Math.max(0, ...tiles.map((t) => t.dx));
    const minDy = Math.min(0, ...tiles.map((t) => t.dy));
    spawnPool.push({
      id: def.id,
      tiles,
      isBlocking: def.blocks === true,
      requiresDeep: minDy < 0,
      requiresWide: maxDx > 0,
      forestOnly: def.spawn.forestOnly === true,
      noForest: def.spawn.noForest === true,
      lakeOnly: def.spawn.lakeOnly === true,
      lakeInterior: def.spawn.lakeInterior === true,
    });
    spawnWeights.push(def.spawn.weight);
  }

  const totalWeight = spawnWeights.reduce((a, b) => a + b, 0);

  function pickCandidate(isDeep: boolean, isWide: boolean, inForest: boolean): SpawnCandidate | null {
    const eligible = spawnPool
      .map((c, i) => ({ c, w: spawnWeights[i] }))
      .filter(({ c }) => !c.lakeOnly && !c.lakeInterior && (!c.requiresDeep || isDeep) && (!c.requiresWide || isWide) && (!c.forestOnly || inForest) && (!c.noForest || !inForest));
    if (eligible.length === 0) return null;
    const total = eligible.reduce((s, { w }) => s + w, 0);
    let r = rng() * total;
    for (const { c, w } of eligible) {
      r -= w;
      if (r <= 0) return c;
    }
    return eligible[eligible.length - 1].c;
  }

  const SPAWN_DENSITY = totalWeight > 0 ? getIslandConfig().mapGen.vegetationDensity : 0;
  const FOREST_DENSITY = totalWeight > 0 ? getIslandConfig().mapGen.forestVegetationDensity : 0;

  const isG = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && grassGrid[y]?.[x] === true;
  const isSand = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && sandGrid.has(`${x},${y}`);

  // ── Classify cells ────────────────────────────────────────────────────────
  // Any non-border grass cell is a candidate. isDeep/isWide are cheap hints
  // passed to pickCandidate to avoid wasting attempts on entities whose
  // footprint can't possibly fit (canPlace is the authoritative check).

  const tileOverrides: Array<{ x: number; y: number; layer: number; tileId: string }> = [];
  const entityStats:   Array<{ x: number; y: number; stats: EntityStats }> = [];
  const occupied       = new Set<string>();

  /** Check that every tile position is unoccupied on its own layer.
   *  Layer-4 canopy tiles may share (x,y) with layer-3 entities (depth occlusion).
   *  Layer-3 tiles additionally must land on valid ground (grass or lake cell). */
  function canPlace(x: number, y: number, c: SpawnCandidate): boolean {
    for (const t of c.tiles) {
      const tx = x + t.dx;
      const ty = y + t.dy;
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) return false;
      if (occupied.has(`${tx},${ty},${t.layer}`)) return false;
      if (t.layer === 3) {
        const gkey = `${tx},${ty}`;
        if (c.lakeOnly || c.lakeInterior ? !lakeGrid.has(gkey) : !isG(tx, ty)) return false;
      }
    }
    return true;
  }

  function placeEntity(x: number, y: number, c: SpawnCandidate): void {
    for (const t of c.tiles) {
      tileOverrides.push({ x: x + t.dx, y: y + t.dy, layer: t.layer, tileId: t.tileId });
    }
    const stats = { ...ENTITY_DEFAULTS[c.id] } as Record<string, unknown>;
    applyRandomStats(c.id, stats, rng);
    entityStats.push({ x, y, stats: stats as EntityStats });
    for (const t of c.tiles) {
      occupied.add(`${x + t.dx},${y + t.dy},${t.layer}`);
    }
  }

  // ── Collect density-filtered candidates and shuffle ────────────────────────
  const candidates: string[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!isG(x, y)) continue;
      const key = `${x},${y}`;
      const density = forestGrid.has(key) ? FOREST_DENSITY : SPAWN_DENSITY;
      if (rng() < density) candidates.push(key);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // ── Place entities ─────────────────────────────────────────────────────────
  for (const key of candidates) {
    if (occupied.has(`${key},3`)) continue;

    const [x, y] = key.split(",").map(Number);
    const isDeep = isG(x, y - 1);
    const isWide = isG(x + 1, y);
    const inForest = forestGrid.has(key);
    const candidate = pickCandidate(isDeep, isWide, inForest);
    if (!candidate) continue;

    if (!canPlace(x, y, candidate)) continue;
    placeEntity(x, y, candidate);
  }

  // ── Lily pad placement on lake water cells ────────────────────────────────
  const lilyPool   = spawnPool.filter(c => c.lakeOnly || c.lakeInterior);
  const LILY_DENSITY = lilyPool.length > 0 ? getIslandConfig().mapGen.lilyPadDensity : 0;

  if (LILY_DENSITY > 0) {
    const lilyWeights = lilyPool.map(c => spawnWeights[spawnPool.indexOf(c)]);

    function pickLilyPad(isBorder: boolean): SpawnCandidate | null {
      // lakeInterior entities are excluded from border cells
      const eligible = lilyPool
        .map((c, i) => ({ c, w: lilyWeights[i] }))
        .filter(({ c }) => !c.lakeInterior || !isBorder);
      if (eligible.length === 0) return null;
      const total = eligible.reduce((s, { w }) => s + w, 0);
      let r = rng() * total;
      for (const { c, w } of eligible) {
        r -= w;
        if (r <= 0) return c;
      }
      return eligible[eligible.length - 1].c;
    }

    for (const key of lakeGrid) {
      const [x, y] = key.split(",").map(Number);
      if (occupied.has(`${key},3`)) continue;
      if (rng() >= LILY_DENSITY) continue;
      const isBorder = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => isG(x + dx, y + dy) || isSand(x + dx, y + dy));
      const candidate = pickLilyPad(isBorder);
      if (!candidate) continue;
      if (canPlace(x, y, candidate)) placeEntity(x, y, candidate);
    }
  }

  return { tileOverrides, entityStats };
}

