import type { WebSocket } from "ws";
import type {
  IslandToHubMessage,
  HubToIslandMessage,
} from "@agentic-island/shared";
import { createHash, randomUUID } from "node:crypto";
import db from "../db/index.js";
import { saveSprites, saveThumbnail } from "../cache/sprites.js";
import { deliverTunnelResponse, closeProxySession, closeAllSessionsForIsland } from "../mcp-proxy/sessions.js";
import { broadcastIslandUpdate, broadcastIslandRemoved } from "./lobby.js";

interface ConnectedIsland {
  ws: WebSocket;
  islandId: string;
  apiKeyId: string;
  islandName: string;
  lastPing: number;
}

const connectedIslands = new Map<string, ConnectedIsland>();

// islandId → set of viewer WebSockets (shared with viewer-handler)
export const islandViewers = new Map<string, Set<WebSocket>>();

// Cache the last state payload per island so new viewers get an immediate snapshot
export const lastIslandState = new Map<string, string>();

// Cache the sprite content hash per island for URL cache busting
const spriteHashes = new Map<string, string>();

// Cache last known player count per island to avoid redundant DB writes
const lastPlayerCounts = new Map<string, number>();

// Pending passport requests: requestId → resolve callback
// Used to correlate passport_request (Hub→Island) with passport_response (Island→Hub)
interface PendingPassportRequest {
  resolve: (response: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  islandId: string;
}
const pendingPassportRequests = new Map<string, PendingPassportRequest>();

/** Send a passport request to an island and await the response. */
export function sendPassportRequest(
  islandId: string,
  request: HubToIslandMessage,
  requestId: string,
  timeoutMs = 15_000,
): Promise<unknown> {
  const island = connectedIslands.get(islandId);
  if (!island) return Promise.reject(new Error("Island not online"));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPassportRequests.delete(requestId);
      reject(new Error("Passport request timed out"));
    }, timeoutMs);

    pendingPassportRequests.set(requestId, { resolve, timer, islandId });

    try {
      island.ws.send(JSON.stringify(request));
    } catch (err) {
      clearTimeout(timer);
      pendingPassportRequests.delete(requestId);
      reject(err);
    }
  });
}

export function handleIslandConnection(ws: WebSocket): void {
  let core: ConnectedIsland | null = null;

  ws.on("message", async (raw) => {
    try {
      const msg: IslandToHubMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case "handshake": {
          const keyHash = createHash("sha256")
            .update(msg.apiKey)
            .digest("hex");
          const keyRow = db
            .prepare("SELECT id FROM api_keys WHERE key_hash = ?")
            .get(keyHash) as { id: string } | undefined;

          if (!keyRow) {
            const err: HubToIslandMessage = {
              type: "error",
              code: "INVALID_KEY",
              message: "Invalid API key",
            };
            ws.send(JSON.stringify(err));
            ws.close();
            return;
          }

          db.prepare(
            "UPDATE api_keys SET last_seen_at = datetime('now') WHERE id = ?",
          ).run(keyRow.id);

          // One island per hub key: if no island.id is provided, look up by
          // api_key_id so the same hub key always resolves to the same island.
          let islandId: string;
          let existing: { id: string } | undefined;

          if (msg.island.id) {
            islandId = msg.island.id;
            existing = db
              .prepare("SELECT id FROM islands WHERE id = ? AND api_key_id = ?")
              .get(islandId, keyRow.id) as { id: string } | undefined;
          } else {
            existing = db
              .prepare("SELECT id FROM islands WHERE api_key_id = ?")
              .get(keyRow.id) as { id: string } | undefined;
            islandId = existing?.id ?? randomUUID();
          }

          if (existing) {
            db.prepare(
              `UPDATE islands SET name = ?, description = ?, config_snapshot = ?,
               status = 'online', last_heartbeat_at = datetime('now'),
               updated_at = datetime('now') WHERE id = ?`,
            ).run(
              msg.island.name,
              msg.island.description ?? null,
              JSON.stringify(msg.island.config ?? {}),
              islandId,
            );
          } else {
            db.prepare(
              `INSERT INTO islands (id, api_key_id, name, description, config_snapshot,
               status, last_heartbeat_at)
               VALUES (?, ?, ?, ?, ?, 'online', datetime('now'))`,
            ).run(
              islandId,
              keyRow.id,
              msg.island.name,
              msg.island.description ?? null,
              JSON.stringify(msg.island.config ?? {}),
            );
          }

          if (msg.sprites?.length) {
            const hash = await saveSprites(islandId, msg.sprites);
            spriteHashes.set(islandId, hash);
          }

          // Save thumbnail alongside sprites
          if (msg.thumbnail) {
            const thumbnailPath = await saveThumbnail(islandId, msg.thumbnail);
            db.prepare(
              "UPDATE islands SET thumbnail_path = ? WHERE id = ?",
            ).run(thumbnailPath, islandId);
          }

          // Close any existing connection for this islandId (last-writer-wins)
          const prevConn = connectedIslands.get(islandId);
          if (prevConn && prevConn.ws !== ws && prevConn.ws.readyState === 1) {
            prevConn.ws.close(4002, "replaced by new connection");
          }

          core = { ws, islandId, apiKeyId: keyRow.id, islandName: msg.island.name, lastPing: Date.now() };
          connectedIslands.set(islandId, core);

          const ack: HubToIslandMessage = {
            type: "handshake_ack",
            islandId,
            status: "ok",
          };
          ws.send(JSON.stringify(ack));
          // Notify lobby viewers that an island came online
          broadcastIslandUpdate(islandId, true);
          break;
        }

        case "state_update": {
          if (!core) return;

          // Only write player_count when it actually changed
          const agentCount = msg.state.characters?.length ?? 0;
          const prevCount = lastPlayerCounts.get(core.islandId);
          if (prevCount !== agentCount) {
            db.prepare(
              "UPDATE islands SET player_count = ? WHERE id = ?",
            ).run(agentCount, core.islandId);
            lastPlayerCounts.set(core.islandId, agentCount);
          }

          // Notify lobby viewers of metadata changes (throttled)
          broadcastIslandUpdate(core.islandId);

          const spriteHash = spriteHashes.get(core.islandId);
          const baseUrl = `/sprites/${core.islandId}/`;
          const relay = JSON.stringify({
            type: "island_state",
            islandId: core.islandId,
            islandName: core.islandName,
            state: msg.state,
            spriteBaseUrl: baseUrl,
            spriteVersion: spriteHash ?? undefined,
          });
          // Cache so late-joining viewers get an immediate snapshot
          lastIslandState.set(core.islandId, relay);
          const viewers = islandViewers.get(core.islandId);
          if (viewers) {
            for (const viewer of viewers) {
              if (viewer.readyState === 1) viewer.send(relay);
            }
          }
          break;
        }

        case "character_update": {
          if (!core) return;
          // Lightweight relay — no DB write, no lobby broadcast
          const charRelay = JSON.stringify({
            type: "character_update",
            islandId: core.islandId,
            characters: msg.characters,
          });
          const charViewers = islandViewers.get(core.islandId);
          if (charViewers) {
            for (const viewer of charViewers) {
              if (viewer.readyState === 1) viewer.send(charRelay);
            }
          }
          break;
        }

        case "state_delta": {
          if (!core) return;
          // Relay delta to viewers — lightweight, no DB write
          const deltaRelay = JSON.stringify({
            type: "state_delta",
            islandId: core.islandId,
            delta: msg.delta,
          });

          // Update player count from delta characters if present
          if (msg.delta.characters) {
            const agentCount = msg.delta.characters.length;
            const prevCount = lastPlayerCounts.get(core.islandId);
            if (prevCount !== agentCount) {
              db.prepare(
                "UPDATE islands SET player_count = ? WHERE id = ?",
              ).run(agentCount, core.islandId);
              lastPlayerCounts.set(core.islandId, agentCount);
              broadcastIslandUpdate(core.islandId);
            }
          }

          const deltaViewers = islandViewers.get(core.islandId);
          if (deltaViewers) {
            for (const viewer of deltaViewers) {
              if (viewer.readyState === 1) viewer.send(deltaRelay);
            }
          }
          break;
        }

        case "ping": {
          if (!core) return;
          core.lastPing = Date.now();
          db.prepare(
            "UPDATE islands SET last_heartbeat_at = datetime('now') WHERE id = ?",
          ).run(core.islandId);
          const pong: HubToIslandMessage = {
            type: "pong",
            timestamp: msg.timestamp,
          };
          ws.send(JSON.stringify(pong));
          break;
        }

        case "mcp_tunnel_response": {
          deliverTunnelResponse(msg.sessionId, msg.message);
          break;
        }

        case "mcp_tunnel_session_closed": {
          closeProxySession(msg.sessionId);
          break;
        }

        case "passport_response": {
          const pending = pendingPassportRequests.get(msg.requestId);
          if (pending && core && pending.islandId === core.islandId) {
            clearTimeout(pending.timer);
            pendingPassportRequests.delete(msg.requestId);
            pending.resolve(msg);
          }
          break;
        }

        case "sprite_update": {
          if (!core) return;
          if (msg.sprites?.length) {
            const hash = await saveSprites(core.islandId, msg.sprites);
            spriteHashes.set(core.islandId, hash);

            // Update cached state so late-joining viewers get the correct hash
            const cached = lastIslandState.get(core.islandId);
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.spriteVersion = hash;
              lastIslandState.set(core.islandId, JSON.stringify(parsed));
            }

            // Notify viewers immediately so they reload the changed sprite
            const notification = JSON.stringify({
              type: "sprite_version",
              islandId: core.islandId,
              spriteVersion: hash,
            });
            const viewers = islandViewers.get(core.islandId);
            if (viewers) {
              for (const viewer of viewers) {
                if (viewer.readyState === 1) viewer.send(notification);
              }
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("[island-handler] message error:", err);
    }
  });

  ws.on("close", () => {
    if (core) {
      db.prepare(
        "UPDATE islands SET status = 'offline', player_count = 0, updated_at = datetime('now') WHERE id = ?",
      ).run(core.islandId);
      connectedIslands.delete(core.islandId);
      lastIslandState.delete(core.islandId);
      spriteHashes.delete(core.islandId);
      lastPlayerCounts.delete(core.islandId);
      closeAllSessionsForIsland(core.islandId);

      // Clean up any pending passport requests for this island
      for (const [reqId, pending] of pendingPassportRequests) {
        if (pending.islandId === core.islandId) {
          clearTimeout(pending.timer);
          pendingPassportRequests.delete(reqId);
          pending.resolve({ type: "passport_response", requestId: reqId, success: false, error: "Island disconnected" });
        }
      }

      // Notify lobby viewers that the island is gone
      broadcastIslandRemoved(core.islandId);

      const viewers = islandViewers.get(core.islandId);
      if (viewers) {
        const offline = JSON.stringify({
          type: "island_offline",
          islandId: core.islandId,
        });
        for (const viewer of viewers) {
          if (viewer.readyState === 1) viewer.send(offline);
        }
      }
    }
  });
}

export function getConnectedIslands(): Map<string, ConnectedIsland> {
  return connectedIslands;
}

/** Forward a viewer's resync request to the connected island. */
export function forwardResyncRequest(islandId: string): void {
  const island = connectedIslands.get(islandId);
  if (!island || island.ws.readyState !== 1) return;
  const msg: HubToIslandMessage = { type: "resync_request" };
  island.ws.send(JSON.stringify(msg));
}
