'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorldMeta, HubToViewerMessage } from '@agentic-island/shared';

export interface WorldsStream {
  worlds: WorldMeta[];
  connected: boolean;
  error: string | null;
}

const WS_RECONNECT_BASE = 1_000;
const WS_RECONNECT_MAX = 30_000;

/**
 * Subscribe to the lobby channel for real-time world list updates.
 * Returns a live-updating list of all worlds.
 */
export function useWorldsStream(): WorldsStream {
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worldsRef = useRef<WorldMeta[]>([]);

  const updateWorlds = useCallback((next: WorldMeta[]) => {
    worldsRef.current = next;
    setWorlds(next);
  }, []);

  useEffect(() => {
    let dead = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = WS_RECONNECT_BASE;

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
        ws!.send(JSON.stringify({ type: 'subscribe_lobby' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: HubToViewerMessage = JSON.parse(event.data as string);
          switch (msg.type) {
            case 'world_list':
              updateWorlds(msg.worlds);
              break;

            case 'world_meta_update': {
              const updated = msg.world;
              const prev = worldsRef.current;
              const idx = prev.findIndex((w) => w.id === updated.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                updateWorlds(next);
              } else {
                // New world — add to the front of the list
                updateWorlds([updated, ...prev]);
              }
              break;
            }

            case 'world_removed': {
              const prev = worldsRef.current;
              updateWorlds(prev.filter((w) => w.id !== msg.worldId));
              break;
            }

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
      if (ws) {
        ws.send(JSON.stringify({ type: 'unsubscribe_lobby' }));
        ws.close();
      }
    };
  }, [updateWorlds]);

  return { worlds, connected, error };
}
