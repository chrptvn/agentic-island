import { Hono } from "hono";
import { cors } from "hono/cors";
import { getRequestListener } from "@hono/node-server";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { join, extname } from "node:path";
import { readFile, stat } from "node:fs/promises";

import health from "./routes/health.js";
import keys from "./routes/keys.js";
import islands from "./routes/islands.js";
import admin from "./routes/admin.js";
import { handleIslandConnection } from "./ws/island-handler.js";
import { handleViewerConnection } from "./ws/viewer-handler.js";
import { getSpriteCacheDir } from "./cache/sprites.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { handleMcpProxy } from "./mcp-proxy/handler.js";
import { safePath } from "./lib/safe-path.js";
import { initPassportSalt } from "./lib/passport.js";
import db from "./db/index.js";

// Initialize passport salt (auto-generates and persists if not set)
await initPassportSalt();

const app = new Hono();

// Restrictive CORS for API routes — configurable via CORS_ORIGINS env var
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : null; // null = no restriction (backwards-compatible default)

app.use(
  "/api/*",
  cors({
    origin: corsOrigins ?? "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 3600,
  }),
);

// Rate-limit key generation: 5 requests per minute per IP
app.post("/api/keys", rateLimit({ windowMs: 60_000, maxRequests: 5 }));

app.route("/api/health", health);
app.route("/api/keys", keys);
app.route("/api/islands", islands);
app.route("/api/admin", admin);

// Serve cached sprites (filename may contain subdirectory segments e.g. tiles/Items/Food.png)
app.get("/sprites/:islandId/*", async (c) => {
  const islandId = c.req.param("islandId");
  const userSegment = c.req.path.slice(`/sprites/${islandId}/`.length);
  const filePath = safePath(getSpriteCacheDir(), islandId, userSegment);

  if (!filePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

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

// ── Static file serving (production: serve hub-web/dist) ────────────
const WEB_DIST = join(import.meta.dirname, "../../hub-web/dist");
let servingStatic = false;

try {
  const s = await stat(WEB_DIST);
  if (s.isDirectory()) servingStatic = true;
} catch { /* dist not built — skip static serving */ }

if (servingStatic) {
  const MIME_MAP: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  // Serve static assets from dist
  app.get("*", async (c, next) => {
    const urlPath = new URL(c.req.url).pathname;

    // Skip API and sprite routes
    if (urlPath.startsWith("/api/") || urlPath.startsWith("/sprites/")) {
      return next();
    }

    // Try exact file match first (with path traversal guard)
    const filePath = safePath(WEB_DIST, urlPath);
    if (!filePath) return next();

    try {
      const s = await stat(filePath);
      if (s.isFile()) {
        const buf = await readFile(filePath);
        const mime = MIME_MAP[extname(filePath)] ?? "application/octet-stream";
        return new Response(buf, {
          headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" },
        });
      }
    } catch { /* not found, fall through */ }

    // SPA fallback: serve index.html for any unmatched route
    try {
      const indexBuf = await readFile(join(WEB_DIST, "index.html"));
      return new Response(indexBuf, {
        headers: { "Content-Type": "text/html" },
      });
    } catch {
      return next();
    }
  });

  console.log(`[api] Serving static files from ${WEB_DIST}`);
}

const PORT = parseInt(process.env.HUB_PORT ?? "3001", 10);

// Build the Hono request listener for non-MCP routes
const honoListener = getRequestListener(app.fetch);

// Custom HTTP server that intercepts MCP proxy routes before Hono
const server = createServer(async (req, res) => {
  const pathname = req.url?.split("?")[0] ?? "/";

  // MCP proxy: /islands/:islandId/mcp — needs raw Node.js req/res
  if (/^\/islands\/[^/]+\/mcp/.test(pathname)) {
    try {
      await handleMcpProxy(req, res);
    } catch (err) {
      console.error("[mcp-proxy] Unhandled error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    return;
  }

  // Everything else → Hono
  honoListener(req, res);
});

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

// Mark islands with a stale heartbeat as offline (missed 2+ heartbeat intervals)
const staleThresholdMs = 90_000;
const cleanupInterval = setInterval(() => {
  db.prepare(
    `UPDATE islands SET status = 'offline', updated_at = datetime('now')
     WHERE status = 'online'
       AND last_heartbeat_at < datetime('now', ? || ' seconds')`,
  ).run(`-${Math.floor(staleThresholdMs / 1000)}`);
}, 30_000);
if (cleanupInterval.unref) cleanupInterval.unref();

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/ws/island") {
    handleIslandConnection(ws);
  } else if (url.pathname === "/ws/viewer") {
    handleViewerConnection(ws);
  } else {
    ws.close(4000, "Unknown WebSocket path. Use /ws/island or /ws/viewer");
  }
});
