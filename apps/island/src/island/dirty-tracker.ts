import type { EntityInstance, CharacterState, StateDelta, EntityPatch, OverridePatch, TileOverride } from "@agentic-island/shared";

/**
 * Computes state deltas by diffing the current snapshot against the previous one.
 * Attached to the StateStreamer — no island instrumentation needed.
 */
export class DirtyTracker {
  private tick = 0;

  // Previous state snapshots for diffing
  private prevCharacters: Map<string, { x: number; y: number; facing: string; statsHash: string }> = new Map();
  private prevEntities: Map<string, { tileId: string; statsHash: string }> = new Map();
  private prevOverrideCount = 0;
  private prevOverrideVersion = -1;

  /**
   * Compute a delta between the current state and the previously-seen state.
   * Returns null if nothing changed (server can skip sending).
   */
  computeDelta(
    characters: CharacterState[],
    entities: EntityInstance[],
    overrides: TileOverride[],
    overrideVersion: number,
  ): StateDelta | null {
    const changedCharIds = new Set<string>();
    const entityPatches: EntityPatch[] = [];
    let overridePatches: OverridePatch[] | undefined;

    // --- Character diff ---
    const currentCharMap = new Map<string, CharacterState>();
    for (const c of characters) {
      currentCharMap.set(c.id, c);
      const prev = this.prevCharacters.get(c.id);
      const statsHash = charStatsHash(c);
      if (!prev || prev.x !== c.x || prev.y !== c.y || prev.facing !== (c.facing ?? "s") || prev.statsHash !== statsHash) {
        changedCharIds.add(c.id);
      }
    }
    // Characters that disappeared
    for (const id of this.prevCharacters.keys()) {
      if (!currentCharMap.has(id)) changedCharIds.add(id);
    }

    // --- Entity diff ---
    const currentEntityMap = new Map<string, EntityInstance>();
    for (const e of entities) {
      const key = `${e.x},${e.y}`;
      currentEntityMap.set(key, e);
      const prev = this.prevEntities.get(key);
      const sh = entityStatsHash(e);
      if (!prev || prev.tileId !== e.tileId || prev.statsHash !== sh) {
        entityPatches.push({ action: "upsert", key, entity: e });
      }
    }
    // Entities that disappeared
    for (const key of this.prevEntities.keys()) {
      if (!currentEntityMap.has(key)) {
        entityPatches.push({ action: "remove", key });
      }
    }

    // --- Override diff ---
    const overridesChanged = overrideVersion !== this.prevOverrideVersion;
    if (overridesChanged) {
      // Overrides changed — send full override set as patches (simpler than true diff)
      overridePatches = overrides.map(o => ({
        action: "set" as const,
        x: o.x,
        y: o.y,
        layer: o.layer,
        tileId: o.tileId,
      }));
    }

    // Nothing changed?
    if (changedCharIds.size === 0 && entityPatches.length === 0 && !overridesChanged) {
      return null;
    }

    // Update previous state snapshots
    this.prevCharacters.clear();
    for (const c of characters) {
      this.prevCharacters.set(c.id, { x: c.x, y: c.y, facing: c.facing ?? "s", statsHash: charStatsHash(c) });
    }
    this.prevEntities.clear();
    for (const e of entities) {
      this.prevEntities.set(`${e.x},${e.y}`, { tileId: e.tileId, statsHash: entityStatsHash(e) });
    }
    this.prevOverrideCount = overrides.length;
    this.prevOverrideVersion = overrideVersion;

    // Build delta
    const delta: StateDelta = {
      tick: this.tick++,
    };

    if (changedCharIds.size > 0) {
      // Send all characters (including removals implicitly — viewer replaces full array)
      // This is simpler than individual patches for characters since they change frequently
      delta.characters = characters;
    }

    if (entityPatches.length > 0) {
      delta.entities = entityPatches;
    }

    if (overridePatches) {
      delta.overrides = overridePatches;
    }

    return delta;
  }

  /** Reset all state (e.g. on full snapshot send). */
  reset(): void {
    this.prevCharacters.clear();
    this.prevEntities.clear();
    this.prevOverrideCount = 0;
    this.prevOverrideVersion = -1;
  }

  /** Seed previous state from a full snapshot (for late-join scenarios). */
  seed(characters: CharacterState[], entities: EntityInstance[], overrides: TileOverride[], overrideVersion: number): void {
    this.prevCharacters.clear();
    for (const c of characters) {
      this.prevCharacters.set(c.id, { x: c.x, y: c.y, facing: c.facing ?? "s", statsHash: charStatsHash(c) });
    }
    this.prevEntities.clear();
    for (const e of entities) {
      this.prevEntities.set(`${e.x},${e.y}`, { tileId: e.tileId, statsHash: entityStatsHash(e) });
    }
    this.prevOverrideCount = overrides.length;
    this.prevOverrideVersion = overrideVersion;
  }
}

/** Quick hash for character stats comparison. */
function charStatsHash(c: CharacterState): string {
  return `${c.stats.health},${c.stats.hunger},${c.stats.energy},${c.goal},${c.speech?.text ?? ""}`;
}

/** Quick hash for entity stats comparison. */
function entityStatsHash(e: EntityInstance): string {
  const keys = Object.keys(e.stats).sort();
  return keys.map(k => `${k}=${e.stats[k]}`).join(",");
}

