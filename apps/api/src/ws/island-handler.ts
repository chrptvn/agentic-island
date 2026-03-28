import type { WebSocket } from "ws";
import type {
  IslandToHubMessage,
  HubToIslandMessage,
} from "@agentic-island/shared";
import { createHash, randomUUID } from "node:crypto";
import db from "../db/index.js";
import { saveSprites, saveThumbnail } from "../cache/sprites.js";
import { deliverTunnelResponse, closeAllSessionsForIsland } from "../mcp-proxy/sessions.js";
import { broadcastIslandUpdate, broadcastIslandRemoved } from "./lobby.js";

interface ConnectedIsland {
  ws: WebSocket;
  worldId: string;
  apiKeyId: string;
  worldName: string;
  lastPing: number;
}

const connectedIslands = new Map<string, ConnectedIsland>();

// worldId → set of viewer WebSockets (shared with viewer-handler)
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
          let worldId: string;
          let existing: { id: string } | undefined;

          if (msg.island.id) {
            worldId = msg.island.id;
            existing = db
              .prepare("SELECT id FROM worlds WHERE id = ? AND api_key_id = ?")
              .get(worldId, keyRow.id) as { id: string } | undefined;
          } else {
            existing = db
              .prepare("SELECT id FROM worlds WHERE api_key_id = ?")
              .get(keyRow.id) as { id: string } | undefined;
            worldId = existing?.id ?? randomUUID();
          }

          if (existing) {
            db.prepare(
              `UPDATE worlds SET name = ?, description = ?, config_snapshot = ?,
               status = 'online', last_heartbeat_at = datetime('now'),
               updated_at = datetime('now') WHERE id = ?`,
            ).run(
              msg.island.name,
              msg.island.description ?? null,
              JSON.stringify(msg.island.config ?? {}),
              worldId,
            );
          } else {
            db.prepare(
              `INSERT INTO worlds (id, api_key_id, name, description, config_snapshot,
               status, last_heartbeat_at)
               VALUES (?, ?, ?, ?, ?, 'online', datetime('now'))`,
            ).run(
              worldId,
              keyRow.id,
              msg.island.name,
              msg.island.description ?? null,
              JSON.stringify(msg.island.config ?? {}),
            );
          }

          if (msg.sprites?.length) {
            await saveSprites(worldId, msg.sprites);
          }

          // Save thumbnail alongside sprites
          if (msg.thumbnail) {
            const thumbnailPath = await saveThumbnail(worldId, msg.thumbnail);
            db.prepare(
              "UPDATE worlds SET thumbnail_path = ? WHERE id = ?",
            ).run(thumbnailPath, worldId);
          }

          // Close any existing connection for this worldId (last-writer-wins)
          const prevConn = connectedIslands.get(worldId);
          if (prevConn && prevConn.ws !== ws && prevConn.ws.readyState === 1) {
            prevConn.ws.close(4002, "replaced by new connection");
          }

          core = { ws, worldId, apiKeyId: keyRow.id, worldName: msg.island.name, lastPing: Date.now() };
          connectedIslands.set(worldId, core);

          const ack: HubToIslandMessage = {
            type: "handshake_ack",
            worldId,
            status: "ok",
          };
          ws.send(JSON.stringify(ack));
          // Notify lobby viewers that an island came online
          broadcastIslandUpdate(worldId, true);
          break;
        }

        case "state_update": {
          if (!core) return;

          // Keep player_count in sync with the number of characters
          const agentCount = msg.state.characters?.length ?? 0;
          db.prepare(
            "UPDATE worlds SET player_count = ? WHERE id = ?",
          ).run(agentCount, core.worldId);

          // Notify lobby viewers of metadata changes (throttled)
          broadcastIslandUpdate(core.worldId);

          const relay = JSON.stringify({
            type: "island_state",
            worldId: core.worldId,
            worldName: core.worldName,
            state: msg.state,
            spriteBaseUrl: `/sprites/${core.worldId}/`,
          });
          // Cache so late-joining viewers get an immediate snapshot
          lastIslandState.set(core.worldId, relay);
          const viewers = islandViewers.get(core.worldId);
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
            "UPDATE worlds SET last_heartbeat_at = datetime('now') WHERE id = ?",
          ).run(core.worldId);
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
        "UPDATE worlds SET status = 'offline', player_count = 0, updated_at = datetime('now') WHERE id = ?",
      ).run(core.worldId);
      connectedIslands.delete(core.worldId);
      lastIslandState.delete(core.worldId);
      closeAllSessionsForIsland(core.worldId);

      // Notify lobby viewers that the island is gone
      broadcastIslandRemoved(core.worldId);

      const viewers = islandViewers.get(core.worldId);
      if (viewers) {
        const offline = JSON.stringify({
          type: "island_offline",
          worldId: core.worldId,
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
