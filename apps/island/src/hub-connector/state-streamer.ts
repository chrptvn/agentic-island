import type {
  TileRegistry,
  CharacterState,
  TileOverride,
  WireMapData,
  WireEntityInstance,
  WireCharacterState,
  WireOverride,
  WireStateDelta,
} from "@agentic-island/shared";
import {
  buildTileLookup,
  buildEncoderMap,
  encodeMap,
  encodeEntities,
  encodeCharacters,
  encodeOverrides,
  encodeDelta,
} from "@agentic-island/shared";
import { DirtyTracker } from "../island/dirty-tracker.js";

export interface StateStreamerOptions {
  /** Minimum interval between delta sends (ms). Default: 200 */
  minIntervalMs?: number;
}

/** Payload for the static map init message. */
export interface MapInitPayload {
  map: WireMapData;
  tileRegistry: TileRegistry;
  tileLookup: string[];
}

/** Payload for the initial state snapshot (no map). */
export interface InitialStatePayload {
  entities: WireEntityInstance[];
  characters: WireCharacterState[];
  overrides: WireOverride[];
}

const DEFAULT_MIN_INTERVAL_MS = 200;

export class StateStreamer {
  private lastSendTime = 0;
  private options: Required<StateStreamerOptions>;
  private mapFn: ((payload: MapInitPayload) => void) | null = null;
  private stateFn: ((payload: InitialStatePayload) => void) | null = null;
  private deltaFn: ((delta: WireStateDelta) => void) | null = null;
  private tracker = new DirtyTracker();

  private tileLookup: string[] = [];
  private encoderMap: Map<string, number> = new Map();

  constructor(options?: StateStreamerOptions) {
    this.options = {
      minIntervalMs: options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    };
  }

  /** Initialize the tile lookup from the registry. Must be called before streaming. */
  setTileRegistry(registry: TileRegistry): void {
    this.tileLookup = buildTileLookup(registry);
    this.encoderMap = buildEncoderMap(this.tileLookup);
  }

  /** Register the callback for static map init (map + registry + lookup). */
  onMapReady(fn: (payload: MapInitPayload) => void): void {
    this.mapFn = fn;
  }

  /** Register the callback for initial state snapshots (entities + characters + overrides). */
  onStateReady(fn: (payload: InitialStatePayload) => void): void {
    this.stateFn = fn;
  }

  /** Register the callback for delta updates. */
  onDeltaReady(fn: (delta: WireStateDelta) => void): void {
    this.deltaFn = fn;
  }

  /**
   * Called by the island update listener.
   * Sends throttled deltas at the configured interval.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleIslandUpdate(world: any): void {
    const now = Date.now();

    if (now - this.lastSendTime >= this.options.minIntervalMs) {
      this.lastSendTime = now;

      if (this.deltaFn) {
        const characters: CharacterState[] = world.getCharacters();
        const entities = world.getEntities();
        const overrides: TileOverride[] = world.getOverrides();
        const overrideVersion: number = world.getOverridesVersion?.() ?? 0;

        const delta = this.tracker.computeDelta(characters, entities, overrides, overrideVersion);
        if (delta) {
          this.deltaFn(encodeDelta(delta, this.encoderMap));
        }
      }
    }
  }

  /**
   * Force a full state snapshot (for initial connection).
   * Sends map_init + initial state. Also seeds the tracker.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendFullSnapshot(world: any): void {
    const registry: TileRegistry = world.getTileRegistry();

    // Ensure lookup is initialized
    if (this.tileLookup.length === 0) {
      this.setTileRegistry(registry);
    }

    // Send map_init (static data)
    this.mapFn?.({
      map: encodeMap(world.getMap(), this.encoderMap),
      tileRegistry: registry,
      tileLookup: this.tileLookup,
    });

    // Send initial state (also seeds tracker)
    this.sendInitialState(world);
  }

  /**
   * Send the initial state snapshot (entities, characters, overrides).
   * Seeds the tracker for subsequent delta computation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendInitialState(world: any): void {
    // Ensure lookup is initialized
    if (this.tileLookup.length === 0) {
      const registry: TileRegistry = world.getTileRegistry();
      this.setTileRegistry(registry);
    }

    const characters: CharacterState[] = world.getCharacters();
    const entities = world.getEntities();
    const overrides: TileOverride[] = world.getOverrides();
    const overrideVersion: number = world.getOverridesVersion?.() ?? 0;

    // Seed tracker for subsequent deltas
    this.tracker.seed(characters, entities, overrides, overrideVersion);

    // Send initial state
    this.stateFn?.({
      entities: encodeEntities(entities, this.encoderMap),
      characters: encodeCharacters(characters, this.encoderMap),
      overrides: encodeOverrides(overrides, this.encoderMap),
    });
  }
}
