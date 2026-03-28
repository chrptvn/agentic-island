import type { IncomingMessage, ServerResponse } from "node:http";
import { getConnectedIslands } from "../ws/island-handler.js";
import { createProxySession, getProxySession } from "./sessions.js";

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

/** Extract worldId from a URL path like /islands/:worldId/mcp */
function extractWorldId(pathname: string): string | null {
  const match = pathname.match(/^\/islands\/([^/]+)\/mcp/);
  return match ? match[1] : null;
}

/**
 * Handle MCP proxy requests at `/islands/:worldId/mcp`.
 * Routes StreamableHTTP MCP traffic to the island via WebSocket tunnel.
 */
export async function handleMcpProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost`);
  const worldId = extractWorldId(url.pathname);

  if (!worldId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid path — expected /islands/:worldId/mcp" }));
    return;
  }

  // Verify the island is connected
  const connectedIslands = getConnectedIslands();
  const island = connectedIslands.get(worldId);
  if (!island) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Island "${worldId}" is not online` }));
    return;
  }

  // Add CORS headers for MCP clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
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

  console.log(PREFIX, `New MCP proxy session for island ${worldId}`);
  const transport = createProxySession(worldId, island.ws);
  await transport.handleRequest(req, res, body);
}
