import type { IslandState, CharacterState } from "@agentic-island/shared";

export interface StateStreamerOptions {
  /** Minimum interval between full state sends (ms). Default: 200 */
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
  private sendFn: ((state: IslandState) => void) | null = null;
  private charSendFn: ((characters: CharacterState[]) => void) | null = null;

  constructor(options?: StateStreamerOptions) {
    this.options = {
      minIntervalMs: options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      charIntervalMs: options?.charIntervalMs ?? DEFAULT_CHAR_INTERVAL_MS,
    };
  }

  /** Register the callback invoked when a full state snapshot is ready to send. */
  onStateReady(fn: (state: IslandState) => void): void {
    this.sendFn = fn;
  }

  /** Register the callback for lightweight character-only updates. */
  onCharacterReady(fn: (characters: CharacterState[]) => void): void {
    this.charSendFn = fn;
  }

  /**
   * Called by the island update listener.
   * Sends a fast character-only update AND throttled full state.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleIslandUpdate(world: any): void {
    const now = Date.now();

    // Fast path: character-only updates at high frequency
    if (this.charSendFn && now - this.lastCharSendTime >= this.options.charIntervalMs) {
      this.lastCharSendTime = now;
      this.charSendFn(world.getCharacters());
    }

    // Full state path at lower frequency
    if (this.sendFn && now - this.lastSendTime >= this.options.minIntervalMs) {
      const snapshot = this.buildSnapshot(world);
      this.lastSendTime = now;
      // Align char send time to avoid redundant immediate character_update
      this.lastCharSendTime = now;
      this.sendFn(snapshot);
    }
  }

  /**
   * Build a IslandState snapshot from a Island instance.
   *
   * The `island` parameter is typed as `any` to avoid tight coupling.
   * Expected methods on the island object:
   *   - getMap()          → MapData
   *   - getTileRegistry() → TileRegistry
   *   - getEntities()     → EntityInstance[]
   *   - getCharacters()   → CharacterState[]
   *   - getOverrides()    → TileOverride[]
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
