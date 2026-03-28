import type { WebSocket } from "ws";
import type {
  IslandToHubMessage,
  HubToIslandMessage,
} from "@agentic-island/shared";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import db from "../db/index.js";
import { saveSprites, saveThumbnail } from "../cache/sprites.js";
import { deliverTunnelResponse, closeAllSessionsForIsland } from "../mcp-proxy/sessions.js";
import { broadcastIslandUpdate, broadcastIslandRemoved } from "./lobby.js";

interface ConnectedIsland {
  ws: WebSocket;
  islandId: string;
  apiKeyId: string;
  islandName: string;
  lastPing: number;
  secured: boolean;
}

const connectedIslands = new Map<string, ConnectedIsland>();

// islandId → set of viewer WebSockets (shared with viewer-handler)
export const islandViewers = new Map<string, Set<WebSocket>>();

// Cache the last state payload per island so new viewers get an immediate snapshot
export const lastIslandState = new Map<string, string>();

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

          // One island per passport: if no island.id is provided, look up by
          // api_key_id so the same passport always resolves to the same island.
          let islandId: string;
          let existing: { id: string; secured: number; access_key_hash: string | null } | undefined;
          const isSecured = msg.island.secured ?? false;

          if (msg.island.id) {
            islandId = msg.island.id;
            existing = db
              .prepare("SELECT id, secured, access_key_hash FROM islands WHERE id = ? AND api_key_id = ?")
              .get(islandId, keyRow.id) as { id: string; secured: number; access_key_hash: string | null } | undefined;
          } else {
            existing = db
              .prepare("SELECT id, secured, access_key_hash FROM islands WHERE api_key_id = ?")
              .get(keyRow.id) as { id: string; secured: number; access_key_hash: string | null } | undefined;
            islandId = existing?.id ?? randomUUID();
          }

          // Handle access key generation for secured islands
          let accessKey: string | undefined;
          let accessKeyHash: string | null = existing?.access_key_hash ?? null;

          // Generate new access key if:
          // 1. Island is newly secured and doesn't have a key yet
          // 2. Island is new and secured
          if (isSecured && !accessKeyHash) {
            accessKey = `ik_${randomBytes(16).toString("hex")}`;
            accessKeyHash = createHash("sha256").update(accessKey).digest("hex");
          }

          if (existing) {
            db.prepare(
              `UPDATE islands SET name = ?, description = ?, config_snapshot = ?,
               secured = ?, access_key_hash = ?,
               status = 'online', last_heartbeat_at = datetime('now'),
               updated_at = datetime('now') WHERE id = ?`,
            ).run(
              msg.island.name,
              msg.island.description ?? null,
              JSON.stringify(msg.island.config ?? {}),
              isSecured ? 1 : 0,
              accessKeyHash,
              islandId,
            );
          } else {
            db.prepare(
              `INSERT INTO islands (id, api_key_id, name, description, config_snapshot,
               secured, access_key_hash, status, last_heartbeat_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'online', datetime('now'))`,
            ).run(
              islandId,
              keyRow.id,
              msg.island.name,
              msg.island.description ?? null,
              JSON.stringify(msg.island.config ?? {}),
              isSecured ? 1 : 0,
              accessKeyHash,
            );
          }

          if (msg.sprites?.length) {
            await saveSprites(islandId, msg.sprites);
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

          core = { ws, islandId, apiKeyId: keyRow.id, islandName: msg.island.name, lastPing: Date.now(), secured: isSecured };
          connectedIslands.set(islandId, core);

          const ack: HubToIslandMessage = {
            type: "handshake_ack",
            islandId,
            status: "ok",
            accessKey, // Only set when newly generated
          };
          ws.send(JSON.stringify(ack));
          // Notify lobby viewers that an island came online
          broadcastIslandUpdate(islandId, true);
          break;
        }

        case "state_update": {
          if (!core) return;

          // Keep player_count in sync with the number of characters
          const agentCount = msg.state.characters?.length ?? 0;
          db.prepare(
            "UPDATE islands SET player_count = ? WHERE id = ?",
          ).run(agentCount, core.islandId);

          // Notify lobby viewers of metadata changes (throttled)
          broadcastIslandUpdate(core.islandId);

          const relay = JSON.stringify({
            type: "island_state",
            islandId: core.islandId,
            islandName: core.islandName,
            state: msg.state,
            spriteBaseUrl: `/sprites/${core.islandId}/`,
            secured: core.secured,
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
      closeAllSessionsForIsland(core.islandId);

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
