/**
 * BFS pathfinder that operates on the tile-overrides map.
 *
 * Walkable: cells where layer-1 override === "grass"
 * Blocked:  cells with a layer-2 entity, EXCEPT the target cell itself
 *           (so characters can path to a berry bush to harvest it)
 * Always blocked: cells whose layer-2 entity ID is in blockingIds
 *           (solid obstacles like trees and rocks — never walkable, even as target)
 */

import type { Point } from "./character-registry.js";
import { isWalkableGround } from "./autotile.js";

export { Point };

export function findPath(
  start: Point,
  target: Point,
  overrides: Map<string, string[]>,
  mapWidth: number,
  mapHeight: number,
  blockingIds: Set<string> = new Set(),
): Point[] | null {
  if (start.x === target.x && start.y === target.y) return [];

  const key = (p: Point) => `${p.x},${p.y}`;

  const isWalkable = (p: Point): boolean => {
    const layers = overrides.get(key(p));
    if (!layers) return false;
    if (!isWalkableGround(layers[1] ?? "")) return false;
    const l3 = layers[3];
    // Only block if entity is in blockingIds (trees, rocks, etc.)
    if (l3 && blockingIds.has(l3)) {
      // Allow target cell so characters can path to harvestable entities
      if (p.x === target.x && p.y === target.y) return true;
      return false;
    }
    return true;
  };

  const inBounds = (p: Point) =>
    p.x >= 0 && p.x < mapWidth && p.y >= 0 && p.y < mapHeight;

  const queue: Point[] = [start];
  const came: Map<string, Point | null> = new Map([[key(start), null]]);

  const dirs: Point[] = [
    { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;

    for (const d of dirs) {
      const nb: Point = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inBounds(nb) || came.has(key(nb))) continue;
      if (!isWalkable(nb)) continue;

      came.set(key(nb), cur);

      if (nb.x === target.x && nb.y === target.y) {
        // Reconstruct path (excluding start, including target)
        const path: Point[] = [];
        let node: Point | null = nb;
        while (node && !(node.x === start.x && node.y === start.y)) {
          path.unshift(node);
          node = came.get(key(node)) ?? null;
        }
        return path;
      }

      queue.push(nb);
    }
  }

  return null; // unreachable
}
