/**
 * StateBuffer — ring buffer that keeps the last N seconds of IslandState
 * snapshots for instant replay / rewind.
 *
 * Each entry is deep-cloned on push to avoid aliasing with live state.
 */

import type { IslandState } from "@agentic-island/shared";

export interface StateEntry {
  state: IslandState;
  /** `performance.now()` timestamp when the state was received */
  timestamp: number;
}

const DEFAULT_MAX_ENTRIES = 120;

export class StateBuffer {
  private buffer: StateEntry[] = [];
  private head = 0;
  private count = 0;
  private readonly max: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.max = maxEntries;
    this.buffer = new Array(maxEntries);
  }

  /** Number of entries currently stored. */
  get size(): number {
    return this.count;
  }

  /** Push a new state snapshot into the buffer. The state is deep-cloned. */
  push(state: IslandState, timestamp: number = performance.now()): void {
    const cloned = structuredClone(state);
    this.buffer[this.head] = { state: cloned, timestamp };
    this.head = (this.head + 1) % this.max;
    if (this.count < this.max) this.count++;
  }

  /** Duration in milliseconds between the oldest and newest entries. */
  duration(): number {
    if (this.count < 2) return 0;
    const oldest = this.getOldest();
    const newest = this.getNewest();
    return oldest && newest ? newest.timestamp - oldest.timestamp : 0;
  }

  /** Get the oldest entry in the buffer. */
  getOldest(): StateEntry | null {
    if (this.count === 0) return null;
    const idx = this.count < this.max ? 0 : this.head;
    return this.buffer[idx] ?? null;
  }

  /** Get the newest (most recently pushed) entry. */
  getNewest(): StateEntry | null {
    if (this.count === 0) return null;
    const idx = (this.head - 1 + this.max) % this.max;
    return this.buffer[idx] ?? null;
  }

  /**
   * Get the entry whose timestamp is closest to (but ≤) the given timestamp.
   * Returns null if the buffer is empty.
   */
  getAt(timestamp: number): StateEntry | null {
    if (this.count === 0) return null;

    const entries = this.getAll();
    let best: StateEntry | null = null;
    for (const entry of entries) {
      if (entry.timestamp <= timestamp) {
        best = entry;
      } else {
        break;
      }
    }
    return best ?? entries[0]!;
  }

  /**
   * Get the entry closest to `timestamp` regardless of direction.
   */
  getNearest(timestamp: number): StateEntry | null {
    if (this.count === 0) return null;

    const entries = this.getAll();
    let best = entries[0]!;
    let bestDist = Math.abs(best.timestamp - timestamp);

    for (let i = 1; i < entries.length; i++) {
      const dist = Math.abs(entries[i]!.timestamp - timestamp);
      if (dist < bestDist) {
        best = entries[i]!;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Get all entries in chronological order (oldest → newest). */
  getAll(): StateEntry[] {
    if (this.count === 0) return [];

    const result: StateEntry[] = [];
    const start = this.count < this.max ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.max;
      result.push(this.buffer[idx]!);
    }
    return result;
  }

  /** Clear all entries. */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
