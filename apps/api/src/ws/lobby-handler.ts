import type { WebSocket } from "ws";
import { addLobbyViewer, removeLobbyViewer } from "./lobby.js";

/**
 * Handle a lobby WebSocket connection (/ws/lobby).
 * Auto-subscribes on connect, auto-cleans up on close.
 */
export function handleLobbyConnection(ws: WebSocket): void {
  addLobbyViewer(ws);

  ws.on("close", () => {
    removeLobbyViewer(ws);
  });
}
