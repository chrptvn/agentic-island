import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { WebSocket } from "ws";
import type { HubToWorldMessage } from "@agentic-island/shared";

const PREFIX = "[mcp-proxy]";

interface ProxySession {
  transport: StreamableHTTPServerTransport;
  worldId: string;
  worldWs: WebSocket;
}

/** Active proxy sessions keyed by the hub-assigned MCP session ID. */
const proxySessions = new Map<string, ProxySession>();

/** Reverse index: worldId → Set<sessionId> for bulk cleanup. */
const worldSessionIndex = new Map<string, Set<string>>();

/**
 * Create a new proxy session for a world.
 * Returns the StreamableHTTPServerTransport so the caller can route the
 * HTTP initialize request through it.
 */
export function createProxySession(
  worldId: string,
  worldWs: WebSocket,
): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      console.log(PREFIX, `Session ${sessionId} created for world ${worldId}`);
      proxySessions.set(sessionId, { transport, worldId, worldWs });

      let worldSessions = worldSessionIndex.get(worldId);
      if (!worldSessions) {
        worldSessions = new Set();
        worldSessionIndex.set(worldId, worldSessions);
      }
      worldSessions.add(sessionId);
    },
  });

  // Forward JSON-RPC messages from the MCP client to the world via WS tunnel.
  transport.onmessage = (message: JSONRPCMessage) => {
    const sessionId = transport.sessionId;
    if (!sessionId) return;

    const tunnelMsg: HubToWorldMessage = {
      type: "mcp_tunnel_message",
      sessionId,
      message,
    };
    worldWs.send(JSON.stringify(tunnelMsg));
  };

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (!sessionId) return;

    console.log(PREFIX, `Session ${sessionId} closed`);
    proxySessions.delete(sessionId);

    const worldSessions = worldSessionIndex.get(worldId);
    if (worldSessions) {
      worldSessions.delete(sessionId);
      if (worldSessions.size === 0) worldSessionIndex.delete(worldId);
    }

    // Tell the world to clean up its tunnel session
    const closeMsg: HubToWorldMessage = {
      type: "mcp_tunnel_close",
      sessionId,
    };
    if (worldWs.readyState === 1) {
      worldWs.send(JSON.stringify(closeMsg));
    }
  };

  return transport;
}

/**
 * Look up an existing proxy session by its MCP session ID.
 */
export function getProxySession(sessionId: string): ProxySession | undefined {
  return proxySessions.get(sessionId);
}

/**
 * Deliver a JSON-RPC response/notification from the world to the MCP client.
 * Called when a `mcp_tunnel_response` message arrives from the world WS.
 */
export function deliverTunnelResponse(sessionId: string, message: unknown): void {
  const session = proxySessions.get(sessionId);
  if (!session) return;
  session.transport.send(message as JSONRPCMessage).catch((err) => {
    console.error(PREFIX, `Failed to send to MCP client (session ${sessionId}):`, err);
  });
}

/**
 * Close all proxy sessions for a world (e.g. when the world disconnects).
 */
export function closeAllSessionsForWorld(worldId: string): void {
  const sessionIds = worldSessionIndex.get(worldId);
  if (!sessionIds || sessionIds.size === 0) return;

  console.log(PREFIX, `Closing ${sessionIds.size} proxy session(s) for world ${worldId}`);
  for (const sessionId of sessionIds) {
    const session = proxySessions.get(sessionId);
    if (session) {
      proxySessions.delete(sessionId);
      session.transport.close().catch(() => {});
    }
  }
  worldSessionIndex.delete(worldId);
}
