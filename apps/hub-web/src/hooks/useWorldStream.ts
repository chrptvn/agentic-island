import { useState, useEffect, useRef } from "react";
import type { WorldState, HubToViewerMessage } from "@agentic-island/shared";

export interface WorldStream {
  state: WorldState | null;
  spriteBaseUrl: string | null;
  connected: boolean;
  error: string | null;
}

export function useWorldStream(worldId: string | undefined): WorldStream {
  const [state, setState] = useState<WorldState | null>(null);
  const [spriteBaseUrl, setSpriteBaseUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!worldId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/viewer`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      ws.send(JSON.stringify({ type: "subscribe", worldId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: HubToViewerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "world_state":
            setState(msg.state);
            setSpriteBaseUrl(msg.spriteBaseUrl);
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
    };

    ws.onerror = () => {
      setError("Connection failed");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [worldId]);

  return { state, spriteBaseUrl, connected, error };
}
