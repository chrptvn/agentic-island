import type { WebSocket } from "ws";
import type { ViewerToHubMessage } from "@agentic-island/shared";
import { islandViewers, lastIslandState } from "./island-handler.js";
import { addLobbyViewer, removeLobbyViewer } from "./lobby.js";

export function handleViewerConnection(ws: WebSocket): void {
  let subscribedIslandId: string | null = null;
  let inLobby = false;

  ws.on("message", (raw) => {
    try {
      const msg: ViewerToHubMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case "subscribe": {
          if (subscribedIslandId) {
            const prev = islandViewers.get(subscribedIslandId);
            if (prev) {
              prev.delete(ws);
              if (prev.size === 0) islandViewers.delete(subscribedIslandId);
            }
          }

          subscribedIslandId = msg.islandId;
          if (!islandViewers.has(msg.islandId)) {
            islandViewers.set(msg.islandId, new Set());
          }
          islandViewers.get(msg.islandId)!.add(ws);

          // Immediately replay the last cached state so viewer isn't blank
          const cached = lastIslandState.get(msg.islandId);
          if (cached && ws.readyState === 1) ws.send(cached);
          break;
        }

        case "unsubscribe": {
          if (subscribedIslandId) {
            const set = islandViewers.get(subscribedIslandId);
            if (set) {
              set.delete(ws);
              if (set.size === 0) islandViewers.delete(subscribedIslandId);
            }
            subscribedIslandId = null;
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
    if (subscribedIslandId) {
      const set = islandViewers.get(subscribedIslandId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) islandViewers.delete(subscribedIslandId);
      }
    }
    if (inLobby) {
      removeLobbyViewer(ws);
    }
  });
}
