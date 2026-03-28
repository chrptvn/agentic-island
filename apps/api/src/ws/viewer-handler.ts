import type { WebSocket } from "ws";
import type { ViewerToHubMessage } from "@agentic-island/shared";
import { worldViewers, lastWorldState } from "./world-handler.js";
import { addLobbyViewer, removeLobbyViewer } from "./lobby.js";

export function handleViewerConnection(ws: WebSocket): void {
  let subscribedWorldId: string | null = null;
  let inLobby = false;

  ws.on("message", (raw) => {
    try {
      const msg: ViewerToHubMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case "subscribe": {
          if (subscribedWorldId) {
            const prev = worldViewers.get(subscribedWorldId);
            if (prev) {
              prev.delete(ws);
              if (prev.size === 0) worldViewers.delete(subscribedWorldId);
            }
          }

          subscribedWorldId = msg.worldId;
          if (!worldViewers.has(msg.worldId)) {
            worldViewers.set(msg.worldId, new Set());
          }
          worldViewers.get(msg.worldId)!.add(ws);

          // Immediately replay the last cached state so viewer isn't blank
          const cached = lastWorldState.get(msg.worldId);
          if (cached && ws.readyState === 1) ws.send(cached);
          break;
        }

        case "unsubscribe": {
          if (subscribedWorldId) {
            const set = worldViewers.get(subscribedWorldId);
            if (set) {
              set.delete(ws);
              if (set.size === 0) worldViewers.delete(subscribedWorldId);
            }
            subscribedWorldId = null;
          }
          break;
        }

        case "subscribe_lobby": {
          if (!inLobby) {
            inLobby = true;
            addLobbyViewer(ws);
          }
          break;
        }

        case "unsubscribe_lobby": {
          if (inLobby) {
            inLobby = false;
            removeLobbyViewer(ws);
          }
          break;
        }
      }
    } catch (err) {
      console.error("[viewer-handler] message error:", err);
    }
  });

  ws.on("close", () => {
    if (subscribedWorldId) {
      const set = worldViewers.get(subscribedWorldId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) worldViewers.delete(subscribedWorldId);
      }
    }
    if (inLobby) {
      removeLobbyViewer(ws);
    }
  });
}
