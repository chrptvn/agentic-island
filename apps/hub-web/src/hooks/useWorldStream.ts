import { useState, useEffect, useRef, useCallback } from "react";
import type { WorldState, HubToViewerMessage } from "@agentic-island/shared";

export interface WorldStream {
  state: WorldState | null;
  spriteBaseUrl: string | null;
  worldName: string | null;
  connected: boolean;
  error: string | null;
}

const WS_RECONNECT_BASE = 1_000;
const WS_RECONNECT_MAX = 30_000;

export function useWorldStream(worldId: string | undefined): WorldStream {
  const [state, setState] = useState<WorldState | null>(null);
  const [spriteBaseUrl, setSpriteBaseUrl] = useState<string | null>(null);
  const [worldName, setWorldName] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(WS_RECONNECT_BASE);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (!worldId || unmounted.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/viewer`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectDelay.current = WS_RECONNECT_BASE;
      ws.send(JSON.stringify({ type: "subscribe", worldId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: HubToViewerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "world_state":
            setState(msg.state);
            setSpriteBaseUrl(msg.spriteBaseUrl);
            setWorldName(msg.worldName);
            break;
          case "world_offline":
            setError("World went offline");
            setState(null);
            break;
          case "error":
            setError(msg.message);
            break;
        }
      } catch {
        /* ignore parse errors */
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (!unmounted.current) {
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, WS_RECONNECT_MAX);
          connect();
        }, reconnectDelay.current);
      }
    };

    ws.onerror = () => {
      setError("Connection failed");
    };
  }, [worldId]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { state, spriteBaseUrl, worldName, connected, error };
}
