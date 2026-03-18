/**
 * Goal executor — resolves structured search commands into a target coordinate.
 */

import type { CharacterInstance, Point } from "./character-registry.js";
import { SEARCH_TARGET_MAP } from "./entity-registry.js";
import { TILES, TILE_BY_ID } from "./tile-registry.js";
import type { WorldMap } from "./map.js";

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Resolve a target_filter token array to the nearest matching cell.
 *
 * Each token is matched against (in priority order):
 *   1. searchTarget group name  — e.g. "trees", "berries"
 *   2. entity tile ID           — e.g. "young_tree", "rock"
 *   3. tile category            — e.g. "vegetation", "mineral"
 *   4. terrain type             — "grass" or "water"
 *
 * A cell matches if ANY token matches. Returns the nearest matching Point.
 */
export function resolveTargetFilter(
  tokens: string[],
  origin: Point,
  overrides: Map<string, string[]>,
  map: WorldMap,
): Point | null {
  const matchEntityIds = new Set<string>();
  const matchTerrain = new Set<string>();

  for (const token of tokens) {
    // 1. searchTarget group
    const group = SEARCH_TARGET_MAP.get(token);
    if (group) {
      for (const id of group) matchEntityIds.add(id);
    }
    // 2. direct entity tile ID
    if (TILE_BY_ID.has(token)) {
      matchEntityIds.add(token);
    }
    // 3. tile category — collect all tile IDs with that category
    for (const tile of TILES) {
      if (tile.category === token) matchEntityIds.add(tile.id);
    }
    // 4. terrain type
    if (token === "grass" || token === "water") {
      matchTerrain.add(token);
    }
  }

  let best: Point | null = null;
  let bestDist = Infinity;

  const update = (p: Point) => {
    if (p.x === origin.x && p.y === origin.y) return;
    const d = manhattan(origin, p);
    if (d < bestDist) { bestDist = d; best = p; }
  };

  // Search entity overrides (layer 3)
  if (matchEntityIds.size > 0) {
    for (const [key, layers] of overrides) {
      const l3 = layers[3];
      if (!l3 || !matchEntityIds.has(l3)) continue;
      const [xs, ys] = key.split(",");
      update({ x: parseInt(xs, 10), y: parseInt(ys, 10) });
    }
  }

  // Search terrain tiles
  if (matchTerrain.size > 0) {
    for (const [key, type] of map.iterateTerrain()) {
      if (!matchTerrain.has(type)) continue;
      // Prefer explicit terrain override (layer 0) if present
      const l0 = overrides.get(key)?.[0];
      const effectiveTerrain = (l0 && l0 !== "") ? l0 : type;
      if (!matchTerrain.has(effectiveTerrain)) continue;
      const [xs, ys] = key.split(",");
      update({ x: parseInt(xs, 10), y: parseInt(ys, 10) });
    }
  }

  return best;
}
