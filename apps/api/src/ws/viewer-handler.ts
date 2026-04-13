import type { WebSocket } from "ws";
import { islandViewers, deltaBuffers } from "./island-handler.js";

/**
 * Handle a viewer connection scoped to a single island.
 * The islandId is extracted from the URL path by the caller.
 * Auto-subscribes on connect, auto-cleans up on close.
 * Replays buffered deltas so the client can catch up from its HTTP-fetched tick.
 */
export function handleIslandViewerConnection(ws: WebSocket, islandId: string): void {
  // Auto-subscribe
  if (!islandViewers.has(islandId)) {
    islandViewers.set(islandId, new Set());
  }
  islandViewers.get(islandId)!.add(ws);

  // Replay buffered deltas so client can bridge the gap from HTTP initial state
  const buffer = deltaBuffers.get(islandId);
  if (buffer && ws.readyState === 1) {
    for (const entry of buffer) {
      if (ws.readyState !== 1) break;
      ws.send(entry.json);
    }
  }

  ws.on("close", () => {
    const set = islandViewers.get(islandId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) islandViewers.delete(islandId);
    }
  });
}
