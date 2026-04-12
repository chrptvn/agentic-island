import type { EntityInstance } from "./types/entity.js";
import type { CharacterState } from "./types/character.js";
import type { TileOverride } from "./types/island.js";

// ---------------------------------------------------------------------------
// Patch types
// ---------------------------------------------------------------------------

export interface EntityPatch {
  action: "upsert" | "remove";
  /** Composite key: "x,y" */
  key: string;
  entity?: EntityInstance;
}

export interface OverridePatch {
  action: "set" | "remove";
  x: number;
  y: number;
  layer: number;
  tileId?: string;
}

// ---------------------------------------------------------------------------
// Delta message (island → hub → viewer)
// ---------------------------------------------------------------------------

export interface StateDelta {
  tick: number;
  stateHash: string;
  characters?: CharacterState[];
  entities?: EntityPatch[];
  overrides?: OverridePatch[];
}

// ---------------------------------------------------------------------------
// State hashing — deterministic FNV-1a based hash
// ---------------------------------------------------------------------------

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function fnv1a(str: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * FNV_PRIME) >>> 0;
  }
  return hash;
}

/**
 * Compute a deterministic hash string from the mutable parts of island state.
 * Both server and client must call this with the same data to get the same result.
 *
 * Inputs:
 * - characters: sorted by id, hashes id + x + y + facing
 * - entities: sorted by x,y,tileId, hashes position + tileId + stat keys/values
 * - overrideCount: number of tile overrides (avoids hashing the full array)
 */
export function computeStateHash(
  characters: CharacterState[],
  entities: EntityInstance[],
  overrideCount: number,
): string {
  const parts: string[] = [];

  // Characters — sorted by id for determinism
  const sortedChars = [...characters].sort((a, b) => a.id.localeCompare(b.id));
  for (const c of sortedChars) {
    parts.push(`c:${c.id},${c.x},${c.y},${c.facing ?? "s"}`);
  }

  // Entities — sorted by position + tileId for determinism
  const sortedEntities = [...entities].sort((a, b) => {
    const d = a.x - b.x;
    if (d !== 0) return d;
    const dy = a.y - b.y;
    if (dy !== 0) return dy;
    return a.tileId.localeCompare(b.tileId);
  });
  for (const e of sortedEntities) {
    // Include tileId + stat values that change (health, fuel, etc.)
    const statStr = Object.keys(e.stats).sort().map(k => `${k}=${e.stats[k]}`).join(",");
    parts.push(`e:${e.x},${e.y},${e.tileId},${statStr}`);
  }

  // Override count
  parts.push(`o:${overrideCount}`);

  const combined = parts.join("|");
  const hash = fnv1a(combined);
  return hash.toString(36);
}
