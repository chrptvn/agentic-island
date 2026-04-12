import type {
  TileRegistry,
  CharacterState,
  TileOverride,
  WireMapData,
  WireEntityInstance,
  WireCharacterState,
  WireCharacterPosition,
  WireOverride,
  WireStateDelta,
} from "@agentic-island/shared";
import {
  buildTileLookup,
  buildEncoderMap,
  encodeMap,
  encodeEntities,
  encodeCharacters,
  encodeCharacterPositions,
  encodeOverrides,
  encodeDelta,
} from "@agentic-island/shared";
import { DirtyTracker } from "../island/dirty-tracker.js";

export interface StateStreamerOptions {
  /** Minimum interval between delta sends (ms). Default: 200 */
  minIntervalMs?: number;
  /** Minimum interval between character-only sends (ms). Default: 100 */
  charIntervalMs?: number;
}

/** Payload for the static map init message. */
export interface MapInitPayload {
  map: WireMapData;
  tileRegistry: TileRegistry;
  tileLookup: string[];
}

/** Payload for the dynamic state update message (no map). */
export interface DynamicStatePayload {
  entities: WireEntityInstance[];
  characters: WireCharacterState[];
  overrides: WireOverride[];
}

const DEFAULT_MIN_INTERVAL_MS = 200;
const DEFAULT_CHAR_INTERVAL_MS = 100;

export class StateStreamer {
  private lastSendTime = 0;
  private lastCharSendTime = 0;
  private options: Required<StateStreamerOptions>;
  private mapFn: ((payload: MapInitPayload) => void) | null = null;
  private stateFn: ((payload: DynamicStatePayload) => void) | null = null;
  private charSendFn: ((characters: WireCharacterPosition[]) => void) | null = null;
  private deltaFn: ((delta: WireStateDelta) => void) | null = null;
  private tracker = new DirtyTracker();

  private tileLookup: string[] = [];
  private encoderMap: Map<string, number> = new Map();

  constructor(options?: StateStreamerOptions) {
    this.options = {
      minIntervalMs: options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      charIntervalMs: options?.charIntervalMs ?? DEFAULT_CHAR_INTERVAL_MS,
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

  /** Register the callback for dynamic state updates (entities + characters + overrides). */
  onStateReady(fn: (payload: DynamicStatePayload) => void): void {
    this.stateFn = fn;
  }

  /** Register the callback for lightweight character position-only updates. */
  onCharacterReady(fn: (characters: WireCharacterPosition[]) => void): void {
    this.charSendFn = fn;
  }

  /** Register the callback for delta updates. */
  onDeltaReady(fn: (delta: WireStateDelta) => void): void {
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
      this.charSendFn(encodeCharacterPositions(world.getCharacters()));
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
          this.deltaFn(encodeDelta(delta, this.encoderMap));
        }
        // If delta is null, nothing changed — skip sending
      }
    }
  }

  /**
   * Force a full state snapshot (for initial connection or resync).
   * Sends map_init + dynamic state. Also seeds the tracker.
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

    // Build dynamic state
    const characters: CharacterState[] = world.getCharacters();
    const entities = world.getEntities();
    const overrides: TileOverride[] = world.getOverrides();
    const overrideVersion: number = world.getOverridesVersion?.() ?? 0;

    // Seed tracker for subsequent deltas
    this.tracker.seed(characters, entities, overrides, overrideVersion);

    // Send dynamic state
    this.stateFn?.({
      entities: encodeEntities(entities, this.encoderMap),
      characters: encodeCharacters(characters, this.encoderMap),
      overrides: encodeOverrides(overrides, this.encoderMap),
    });
  }
}

