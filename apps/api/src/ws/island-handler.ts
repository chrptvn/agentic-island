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

// islandId → agent prompt markdown (from agent-prompt.md, sent on handshake)
export const islandAgentPrompts = new Map<string, string>();

// islandId → set of viewer WebSockets (shared with viewer-handler)
export const islandViewers = new Map<string, Set<WebSocket>>();

// Cache the last map init per island for late-joining viewers
export const lastMapInit = new Map<string, string>();

// Cache the last initial state (entities, characters, overrides) per island
// Served via HTTP GET /api/islands/:id/state
export const lastInitialState = new Map<string, string>();
// Track the latest tick per island so we can stamp the cached initial state
const lastTicks = new Map<string, number>();

// Ring buffer of recent state_delta messages per island (30s ≈ 150 entries at 200ms)
const DELTA_BUFFER_SIZE = 150;

interface BufferedDelta {
  tick: number;
  json: string;
}

export const deltaBuffers = new Map<string, BufferedDelta[]>();

function pushDelta(islandId: string, tick: number, json: string): void {
  let buf = deltaBuffers.get(islandId);
  if (!buf) {
    buf = [];
    deltaBuffers.set(islandId, buf);
  }
  buf.push({ tick, json });
  // Trim to buffer size
  if (buf.length > DELTA_BUFFER_SIZE) {
    buf.splice(0, buf.length - DELTA_BUFFER_SIZE);
  }
}

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

          if (msg.island.agentPrompt) {
            islandAgentPrompts.set(islandId, msg.island.agentPrompt);
          } else {
            islandAgentPrompts.delete(islandId);
          }

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

        case "map_init": {
          if (!core) return;
          const spriteHash = spriteHashes.get(core.islandId);
          const baseUrl = `/sprites/${core.islandId}/`;
          const mapRelay = JSON.stringify({
            type: "map_init",
            islandName: core.islandName,
            map: msg.map,
            tileRegistry: msg.tileRegistry,
            tileLookup: msg.tileLookup,
            spriteBaseUrl: baseUrl,
            spriteVersion: spriteHash ?? undefined,
          });

          // Detect if map content actually changed (island restart)
          const prevMap = lastMapInit.get(core.islandId);
          lastMapInit.set(core.islandId, mapRelay);

          // If map changed, notify viewers to re-fetch via HTTP
          if (prevMap && prevMap !== mapRelay) {
            const notify = JSON.stringify({
              type: "map_changed",
            });
            const changedViewers = islandViewers.get(core.islandId);
            if (changedViewers) {
              for (const viewer of changedViewers) {
                if (viewer.readyState === 1) viewer.send(notify);
              }
            }
          }
          break;
        }

        case "initial_state": {
          if (!core) return;

          // Update player count from characters
          const agentCount = msg.characters?.length ?? 0;
          const prevCount = lastPlayerCounts.get(core.islandId);
          if (prevCount !== agentCount) {
            db.prepare(
              "UPDATE islands SET player_count = ? WHERE id = ?",
            ).run(agentCount, core.islandId);
            lastPlayerCounts.set(core.islandId, agentCount);
          }

          // Notify lobby viewers of metadata changes (throttled)
          broadcastIslandUpdate(core.islandId);

          // Cache as initial state for HTTP endpoint (include current tick)
          const tick = lastTicks.get(core.islandId) ?? -1;
          const stateJson = JSON.stringify({
            entities: msg.entities,
            characters: msg.characters,
            overrides: msg.overrides,
            tick,
          });
          lastInitialState.set(core.islandId, stateJson);
          break;
        }

        case "state_delta": {
          if (!core) return;
          const deltaRelay = JSON.stringify({
            type: "state_delta",
            delta: msg.delta,
          });

          // Track tick and push to ring buffer
          const deltaTick = msg.delta.tk;
          lastTicks.set(core.islandId, deltaTick);
          pushDelta(core.islandId, deltaTick, deltaRelay);

          // Merge delta into cached initial state so the HTTP endpoint stays fresh
          const cachedJson = lastInitialState.get(core.islandId);
          if (cachedJson) {
            const cached = JSON.parse(cachedJson);
            if (msg.delta.c) {
              const charMap = new Map<string, unknown>();
              for (const c of cached.characters) charMap.set((c as Record<string, unknown>).i as string, c);
              for (const p of msg.delta.c) {
                if (p.a === "upsert" && p.c) charMap.set(p.k, p.c);
                else if (p.a === "remove") charMap.delete(p.k);
              }
              cached.characters = Array.from(charMap.values());

              // Update player count from the merged character list
              const agentCount = cached.characters.length;
              const prevCount = lastPlayerCounts.get(core.islandId);
              if (prevCount !== agentCount) {
                db.prepare(
                  "UPDATE islands SET player_count = ? WHERE id = ?",
                ).run(agentCount, core.islandId);
                lastPlayerCounts.set(core.islandId, agentCount);
                broadcastIslandUpdate(core.islandId);
              }
            }
            if (msg.delta.e) {
              const entityMap = new Map<string, unknown>();
              for (const e of cached.entities) entityMap.set(`${e.x},${e.y}`, e);
              for (const p of msg.delta.e) {
                if (p.a === "upsert" && p.e) entityMap.set(p.k, p.e);
                else if (p.a === "remove") entityMap.delete(p.k);
              }
              cached.entities = Array.from(entityMap.values());
            }
            if (msg.delta.o) {
              const overrideMap = new Map<string, unknown>();
              for (const o of cached.overrides) overrideMap.set(`${o.x},${o.y},${o.l}`, o);
              for (const p of msg.delta.o) {
                const key = `${p.x},${p.y},${p.l}`;
                if (p.a === "set" && p.t !== undefined) overrideMap.set(key, { x: p.x, y: p.y, l: p.l, t: p.t });
                else if (p.a === "remove") overrideMap.delete(key);
              }
              cached.overrides = Array.from(overrideMap.values());
            }
            cached.tick = deltaTick;
            lastInitialState.set(core.islandId, JSON.stringify(cached));
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

            // Update cached map init so late-joining viewers get the correct sprite hash
            const cached = lastMapInit.get(core.islandId);
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.spriteVersion = hash;
              lastMapInit.set(core.islandId, JSON.stringify(parsed));
            }

            // Notify viewers immediately so they reload the changed sprite
            const notification = JSON.stringify({
              type: "sprite_version",
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
      lastMapInit.delete(core.islandId);
      lastInitialState.delete(core.islandId);
      lastTicks.delete(core.islandId);
      islandAgentPrompts.delete(core.islandId);
      deltaBuffers.delete(core.islandId);
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
