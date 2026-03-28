/**
 * Lobby manager — broadcasts island-list updates to viewers subscribed
 * to the "lobby" (the /islands listing page).
 */

import type { WebSocket } from "ws";
import type { HubToViewerMessage, IslandMeta } from "@agentic-island/shared";
import db from "../db/index.js";
import { islandViewers } from "./island-handler.js";

// ── Lobby viewer set ────────────────────────────────────────────────────────

const lobbyViewers = new Set<WebSocket>();

export function addLobbyViewer(ws: WebSocket): void {
  lobbyViewers.add(ws);
  // Send initial full island list
  sendIslandList(ws);
}

export function removeLobbyViewer(ws: WebSocket): void {
  lobbyViewers.delete(ws);
}

export function getLobbyViewerCount(): number {
  return lobbyViewers.size;
}

// ── DB query ────────────────────────────────────────────────────────────────

interface IslandRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  player_count: number;
  secured: number;
  status: string;
  last_heartbeat_at: string | null;
  created_at: string;
}

const ISLAND_COLS =
  "id, name, description, thumbnail_path, player_count, secured, status, last_heartbeat_at, created_at";

function rowToMeta(row: IslandRow, viewerCount = 0): IslandMeta {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    thumbnailUrl: row.thumbnail_path ?? undefined,
    playerCount: row.player_count,
    viewerCount,
    secured: Boolean(row.secured),
    status: row.status as "online" | "offline",
    lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
    createdAt: row.created_at,
  };
}

function getAllIslands(): IslandMeta[] {
  const rows = db
    .prepare(`SELECT ${ISLAND_COLS} FROM islands WHERE status = 'online' ORDER BY updated_at DESC`)
    .all() as IslandRow[];
  return rows.map((row) => rowToMeta(row, islandViewers.get(row.id)?.size ?? 0));
}

function getIslandById(islandId: string): IslandMeta | null {
  const row = db
    .prepare(`SELECT ${ISLAND_COLS} FROM islands WHERE id = ?`)
    .get(islandId) as IslandRow | undefined;
  return row ? rowToMeta(row, islandViewers.get(islandId)?.size ?? 0) : null;
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

function sendIslandList(ws: WebSocket): void {
  const islands = getAllIslands();
  send(ws, { type: "island_list", islands });
}

// ── Throttled island update broadcast ────────────────────────────────────────

const THROTTLE_MS = 5_000;
const pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Broadcast an island_meta_update for a single island.
 * Throttled per islandId — at most once every THROTTLE_MS.
 * Pass `immediate: true` to bypass the throttle (used for
 * online/offline transitions that should appear instantly).
 */
export function broadcastIslandUpdate(
  islandId: string,
  immediate = false,
): void {
  if (lobbyViewers.size === 0) return;

  if (immediate) {
    // Cancel any pending throttled update
    const timer = pendingUpdates.get(islandId);
    if (timer) {
      clearTimeout(timer);
      pendingUpdates.delete(islandId);
    }
    doSendIslandUpdate(islandId);
    return;
  }

  // Throttle: schedule if not already pending
  if (pendingUpdates.has(islandId)) return;
  pendingUpdates.set(
    islandId,
    setTimeout(() => {
      pendingUpdates.delete(islandId);
      doSendIslandUpdate(islandId);
    }, THROTTLE_MS),
  );
}

function doSendIslandUpdate(islandId: string): void {
  const meta = getIslandById(islandId);
  if (!meta) return;
  broadcast({ type: "island_meta_update", island: meta });
}

/** Broadcast that an island was removed (deleted). */
export function broadcastIslandRemoved(islandId: string): void {
  broadcast({ type: "island_removed", islandId });
}
