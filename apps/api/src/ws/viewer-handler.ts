import type { WebSocket } from "ws";
import { islandViewers, lastDynamicState } from "./island-handler.js";

/**
 * Handle a viewer connection scoped to a single island.
 * The islandId is extracted from the URL path by the caller.
 * Auto-subscribes on connect, auto-cleans up on close.
 */
export function handleIslandViewerConnection(ws: WebSocket, islandId: string): void {
  // Auto-subscribe
  if (!islandViewers.has(islandId)) {
    islandViewers.set(islandId, new Set());
  }
  islandViewers.get(islandId)!.add(ws);

  // Send cached dynamic state immediately
  const cachedState = lastDynamicState.get(islandId);
  if (cachedState && ws.readyState === 1) ws.send(cachedState);

  ws.on("close", () => {
    const set = islandViewers.get(islandId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) islandViewers.delete(islandId);
    }
  });
}
