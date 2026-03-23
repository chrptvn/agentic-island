import type { WorldState } from "@agentic-island/shared";

export interface StateStreamerOptions {
  /** Minimum interval between state sends (ms). Default: 500 */
  minIntervalMs?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 500;

export class StateStreamer {
  private lastSendTime = 0;
  private options: Required<StateStreamerOptions>;
  private sendFn: ((state: WorldState) => void) | null = null;

  constructor(options?: StateStreamerOptions) {
    this.options = {
      minIntervalMs: options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    };
  }

  /** Register the callback invoked when a state snapshot is ready to send. */
  onStateReady(fn: (state: WorldState) => void): void {
    this.sendFn = fn;
  }

  /**
   * Called by the world update listener.
   * Throttles and forwards a snapshot to the registered send function.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleWorldUpdate(world: any): void {
    if (!this.sendFn) return;

    const now = Date.now();
    if (now - this.lastSendTime < this.options.minIntervalMs) {
      return;
    }

    const snapshot = this.buildSnapshot(world);
    this.lastSendTime = now;
    this.sendFn(snapshot);
  }

  /**
   * Build a WorldState snapshot from a World instance.
   *
   * The `world` parameter is typed as `any` to avoid tight coupling.
   * Expected methods on the world object:
   *   - getMap()          → MapData
   *   - getTileRegistry() → TileRegistry
   *   - getEntities()     → EntityInstance[]
   *   - getCharacters()   → CharacterState[]
   *   - getOverrides()    → TileOverride[]
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildSnapshot(world: any): WorldState {
    return {
      map: world.getMap(),
      tileRegistry: world.getTileRegistry(),
      entities: world.getEntities(),
      characters: world.getCharacters(),
      overrides: world.getOverrides(),
    };
  }
}
