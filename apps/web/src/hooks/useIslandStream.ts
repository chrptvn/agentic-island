'use client';

import { useState, useEffect, useRef } from 'react';
import type { IslandState, MapData, TileRegistry, HubToViewerMessage, StateDelta, EntityInstance, TileOverride } from '@agentic-island/shared';
import { computeStateHash, decodeMap, decodeEntities, decodeCharacters, decodeOverrides, decodeDelta } from '@agentic-island/shared';

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
  // Static map data — set once on map_init, persists across dynamic updates
  const mapRef = useRef<MapData | null>(null);
  const tileRegistryRef = useRef<TileRegistry | null>(null);
  const tileLookupRef = useRef<string[] | null>(null);

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

    /** Fetch static map data via HTTP (cacheable with ETag). */
    async function fetchMap(): Promise<boolean> {
      try {
        const resp = await fetch(`/api/islands/${islandId}/map`);
        if (!resp.ok) return false;
        const data = await resp.json();
        const lookup: string[] = data.tileLookup;
        tileLookupRef.current = lookup;
        tileRegistryRef.current = data.tileRegistry;
        mapRef.current = decodeMap(data.map, lookup);
        setSpriteBaseUrl(data.spriteBaseUrl);
        setSpriteVersion(data.spriteVersion ?? null);
        setIslandName(data.islandName);
        return true;
      } catch {
        return false;
      }
    }

    async function connect() {
      if (dead) return;

      // Fetch map via HTTP before opening WS
      await fetchMap();

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
            case 'map_init': {
              // Fallback: if we somehow get map_init over WS, still handle it
              const lookup = msg.tileLookup;
              tileLookupRef.current = lookup;
              tileRegistryRef.current = msg.tileRegistry;
              mapRef.current = decodeMap(msg.map, lookup);
              setSpriteBaseUrl(msg.spriteBaseUrl);
              setSpriteVersion(msg.spriteVersion ?? null);
              setIslandName(msg.islandName);
              break;
            }
            case 'map_changed': {
              // Island restarted with a new map — re-fetch via HTTP
              fetchMap().then((ok) => {
                if (ok) sendResync();
              });
              break;
            }
            case 'dynamic_state': {
              const lookup = tileLookupRef.current;
              const map = mapRef.current;
              const tileRegistry = tileRegistryRef.current;
              if (!lookup || !map || !tileRegistry) {
                // Map not available yet — try fetching, then resync
                fetchMap().then((ok) => {
                  if (ok) sendResync();
                });
                break;
              }
              const entities = decodeEntities(msg.entities, lookup);
              const characters = decodeCharacters(msg.characters, lookup);
              const overrides = decodeOverrides(msg.overrides, lookup);
              const fullState: IslandState = { map, tileRegistry, entities, characters, overrides };
              setState(fullState);
              lastHashRef.current = computeStateHash(characters, entities, overrides.length);
              break;
            }
            case 'state_delta': {
              const lookup = tileLookupRef.current;
              if (!lookup) {
                sendResync();
                break;
              }
              const delta = decodeDelta(msg.delta, lookup);
              setState((prev) => {
                if (!prev) {
                  sendResync();
                  return prev;
                }
                const updated = applyDelta(prev, delta);
                const localHash = computeStateHash(
                  updated.characters,
                  updated.entities,
                  updated.overrides.length,
                );
                if (localHash !== delta.stateHash) {
                  sendResync();
                  return prev;
                }
                lastHashRef.current = localHash;
                return updated;
              });
              break;
            }
            case 'character_update': {
              // Slim position-only update — merge onto existing character state
              setState((prev) => {
                if (!prev) return prev;
                const posMap = new Map<string, typeof msg.characters[number]>();
                for (const p of msg.characters) {
                  posMap.set(p.i, p);
                }
                const updated = prev.characters.map(c => {
                  const pos = posMap.get(c.id);
                  if (!pos) return c;
                  const merged = { ...c, x: pos.x, y: pos.y };
                  if (pos.f !== undefined) merged.facing = pos.f;
                  if (pos.sp !== undefined) {
                    merged.speech = pos.sp;
                  } else if (c.speech) {
                    merged.speech = undefined;
                  }
                  return merged;
                });
                return { ...prev, characters: updated };
              });
              break;
            }
            case 'sprite_version':
              setSpriteVersion(msg.spriteVersion ?? null);
              break;
            case 'island_offline':
              setError('Island went offline');
              setState(null);
              mapRef.current = null;
              tileLookupRef.current = null;
              tileRegistryRef.current = null;
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
