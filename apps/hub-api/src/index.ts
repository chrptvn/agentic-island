import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { Server } from "node:http";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";

import health from "./routes/health.js";
import keys from "./routes/keys.js";
import worlds from "./routes/worlds.js";
import { handleCoreConnection } from "./ws/core-handler.js";
import { handleViewerConnection } from "./ws/viewer-handler.js";
import { getSpriteCacheDir } from "./cache/sprites.js";
import { rateLimit } from "./middleware/rate-limit.js";
import db from "./db/index.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 3600,
  }),
);

// Rate-limit key generation: 5 requests per minute per IP
app.post("/api/keys", rateLimit({ windowMs: 60_000, maxRequests: 5 }));

app.route("/api/health", health);
app.route("/api/keys", keys);
app.route("/api/worlds", worlds);

// Serve cached sprites (filename may contain subdirectory segments e.g. tiles/Items/Food.png)
app.get("/sprites/:worldId/*", async (c) => {
  const worldId = c.req.param("worldId");
  const filePath = join(
    getSpriteCacheDir(),
    worldId,
    c.req.path.slice(`/sprites/${worldId}/`.length),
  );

  try {
    await stat(filePath);
    const buf = await readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : "application/octet-stream";
    return new Response(buf, {
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return c.json({ error: "Sprite not found" }, 404);
  }
});

const PORT = parseInt(process.env.HUB_PORT ?? "4000", 10);

const server = serve(
  { fetch: app.fetch, port: PORT },
  (info) => {
    console.log(`[hub-api] listening on http://localhost:${info.port}`);
  },
);

const wss = new WebSocketServer({ server: server as Server });

// Mark worlds with a stale heartbeat as offline (missed 2+ heartbeat intervals)
const staleThresholdMs = 90_000;
const cleanupInterval = setInterval(() => {
  db.prepare(
    `UPDATE worlds SET status = 'offline', updated_at = datetime('now')
     WHERE status = 'online'
       AND last_heartbeat_at < datetime('now', ? || ' seconds')`,
  ).run(`-${Math.floor(staleThresholdMs / 1000)}`);
}, 30_000);
if (cleanupInterval.unref) cleanupInterval.unref();

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/ws/core") {
    handleCoreConnection(ws);
  } else if (url.pathname === "/ws/viewer") {
    handleViewerConnection(ws);
  } else {
    ws.close(4000, "Unknown WebSocket path. Use /ws/core or /ws/viewer");
  }
});
