'use client';

import { useState, useEffect } from 'react';
import type { IslandState, HubToViewerMessage } from '@agentic-island/shared';

export interface IslandStream {
  state: IslandState | null;
  spriteBaseUrl: string | null;
  islandName: string | null;
  secured: boolean;
  connected: boolean;
  error: string | null;
}

const WS_RECONNECT_BASE = 1_000;
const WS_RECONNECT_MAX = 30_000;

export function useIslandStream(islandId: string | undefined): IslandStream {
  const [state, setState] = useState<IslandState | null>(null);
  const [spriteBaseUrl, setSpriteBaseUrl] = useState<string | null>(null);
  const [islandName, setIslandName] = useState<string | null>(null);
  const [secured, setSecured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!islandId) return;

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
        ws!.send(JSON.stringify({ type: 'subscribe', islandId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: HubToViewerMessage = JSON.parse(event.data as string);
          switch (msg.type) {
            case 'island_state':
              setState(msg.state);
              setSpriteBaseUrl(msg.spriteBaseUrl);
              setIslandName(msg.islandName);
              setSecured(msg.secured ?? false);
              break;
            case 'island_offline':
              setError('Island went offline');
              setState(null);
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

  return { state, spriteBaseUrl, islandName, secured, connected, error };
}
