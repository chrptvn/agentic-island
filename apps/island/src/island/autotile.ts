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
): { overrides: Array<{ x: number; y: number; layer: number; tileId: string }>; grassGrid: boolean[][]; sandGrid: Set<string>; biomeGrid: Map<string, string>; lakeGrid: Set<string> } {
  const rng = mulberry32(seed);
  const mapGen = getIslandConfig().mapGen;
  const pad = Math.max(1, mapGen.shorePadding);

  // ── 1. Random initialisation ──────────────────────────────────────────────
  // grid[y][x]: true = grass, false = water
  const grid: boolean[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) =>
      x >= pad && x < w - pad && y >= pad && y < h - pad && rng() < mapGen.fillProbability
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
        if (x < pad || x >= w - pad || y < pad || y >= h - pad) continue; // shore stays water
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
      for (let y = pad; y < h - pad; y++) {
        for (let x = pad; x < w - pad; x++) {
          if (!grid[y][x] && (cardinalGrassCount(x, y) >= mapGen.gapFillThreshold || hasOppositeDiagGrass(x, y))) {
            grid[y][x] = true;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  };

  fillGaps(); // ── 4. Fill gaps

  // (Global lake removed — lakes are now per-biome, carved after biome zones.)

  // ── 7. Fill inland CA remnants & detect ocean ──────────────────────────────
  // Ocean = water cells reachable from the map border by BFS through water.
  // Any inland water pockets (CA survivors) are converted to grass so that
  // only per-biome lake carving (step 8c) creates lakes.
  const lakeGrid = new Set<string>();
  const oceanVis = new Set<string>();
  {
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
    // Fill CA remnant inland water pockets with grass.
    // Lakes are only created by per-biome lake configs (step 8c).
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!grid[y][x] && !oceanVis.has(`${x},${y}`)) grid[y][x] = true;
      }
    }
  }

  // ── 7b. Pre-compute distance-from-ocean for biome placement ────────────
  // BFS from OCEAN cells only (not inland lakes/gaps) so that inland cells
  // get high distance values.  Used to keep biomes like marsh far from coast.
  const distFromWater0: number[][] = Array.from({ length: h }, () => new Array(w).fill(Infinity));
  {
    const dq: [number, number][] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (oceanVis.has(`${x},${y}`)) { distFromWater0[y][x] = 0; dq.push([x, y]); }
    for (let qi = 0; qi < dq.length; qi++) {
      const [cx, cy] = dq[qi];
      const nd = distFromWater0[cy][cx] + 1;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (distFromWater0[ny][nx] > nd) { distFromWater0[ny][nx] = nd; dq.push([nx, ny]); }
      }
    }
  }

  // ── 8. Generate biome zones ─────────────────────────────────────────────
  // BFS-grow N roughly-circular biome blobs from random deep-interior grass
  // cells.  Each biome can override per-entity spawn weights and vegetation density.
  const biomeGrid = new Map<string, string>();
  // Record each zone's center for per-biome lake carving later.
  // Map from biome ID → array of [centerX, centerY] per zone.
  const zoneCenters = new Map<string, [number, number][]>();

  for (const biome of mapGen.biomes) {
    if (biome.fill || biome.count <= 0) continue;

    // Collect deep-interior grass cells (all 8 neighbors are grass) that are
    // not already claimed by another biome as center candidates
    const margin = mapGen.biomeBorderMargin;
    const minDist = biome.minDistFromWater ?? 0;
    const biomeCandidates: [number, number][] = [];
    for (let y = margin; y < h - margin; y++) {
      for (let x = margin; x < w - margin; x++) {
        if (!grid[y][x]) continue;
        if (biomeGrid.has(`${x},${y}`)) continue;
        let deep = true;
        for (let dy = -1; dy <= 1 && deep; dy++)
          for (let dx = -1; dx <= 1 && deep; dx++)
            if (!grid[y + dy]?.[x + dx]) deep = false;
        if (deep && distFromWater0[y][x] >= minDist) biomeCandidates.push([x, y]);
      }
    }

    const centers: [number, number][] = [];
    for (let f = 0; f < biome.count && biomeCandidates.length > 0; f++) {
      const idx = Math.floor(rng() * biomeCandidates.length);
      const [bx, by] = biomeCandidates.splice(idx, 1)[0];
      const radius = biome.radiusMin + Math.floor(rng() * (biome.radiusMax - biome.radiusMin + 1));

      centers.push([bx, by]);

      // Grow a roughly circular biome zone using Euclidean distance from center.
      // Core (< 70% radius) always claimed; edge zone tapers with random falloff.
      const coreRatio = 0.7;
      const rSq = radius * radius;
      const coreRSq = (radius * coreRatio) * (radius * coreRatio);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = bx + dx, ny = by + dy;
          if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) continue;
          if (!grid[ny][nx]) continue;
          const nkey = `${nx},${ny}`;
          if (biomeGrid.has(nkey)) continue;
          const dSq = dx * dx + dy * dy;
          if (dSq > rSq) continue;
          if (dSq > coreRSq) {
            const t = (Math.sqrt(dSq) - radius * coreRatio) / (radius * (1 - coreRatio));
            if (rng() < t) continue;
          }
          biomeGrid.set(nkey, biome.id);
        }
      }
    }
    if (centers.length > 0) zoneCenters.set(biome.id, centers);
  }

  // ── 8b. Fill remaining grass with the fill biome ──────────────────────────
  const fillBiome = mapGen.biomes.find(b => b.fill);
  if (fillBiome) {
    for (let y = pad; y < h - pad; y++) {
      for (let x = pad; x < w - pad; x++) {
        if (!grid[y][x]) continue;
        const key = `${x},${y}`;
        if (!biomeGrid.has(key)) biomeGrid.set(key, fillBiome.id);
      }
    }
  }

  // ── 8c. Per-biome lake carving ────────────────────────────────────────────
  // For each biome with a `lake` config, carve lakes inside its zones.
  // lakeWaterGroup tracks the autotile prefix for each lake cell so that
  // lakes with different tile sets render with proper borders between them.
  const lakeWaterGroup = new Map<string, string>();

  for (const biome of mapGen.biomes) {
    if (!biome.lake) continue;
    const lakeCfg = biome.lake;
    const prefix = lakeCfg.tilePrefix ?? "water_at";

    // Determine zone centers for this biome
    let centers: [number, number][];
    if (biome.fill) {
      // Fill biome: carve exactly `count` lakes (no probability gate).
      centers = [];
      const lakeCount = lakeCfg.count ?? 1;
      for (let attempt = 0; attempt < lakeCount; attempt++) {
        const fillCandidates: [number, number][] = [];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            if (!grid[y][x]) continue;
            if (biomeGrid.get(`${x},${y}`) !== biome.id) continue;
            let deep = true;
            for (let dy = -1; dy <= 1 && deep; dy++)
              for (let dx = -1; dx <= 1 && deep; dx++)
                if (!grid[y + dy]?.[x + dx]) deep = false;
            if (deep) fillCandidates.push([x, y]);
          }
        }
        if (fillCandidates.length > 0) {
          centers.push(fillCandidates[Math.floor(rng() * fillCandidates.length)]);
        }
      }
    } else {
      // Zone biome: use recorded centers, filtered by probability
      centers = (zoneCenters.get(biome.id) ?? []).filter(() => rng() < lakeCfg.probability);
    }

    for (const [bx, by] of centers) {
      // Find a valid grass seed cell inside this biome — use the recorded
      // center if it's still grass, otherwise BFS-search the nearest biome cell.
      let seedX = bx, seedY = by;
      if (!grid[by][bx]) {
        const fbQ: [number, number][] = [[bx, by]];
        const fbVis = new Set<string>([`${bx},${by}`]);
        let found = false;
        for (let qi = 0; qi < fbQ.length && !found; qi++) {
          const [cx, cy] = fbQ[qi];
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
            const nx = cx + dx, ny = cy + dy;
            const nkey = `${nx},${ny}`;
            if (fbVis.has(nkey)) continue;
            if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) continue;
            if (biomeGrid.get(nkey) !== biome.id) continue;
            fbVis.add(nkey);
            if (grid[ny][nx]) { seedX = nx; seedY = ny; found = true; break; }
            fbQ.push([nx, ny]);
          }
        }
        if (!found) continue;
      }
      const lakeRadius = lakeCfg.radiusMin + Math.floor(rng() * (lakeCfg.radiusMax - lakeCfg.radiusMin + 1));

      // Carve a roughly circular lake using Euclidean distance from seed.
      // Core (< 70% radius) is always carved; edge zone tapers with random falloff.
      const coreRatio = 0.7;
      const rSq = lakeRadius * lakeRadius;
      const coreRSq = (lakeRadius * coreRatio) * (lakeRadius * coreRatio);
      for (let dy = -lakeRadius; dy <= lakeRadius; dy++) {
        for (let dx = -lakeRadius; dx <= lakeRadius; dx++) {
          const nx = seedX + dx, ny = seedY + dy;
          if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) continue;
          if (!grid[ny][nx]) continue;
          const nkey = `${nx},${ny}`;
          if (biomeGrid.get(nkey) !== biome.id) continue;
          const dSq = dx * dx + dy * dy;
          if (dSq > rSq) continue;
          if (dSq > coreRSq) {
            // Edge zone: probability tapers linearly from 1 at coreR to 0 at radius
            const t = (Math.sqrt(dSq) - lakeRadius * coreRatio) / (lakeRadius * (1 - coreRatio));
            if (rng() < t) continue;
          }
          grid[ny][nx] = false;
          lakeGrid.add(nkey);
          lakeWaterGroup.set(nkey, prefix);
        }
      }
    }
  }

  // ── 9. Generate natural sand patches near water ───────────────────────────
  // Two-pass seeded patch growth:
  //   Phase 1 (seed): ~sandSeedProb of water-adjacent grass cells become sand
  //   Phase 2 (grow): each seeded cell spreads to grass neighbors within sandMaxDepth
  //   Phase 3 (second grow): second wave at lower probability for rounder patches

  // Build lookup: biome ID → groundTile prefix (for biomes with ground overlays).
  // Cells in biomes with a groundTile skip sand generation entirely.
  const biomeGroundTile = new Map<string, string>();
  for (const b of mapGen.biomes) {
    if (b.groundTile) biomeGroundTile.set(b.id, b.groundTile);
  }
  const hasGroundOverlay = (x: number, y: number): boolean => {
    const bid = biomeGrid.get(`${x},${y}`);
    return bid !== undefined && biomeGroundTile.has(bid);
  };

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
      if (terrain[y][x] === "grass" && distToWater[y][x] === mapGen.sandSeedDistance && !hasGroundOverlay(x, y) && rng() < sandSeedProb) {
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
      if (terrain[ny][nx] === "grass" && distToWater[ny][nx] <= sandMaxDepth && !hasGroundOverlay(nx, ny) && rng() < sandGrowProb) {
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
      if (terrain[ny][nx] === "grass" && distToWater[ny][nx] <= sandMaxDepth && !hasGroundOverlay(nx, ny) && rng() < sandGrowProb * mapGen.sandGrowProbWave3) {
        terrain[ny][nx] = "sand";
      }
    }
  }

  // ── 10. Build tile overrides ──────────────────────────────────────────────
  // Layer 0: grass or sand base (sand cells use sand autotile)
  // Layer 1: water autotile on ALL water cells (border tiles transparent)
  //          OR biome ground overlay on grass cells in biomes with groundTile
  // For biome lakes with custom tile prefixes, autotile only blends cells
  // in the same group (same prefix).  Default-prefix lakes blend with ocean.
  const DEFAULT_WATER_GROUP = "water_at";

  // Group-aware water predicate: treats a neighbor as "same water" only if it
  // belongs to the same tile-prefix group, or (for the default group) if it's
  // out-of-bounds (ocean).
  const isSameWater = (nx: number, ny: number, group: string): boolean => {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return group === DEFAULT_WATER_GROUP;
    if (terrain[ny][nx] !== "water") return false;
    const neighborGroup = lakeWaterGroup.get(`${nx},${ny}`) ?? DEFAULT_WATER_GROUP;
    return neighborGroup === group;
  };

  const isSandOrWater = (nx: number, ny: number): boolean =>
    nx < 0 || nx >= w || ny < 0 || ny >= h || terrain[ny][nx] === "water" || terrain[ny][nx] === "sand";

  const result: Array<{ x: number; y: number; layer: number; tileId: string }> = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = terrain[y][x];
      if (t === "water") {
        const cellKey = `${x},${y}`;
        const group = lakeWaterGroup.get(cellKey) ?? DEFAULT_WATER_GROUP;
        const isCustomTile = group !== DEFAULT_WATER_GROUP;
        const baseTile = isCustomTile
          ? (mapGen.biomes.find(b => b.lake?.tilePrefix === group)?.lake?.baseTile ?? "water")
          : undefined;

        // Build the group-aware isWater predicate for this cell
        const isGroupWater = (nx: number, ny: number) => isSameWater(nx, ny, group);

        // Check if this water cell has any land neighbors (border cell)
        const hasLandNeighbor = !isGroupWater(x-1,y) || !isGroupWater(x+1,y) || !isGroupWater(x,y-1) || !isGroupWater(x,y+1)
          || !isGroupWater(x-1,y-1) || !isGroupWater(x+1,y-1) || !isGroupWater(x-1,y+1) || !isGroupWater(x+1,y+1);

        if (hasLandNeighbor) {
          const hasSandNeighbor =
            terrain[y]?.[x-1] === "sand" || terrain[y]?.[x+1] === "sand" ||
            terrain[y-1]?.[x] === "sand" || terrain[y+1]?.[x] === "sand" ||
            terrain[y-1]?.[x-1] === "sand" || terrain[y-1]?.[x+1] === "sand" ||
            terrain[y+1]?.[x-1] === "sand" || terrain[y+1]?.[x+1] === "sand";

          // Always show grass on layer 0 — autotile transition tiles have transparent
          // corners that must show grass underneath (same rule for all water types)
          result.push({ x, y, layer: 0, tileId: "grass" });

          if (hasSandNeighbor && !isCustomTile) {
            // Sand on layer 1, water/sand border on layer 2 — proper grass → sand → water stack
            result.push({ x, y, layer: 1, tileId: autotileSandCell(x, y, isSandOrWater) });
            result.push({ x, y, layer: 2, tileId: autotileWaterSandCell(x, y, isGroupWater) });
            continue;
          }
        } else if (isCustomTile && baseTile) {
          // Interior custom-tile lake cell: use the biome's base tile
          result.push({ x, y, layer: 0, tileId: baseTile });
        }

        // Border or interior water: use the group's autotile
        const tileId = getAutotileId(group, x, y, isGroupWater);
        result.push({ x, y, layer: 1, tileId });
      } else if (t === "sand") {
        // Sand cells: layer 0 = grass (base), layer 1 = sand autotile on top
        result.push({ x, y, layer: 0, tileId: "grass" });
        result.push({ x, y, layer: 1, tileId: autotileSandCell(x, y, isSandOrWater) });
      } else {
        // Grass cells: override layer 0 to "grass" (base map defaults to "water")
        result.push({ x, y, layer: 0, tileId: "grass" });
        // Biome ground overlay: render on layer 1 with transparent border blending
        const cellBiome = biomeGrid.get(`${x},${y}`);
        const groundPrefix = cellBiome ? biomeGroundTile.get(cellBiome) : undefined;
        if (groundPrefix) {
          const isSameGround = (nx: number, ny: number) => {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
            const nb = biomeGrid.get(`${nx},${ny}`);
            return nb !== undefined && biomeGroundTile.get(nb) === groundPrefix && terrain[ny][nx] === "grass";
          };
          result.push({ x, y, layer: 1, tileId: getAutotileId(groundPrefix, x, y, isSameGround) });
        }
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
  return { overrides: result, grassGrid: grassOnlyGrid, sandGrid, biomeGrid, lakeGrid };
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
  if (l2?.startsWith("water_at_") || l2?.startsWith("water_sand_at_") || l2?.startsWith("marsh_water_at_")) return false;
  if (l1.startsWith("water_at_") || l1.startsWith("water_sand_at_") || l1.startsWith("marsh_water_at_")) return false;
  return l1 === "" || l1 === "grass" || l1.startsWith("sand_at_") || l1.startsWith("marsh_ground_at_") || PATH_TILE_IDS.has(l1);
}

/**
 * Determine the terrain type from layer overrides.
 * Layer 2 takes priority for water detection (sand-adjacent water border cells
 * have sand_at on layer 1 and water_sand_at on layer 2).
 */
export function terrainFromLayer1(l1: string, l2?: string): "grass" | "sand" | "water" {
  if (l2?.startsWith("water_at_") || l2?.startsWith("water_sand_at_") || l2?.startsWith("marsh_water_at_")) return "water";
  if (l1.startsWith("water_at_") || l1.startsWith("water_sand_at_") || l1.startsWith("marsh_water_at_")) return "water";
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
import { getIslandConfig, type BiomeConfig } from "./island-config.js";

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
  biomeGrid: Map<string, string>,
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
    biomeWeights: Record<string, number>;
    baseWeight: number;
    lakeOnly: boolean;
    lakeInterior: boolean;
  }

  const spawnPool: SpawnCandidate[] = [];
  const spawnWeights: number[] = [];

  for (const def of ENTITY_DEFS) {
    if (!def.spawn || def.spawn.weight <= 0 && !def.spawn.biomes) continue;
    const tiles = def.tiles;
    const maxDx = Math.max(0, ...tiles.map((t) => t.dx));
    const minDy = Math.min(0, ...tiles.map((t) => t.dy));
    spawnPool.push({
      id: def.id,
      tiles,
      isBlocking: def.blocks === true,
      requiresDeep: minDy < 0,
      requiresWide: maxDx > 0,
      biomeWeights: def.spawn.biomes ?? {},
      baseWeight: def.spawn.weight,
      lakeOnly: def.spawn.lakeOnly === true,
      lakeInterior: def.spawn.lakeInterior === true,
    });
    spawnWeights.push(def.spawn.weight);
  }

  const totalWeight = spawnWeights.reduce((a, b) => a + b, 0);

  /** Pick a spawn candidate for a cell, using biome-specific weights when inside a biome. */
  function pickCandidate(isDeep: boolean, isWide: boolean, biomeId: string | undefined): SpawnCandidate | null {
    const eligible = spawnPool
      .map((c, i) => {
        if (c.lakeOnly || c.lakeInterior) return null;
        if (c.requiresDeep && !isDeep) return null;
        if (c.requiresWide && !isWide) return null;
        // Resolve weight: biome-specific weight only — no fallback to base
        const w = biomeId !== undefined && biomeId in c.biomeWeights
          ? c.biomeWeights[biomeId]
          : 0;
        if (w <= 0) return null;
        return { c, w };
      })
      .filter((x): x is { c: SpawnCandidate; w: number } => x !== null);
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
  // Build a lookup from biome ID → vegetationDensity for fast per-cell access
  const biomeDensityMap = new Map<string, number>();
  for (const b of getIslandConfig().mapGen.biomes) {
    biomeDensityMap.set(b.id, b.vegetationDensity);
  }

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
      // For the anchor tile (dx=0,dy=0,layer=3), store entity ID so we can
      // distinguish entities that share the same tileId (e.g. multiple sprouts).
      const id = (t.dx === 0 && t.dy === 0 && t.layer === 3) ? c.id : t.tileId;
      tileOverrides.push({ x: x + t.dx, y: y + t.dy, layer: t.layer, tileId: id });
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
      const cellBiome = biomeGrid.get(key);
      if (!cellBiome) continue;
      const density = biomeDensityMap.get(cellBiome) ?? SPAWN_DENSITY;
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
    const biomeId = biomeGrid.get(key);
    const candidate = pickCandidate(isDeep, isWide, biomeId);
    if (!candidate) continue;

    if (!canPlace(x, y, candidate)) continue;
    placeEntity(x, y, candidate);
  }

  // ── Lily pad placement on lake water cells ────────────────────────────────
  const lilyPool   = spawnPool.filter(c => c.lakeOnly || c.lakeInterior);
  const LILY_DENSITY = lilyPool.length > 0 ? getIslandConfig().mapGen.lilyPadDensity : 0;

  if (LILY_DENSITY > 0) {
    const lilyWeights = lilyPool.map(c => c.baseWeight);

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

  // ── Post-generation collision validation ────────────────────────────────
  // Scan tileOverrides for duplicate (x,y,layer) entries. If any exist, the
  // occupied-set logic above has a bug and two entities were placed on the
  // same cell + layer.
  if (process.env.NODE_ENV !== "production") {
    const seen = new Set<string>();
    for (const { x, y, layer } of tileOverrides) {
      const vk = `${x},${y},${layer}`;
      if (seen.has(vk)) {
        console.error(
          `[buildVegetationLayer] COLLISION detected: duplicate tile at (${x}, ${y}) layer ${layer}`,
        );
      }
      seen.add(vk);
    }
  }

  return { tileOverrides, entityStats };
}

