import type { WebSocket } from "ws";
import type {
  CoreToHubMessage,
  HubToCoreMessage,
} from "@agentic-island/shared";
import { createHash, randomUUID } from "node:crypto";
import db from "../db/index.js";
import { saveSprites } from "../cache/sprites.js";

interface ConnectedCore {
  ws: WebSocket;
  worldId: string;
  apiKeyId: string;
  lastPing: number;
}

const connectedCores = new Map<string, ConnectedCore>();

// worldId → set of viewer WebSockets (shared with viewer-handler)
export const worldViewers = new Map<string, Set<WebSocket>>();

// Cache the last state payload per world so new viewers get an immediate snapshot
export const lastWorldState = new Map<string, string>();

export function handleCoreConnection(ws: WebSocket): void {
  let core: ConnectedCore | null = null;

  ws.on("message", async (raw) => {
    try {
      const msg: CoreToHubMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case "handshake": {
          const keyHash = createHash("sha256")
            .update(msg.apiKey)
            .digest("hex");
          const keyRow = db
            .prepare("SELECT id FROM api_keys WHERE key_hash = ?")
            .get(keyHash) as { id: string } | undefined;

          if (!keyRow) {
            const err: HubToCoreMessage = {
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

          const worldId = msg.world.id ?? randomUUID();
          const existing = db
            .prepare("SELECT id FROM worlds WHERE id = ? AND api_key_id = ?")
            .get(worldId, keyRow.id);

          if (existing) {
            db.prepare(
              `UPDATE worlds SET name = ?, description = ?, config_snapshot = ?,
               status = 'online', last_heartbeat_at = datetime('now'),
               updated_at = datetime('now') WHERE id = ?`,
            ).run(
              msg.world.name,
              msg.world.description ?? null,
              JSON.stringify(msg.world.config ?? {}),
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
              msg.world.name,
              msg.world.description ?? null,
              JSON.stringify(msg.world.config ?? {}),
            );
          }

          if (msg.sprites?.length) {
            await saveSprites(worldId, msg.sprites);
          }

          core = { ws, worldId, apiKeyId: keyRow.id, lastPing: Date.now() };
          connectedCores.set(worldId, core);

          const ack: HubToCoreMessage = {
            type: "handshake_ack",
            worldId,
            status: "ok",
          };
          ws.send(JSON.stringify(ack));
          break;
        }

        case "state_update": {
          if (!core) return;
          const relay = JSON.stringify({
            type: "world_state",
            worldId: core.worldId,
            state: msg.state,
            spriteBaseUrl: `/sprites/${core.worldId}/`,
          });
          // Cache so late-joining viewers get an immediate snapshot
          lastWorldState.set(core.worldId, relay);
          const viewers = worldViewers.get(core.worldId);
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
          const pong: HubToCoreMessage = {
            type: "pong",
            timestamp: msg.timestamp,
          };
          ws.send(JSON.stringify(pong));
          break;
        }
      }
    } catch (err) {
      console.error("[core-handler] message error:", err);
    }
  });

  ws.on("close", () => {
    if (core) {
      db.prepare(
        "UPDATE worlds SET status = 'offline', updated_at = datetime('now') WHERE id = ?",
      ).run(core.worldId);
      connectedCores.delete(core.worldId);
      lastWorldState.delete(core.worldId);

      const viewers = worldViewers.get(core.worldId);
      if (viewers) {
        const offline = JSON.stringify({
          type: "world_offline",
          worldId: core.worldId,
        });
        for (const viewer of viewers) {
          if (viewer.readyState === 1) viewer.send(offline);
        }
      }
    }
  });
}

export function getConnectedCores(): Map<string, ConnectedCore> {
  return connectedCores;
}
