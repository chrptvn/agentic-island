import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { getConnectedIslands } from "../ws/island-handler.js";
import { createProxySession, getProxySession } from "./sessions.js";
import db from "../db/index.js";

const PREFIX = "[mcp-proxy]";

/** Read the full body of an HTTP request as parsed JSON (or undefined). */
async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** Extract islandId from a URL path like /islands/:islandId/mcp */
function extractIslandId(pathname: string): string | null {
  const match = pathname.match(/^\/islands\/([^/]+)\/mcp/);
  return match ? match[1] : null;
}

/** Hash an access key using SHA256 */
function hashAccessKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

interface IslandSecurityRow {
  secured: number;
  access_key_hash: string | null;
}

/**
 * Validate Bearer token for secured islands.
 * Returns null if valid (or island not secured), error message if invalid.
 */
function validateAuth(req: IncomingMessage, islandId: string): string | null {
  const row = db
    .prepare("SELECT secured, access_key_hash FROM islands WHERE id = ?")
    .get(islandId) as IslandSecurityRow | undefined;

  if (!row) return "Island not found";
  if (!row.secured) return null; // Not secured, allow access

  // Island is secured — require valid Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return "Authorization required — use Bearer token";
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  if (!token) return "Missing access key";

  const tokenHash = hashAccessKey(token);
  if (tokenHash !== row.access_key_hash) {
    return "Invalid access key";
  }

  return null; // Valid
}

/**
 * Handle MCP proxy requests at `/islands/:islandId/mcp`.
 * Routes StreamableHTTP MCP traffic to the island via WebSocket tunnel.
 */
export async function handleMcpProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost`);
  const islandId = extractIslandId(url.pathname);

  if (!islandId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid path — expected /islands/:islandId/mcp" }));
    return;
  }

  // Verify the island is connected
  const connectedIslands = getConnectedIslands();
  const island = connectedIslands.get(islandId);
  if (!island) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Island "${islandId}" is not online` }));
    return;
  }

  // Add CORS headers for MCP clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Last-Event-ID, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Validate authorization for secured islands
  const authError = validateAuth(req, islandId);
  if (authError) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: authError }));
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session — route to its transport
  if (sessionId) {
    const proxySession = getProxySession(sessionId);
    if (!proxySession) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "MCP session not found" }));
      return;
    }

    const body = req.method === "POST" ? await readBody(req).catch(() => undefined) : undefined;
    await proxySession.transport.handleRequest(req, res, body);
    return;
  }

  // No session — must be a POST with an initialize request
  if (req.method !== "POST") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Mcp-Session-Id header required for non-initialize requests" }));
    return;
  }

  const body = await readBody(req).catch(() => undefined);
  const msg = body as Record<string, unknown>;
  if (msg?.method !== "initialize") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "First request must be an initialize" }));
    return;
  }

  console.log(PREFIX, `New MCP proxy session for island ${islandId}`);
  const transport = createProxySession(islandId, island.ws);
  await transport.handleRequest(req, res, body);
}
