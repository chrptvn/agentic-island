import type { IslandState, CharacterState, StateDelta, TileOverride } from "@agentic-island/shared";
import { DirtyTracker } from "../island/dirty-tracker.js";

export interface StateStreamerOptions {
  /** Minimum interval between delta sends (ms). Default: 200 */
  minIntervalMs?: number;
  /** Minimum interval between character-only sends (ms). Default: 100 */
  charIntervalMs?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 200;
const DEFAULT_CHAR_INTERVAL_MS = 100;

export class StateStreamer {
  private lastSendTime = 0;
  private lastCharSendTime = 0;
  private options: Required<StateStreamerOptions>;
  private snapshotFn: ((state: IslandState) => void) | null = null;
  private charSendFn: ((characters: CharacterState[]) => void) | null = null;
  private deltaFn: ((delta: StateDelta) => void) | null = null;
  private tracker = new DirtyTracker();

  constructor(options?: StateStreamerOptions) {
    this.options = {
      minIntervalMs: options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      charIntervalMs: options?.charIntervalMs ?? DEFAULT_CHAR_INTERVAL_MS,
    };
  }

  /** Register the callback for full state snapshots (initial connect / resync). */
  onStateReady(fn: (state: IslandState) => void): void {
    this.snapshotFn = fn;
  }

  /** Register the callback for lightweight character-only updates. */
  onCharacterReady(fn: (characters: CharacterState[]) => void): void {
    this.charSendFn = fn;
  }

  /** Register the callback for delta updates. */
  onDeltaReady(fn: (delta: StateDelta) => void): void {
    this.deltaFn = fn;
  }

  /**
   * Called by the island update listener.
   * Sends fast character-only updates AND throttled deltas.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleIslandUpdate(world: any): void {
    const now = Date.now();

    // Fast path: character-only updates at high frequency
    if (this.charSendFn && now - this.lastCharSendTime >= this.options.charIntervalMs) {
      this.lastCharSendTime = now;
      this.charSendFn(world.getCharacters());
    }

    // Delta path at lower frequency
    if (now - this.lastSendTime >= this.options.minIntervalMs) {
      this.lastSendTime = now;
      this.lastCharSendTime = now;

      if (this.deltaFn) {
        const characters: CharacterState[] = world.getCharacters();
        const entities = world.getEntities();
        const overrides: TileOverride[] = world.getOverrides();
        const overrideVersion: number = world.getOverridesVersion?.() ?? 0;

        const delta = this.tracker.computeDelta(characters, entities, overrides, overrideVersion);
        if (delta) {
          this.deltaFn(delta);
        }
        // If delta is null, nothing changed — skip sending
      } else if (this.snapshotFn) {
        // Fallback: no delta listener → send full snapshot (backward compat)
        this.snapshotFn(this.buildSnapshot(world));
      }
    }
  }

  /**
   * Force a full state snapshot (for initial connection or resync).
   * Also seeds the tracker so subsequent deltas are correct.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendFullSnapshot(world: any): void {
    const snapshot = this.buildSnapshot(world);
    const overrideVersion: number = world.getOverridesVersion?.() ?? 0;
    this.tracker.seed(snapshot.characters, snapshot.entities, snapshot.overrides, overrideVersion);
    this.snapshotFn?.(snapshot);
  }

  /**
   * Build a IslandState snapshot from a Island instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildSnapshot(island: any): IslandState {
    return {
      map: island.getMap(),
      tileRegistry: island.getTileRegistry(),
      entities: island.getEntities(),
      characters: island.getCharacters(),
      overrides: island.getOverrides(),
    };
  }
}

