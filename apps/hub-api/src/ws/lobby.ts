/**
 * Lobby manager — broadcasts world-list updates to viewers subscribed
 * to the "lobby" (the /worlds listing page).
 */

import type { WebSocket } from "ws";
import type { HubToViewerMessage, WorldMeta } from "@agentic-island/shared";
import db from "../db/index.js";

// ── Lobby viewer set ────────────────────────────────────────────────────────

const lobbyViewers = new Set<WebSocket>();

export function addLobbyViewer(ws: WebSocket): void {
  lobbyViewers.add(ws);
  // Send initial full world list
  sendWorldList(ws);
}

export function removeLobbyViewer(ws: WebSocket): void {
  lobbyViewers.delete(ws);
}

export function getLobbyViewerCount(): number {
  return lobbyViewers.size;
}

// ── DB query ────────────────────────────────────────────────────────────────

interface WorldRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  player_count: number;
  status: string;
  last_heartbeat_at: string | null;
  created_at: string;
}

const WORLD_COLS =
  "id, name, description, thumbnail_path, player_count, status, last_heartbeat_at, created_at";

function rowToMeta(row: WorldRow): WorldMeta {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    thumbnailUrl: row.thumbnail_path ?? undefined,
    playerCount: row.player_count,
    status: row.status as "online" | "offline",
    lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
    createdAt: row.created_at,
  };
}

function getAllWorlds(): WorldMeta[] {
  const rows = db
    .prepare(`SELECT ${WORLD_COLS} FROM worlds WHERE status = 'online' ORDER BY updated_at DESC`)
    .all() as WorldRow[];
  return rows.map(rowToMeta);
}

function getWorldById(worldId: string): WorldMeta | null {
  const row = db
    .prepare(`SELECT ${WORLD_COLS} FROM worlds WHERE id = ?`)
    .get(worldId) as WorldRow | undefined;
  return row ? rowToMeta(row) : null;
}

// ── Broadcast helpers ───────────────────────────────────────────────────────

function send(ws: WebSocket, msg: HubToViewerMessage): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg: HubToViewerMessage): void {
  if (lobbyViewers.size === 0) return;
  const payload = JSON.stringify(msg);
  for (const ws of lobbyViewers) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

function sendWorldList(ws: WebSocket): void {
  const worlds = getAllWorlds();
  send(ws, { type: "world_list", worlds });
}

// ── Throttled world update broadcast ────────────────────────────────────────

const THROTTLE_MS = 5_000;
const pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Broadcast a world_meta_update for a single world.
 * Throttled per worldId — at most once every THROTTLE_MS.
 * Pass `immediate: true` to bypass the throttle (used for
 * online/offline transitions that should appear instantly).
 */
export function broadcastWorldUpdate(
  worldId: string,
  immediate = false,
): void {
  if (lobbyViewers.size === 0) return;

  if (immediate) {
    // Cancel any pending throttled update
    const timer = pendingUpdates.get(worldId);
    if (timer) {
      clearTimeout(timer);
      pendingUpdates.delete(worldId);
    }
    doSendWorldUpdate(worldId);
    return;
  }

  // Throttle: schedule if not already pending
  if (pendingUpdates.has(worldId)) return;
  pendingUpdates.set(
    worldId,
    setTimeout(() => {
      pendingUpdates.delete(worldId);
      doSendWorldUpdate(worldId);
    }, THROTTLE_MS),
  );
}

function doSendWorldUpdate(worldId: string): void {
  const meta = getWorldById(worldId);
  if (!meta) return;
  broadcast({ type: "world_meta_update", world: meta });
}

/** Broadcast that a world was removed (deleted). */
export function broadcastWorldRemoved(worldId: string): void {
  broadcast({ type: "world_removed", worldId });
}
