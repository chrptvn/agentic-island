import type { EntityInstance, CharacterState, StateDelta, EntityPatch, OverridePatch, TileOverride, CharacterPatch } from "@agentic-island/shared";

/**
 * Computes state deltas by diffing the current snapshot against the previous one.
 * Attached to the StateStreamer — no island instrumentation needed.
 */
export class DirtyTracker {
  private tick = 0;

  // Previous state snapshots for diffing
  private prevCharacters: Map<string, { x: number; y: number; facing: string; statsHash: string }> = new Map();
  private prevEntities: Map<string, { tileId: string; statsHash: string }> = new Map();
  private prevOverrides: Map<string, string> = new Map(); // key: "x,y,layer" → tileId

  /**
   * Compute a delta between the current state and the previously-seen state.
   * Returns null if nothing changed (server can skip sending).
   */
  computeDelta(
    characters: CharacterState[],
    entities: EntityInstance[],
    overrides: TileOverride[],
  ): StateDelta | null {
    const characterPatches: CharacterPatch[] = [];
    const entityPatches: EntityPatch[] = [];
    const overridePatches: OverridePatch[] = [];

    // --- Character diff ---
    const currentCharMap = new Map<string, CharacterState>();
    for (const c of characters) {
      currentCharMap.set(c.id, c);
      const prev = this.prevCharacters.get(c.id);
      const statsHash = charStatsHash(c);
      if (!prev || prev.x !== c.x || prev.y !== c.y || prev.facing !== (c.facing ?? "s") || prev.statsHash !== statsHash) {
        characterPatches.push({ action: "upsert", key: c.id, character: c });
      }
    }
    // Characters that disappeared
    for (const id of this.prevCharacters.keys()) {
      if (!currentCharMap.has(id)) characterPatches.push({ action: "remove", key: id });
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
    const currentOverrideMap = new Map<string, string>();
    for (const o of overrides) {
      currentOverrideMap.set(`${o.x},${o.y},${o.layer}`, o.tileId);
    }
    for (const [key, tileId] of currentOverrideMap) {
      if (this.prevOverrides.get(key) !== tileId) {
        const [x, y, layer] = key.split(",").map(Number);
        overridePatches.push({ action: "set", x, y, layer, tileId });
      }
    }
    for (const [key] of this.prevOverrides) {
      if (!currentOverrideMap.has(key)) {
        const [x, y, layer] = key.split(",").map(Number);
        overridePatches.push({ action: "remove", x, y, layer });
      }
    }
    const overridesChanged = overridePatches.length > 0;

    // Nothing changed?
    if (characterPatches.length === 0 && entityPatches.length === 0 && !overridesChanged) {
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
    this.prevOverrides.clear();
    for (const o of overrides) {
      this.prevOverrides.set(`${o.x},${o.y},${o.layer}`, o.tileId);
    }

    // Build delta
    const delta: StateDelta = {
      tick: this.tick++,
    };

    if (characterPatches.length > 0) {
      delta.characters = characterPatches;
    }

    if (entityPatches.length > 0) {
      delta.entities = entityPatches;
    }

    if (overridePatches.length > 0) {
      delta.overrides = overridePatches;
    }

    return delta;
  }

  /** Reset all state (e.g. on full snapshot send). */
  reset(): void {
    this.prevCharacters.clear();
    this.prevEntities.clear();
    this.prevOverrides.clear();
  }

  /** Seed previous state from a full snapshot (for late-join scenarios). */
  seed(characters: CharacterState[], entities: EntityInstance[], overrides: TileOverride[]): void {
    this.prevCharacters.clear();
    for (const c of characters) {
      this.prevCharacters.set(c.id, { x: c.x, y: c.y, facing: c.facing ?? "s", statsHash: charStatsHash(c) });
    }
    this.prevEntities.clear();
    for (const e of entities) {
      this.prevEntities.set(`${e.x},${e.y}`, { tileId: e.tileId, statsHash: entityStatsHash(e) });
    }
    this.prevOverrides.clear();
    for (const o of overrides) {
      this.prevOverrides.set(`${o.x},${o.y},${o.layer}`, o.tileId);
    }
  }
}

/** Quick hash for character stats comparison. */
function charStatsHash(c: CharacterState): string {
  return `${c.stats.health},${c.stats.hunger},${c.stats.energy},${c.goal},${c.speech?.text ?? ""},${c.shelter ?? ""},${JSON.stringify(c.inventory ?? [])},${JSON.stringify(c.equipment ?? {})}`;
}

/** Quick hash for entity stats comparison. */
function entityStatsHash(e: EntityInstance): string {
  const numericKeys = Object.keys(e.stats).filter(k => typeof (e.stats as Record<string, unknown>)[k] === "number").sort();
  const numericHash = numericKeys.map(k => `${k}=${e.stats[k]}`).join(",");
  const invHash = e.inventory ? JSON.stringify(e.inventory) : "";
  const occHash = e.occupants ? e.occupants.join(",") : "";
  return `${numericHash}|${invHash}|${occHash}`;
}

