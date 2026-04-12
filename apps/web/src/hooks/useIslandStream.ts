'use client';

import { useState, useEffect, useRef } from 'react';
import type { IslandState, HubToViewerMessage, StateDelta, EntityInstance, TileOverride } from '@agentic-island/shared';
import { computeStateHash } from '@agentic-island/shared';

export interface IslandStream {
  state: IslandState | null;
  spriteBaseUrl: string | null;
  spriteVersion: string | null;
  islandName: string | null;
  connected: boolean;
  error: string | null;
}

const WS_RECONNECT_BASE = 1_000;
const WS_RECONNECT_MAX = 30_000;

/**
 * Apply a StateDelta to the current IslandState, returning a new object.
 * Only touches the fields present in the delta.
 */
function applyDelta(prev: IslandState, delta: StateDelta): IslandState {
  let next = prev;

  if (delta.characters) {
    next = { ...next, characters: delta.characters };
  }

  if (delta.entities && delta.entities.length > 0) {
    const entityMap = new Map<string, EntityInstance>();
    for (const e of next.entities) {
      entityMap.set(`${e.x},${e.y}`, e);
    }
    for (const patch of delta.entities) {
      if (patch.action === "upsert" && patch.entity) {
        entityMap.set(patch.key, patch.entity);
      } else if (patch.action === "remove") {
        entityMap.delete(patch.key);
      }
    }
    next = { ...next, entities: Array.from(entityMap.values()) };
  }

  if (delta.overrides && delta.overrides.length > 0) {
    const overrideMap = new Map<string, TileOverride>();
    for (const o of next.overrides) {
      overrideMap.set(`${o.x},${o.y},${o.layer}`, o);
    }
    for (const patch of delta.overrides) {
      const key = `${patch.x},${patch.y},${patch.layer}`;
      if (patch.action === "set" && patch.tileId !== undefined) {
        overrideMap.set(key, { x: patch.x, y: patch.y, layer: patch.layer, tileId: patch.tileId });
      } else if (patch.action === "remove") {
        overrideMap.delete(key);
      }
    }
    next = { ...next, overrides: Array.from(overrideMap.values()) };
  }

  return next;
}

export function useIslandStream(islandId: string | undefined): IslandStream {
  const [state, setState] = useState<IslandState | null>(null);
  const [spriteBaseUrl, setSpriteBaseUrl] = useState<string | null>(null);
  const [spriteVersion, setSpriteVersion] = useState<string | null>(null);
  const [islandName, setIslandName] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the last known hash so we can detect mismatches
  const lastHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (!islandId) return;

    let dead = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = WS_RECONNECT_BASE;

    function sendResync() {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'resync_request', islandId }));
      }
    }

    function connect() {
      if (dead) return;

      const protocol =
        window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/viewer`,
      );

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        delay = WS_RECONNECT_BASE;
        lastHashRef.current = null;
        ws!.send(JSON.stringify({ type: 'subscribe', islandId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: HubToViewerMessage = JSON.parse(event.data as string);
          switch (msg.type) {
            case 'island_state':
              setState(msg.state);
              setSpriteBaseUrl(msg.spriteBaseUrl);
              setSpriteVersion(msg.spriteVersion ?? null);
              setIslandName(msg.islandName);
              // Seed hash from the full state
              lastHashRef.current = computeStateHash(
                msg.state.characters,
                msg.state.entities,
                msg.state.overrides.length,
              );
              break;
            case 'state_delta':
              setState((prev) => {
                if (!prev) {
                  // No base state yet — request full snapshot
                  sendResync();
                  return prev;
                }
                const updated = applyDelta(prev, msg.delta);
                // Verify hash
                const localHash = computeStateHash(
                  updated.characters,
                  updated.entities,
                  updated.overrides.length,
                );
                if (localHash !== msg.delta.stateHash) {
                  // Hash mismatch — request resync
                  sendResync();
                  return prev; // keep old state until resync arrives
                }
                lastHashRef.current = localHash;
                return updated;
              });
              break;
            case 'character_update':
              setState((prev) => {
                if (!prev) return prev;
                return { ...prev, characters: msg.characters };
              });
              break;
            case 'sprite_version':
              setSpriteVersion(msg.spriteVersion ?? null);
              break;
            case 'island_offline':
              setError('Island went offline');
              setState(null);
              lastHashRef.current = null;
              break;
            case 'error':
              setError(msg.message);
              break;
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        ws = null;
        if (!dead) {
          timer = setTimeout(() => {
            delay = Math.min(delay * 2, WS_RECONNECT_MAX);
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        setError('Connection failed');
      };
    }

    connect();

    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      if (ws) ws.close();
    };
  }, [islandId]);

  return { state, spriteBaseUrl, spriteVersion, islandName, connected, error };
}
