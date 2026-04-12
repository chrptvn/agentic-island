'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IslandMeta, HubToViewerMessage } from '@agentic-island/shared';

export interface IslandsStream {
  islands: IslandMeta[];
  connected: boolean;
  error: string | null;
}

const WS_RECONNECT_BASE = 1_000;
const WS_RECONNECT_MAX = 30_000;

/**
 * Subscribe to the lobby channel for real-time world list updates.
 * Returns a live-updating list of all islands.
 */
export function useIslandsStream(): IslandsStream {
  const [islands, setIslands] = useState<IslandMeta[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const islandsRef = useRef<IslandMeta[]>([]);

  const updateIslands = useCallback((next: IslandMeta[]) => {
    islandsRef.current = next;
    setIslands(next);
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
        `${protocol}//${window.location.host}/ws/lobby`,
      );

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        delay = WS_RECONNECT_BASE;
      };

      ws.onmessage = (event) => {
        try {
          const msg: HubToViewerMessage = JSON.parse(event.data as string);
          switch (msg.type) {
            case 'island_list':
              updateIslands(msg.islands);
              break;

            case 'island_meta_update': {
              const updated = msg.island;
              const prev = islandsRef.current;
              const idx = prev.findIndex((w) => w.id === updated.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                updateIslands(next);
              } else {
                // New world — add to the front of the list
                updateIslands([updated, ...prev]);
              }
              break;
            }

            case 'island_removed': {
              const prev = islandsRef.current;
              updateIslands(prev.filter((w) => w.id !== msg.islandId));
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
        ws.close();
      }
    };
  }, [updateIslands]);

  return { islands, connected, error };
}
