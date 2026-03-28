import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { WebSocket } from "ws";
import type { HubToIslandMessage } from "@agentic-island/shared";

const PREFIX = "[mcp-proxy]";

interface ProxySession {
  transport: StreamableHTTPServerTransport;
  islandId: string;
  islandWs: WebSocket;
}

/** Active proxy sessions keyed by the hub-assigned MCP session ID. */
const proxySessions = new Map<string, ProxySession>();

/** Reverse index: islandId → Set<sessionId> for bulk cleanup. */
const islandSessionIndex = new Map<string, Set<string>>();

/**
 * Create a new proxy session for an island.
 * Returns the StreamableHTTPServerTransport so the caller can route the
 * HTTP initialize request through it.
 */
export function createProxySession(
  islandId: string,
  islandWs: WebSocket,
): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      console.log(PREFIX, `Session ${sessionId} created for island ${islandId}`);
      proxySessions.set(sessionId, { transport, islandId, islandWs });

      let islandSessions = islandSessionIndex.get(islandId);
      if (!islandSessions) {
        islandSessions = new Set();
        islandSessionIndex.set(islandId, islandSessions);
      }
      islandSessions.add(sessionId);
    },
  });

  // Forward JSON-RPC messages from the MCP client to the island via WS tunnel.
  transport.onmessage = (message: JSONRPCMessage) => {
    const sessionId = transport.sessionId;
    if (!sessionId) return;

    const tunnelMsg: HubToIslandMessage = {
      type: "mcp_tunnel_message",
      sessionId,
      message,
    };
    try {
      islandWs.send(JSON.stringify(tunnelMsg));
    } catch (err) {
      console.warn(PREFIX, `Failed to send tunnel message for session ${sessionId} (island ${islandId}):`, err);
      proxySessions.delete(sessionId);
      const islandSessions = islandSessionIndex.get(islandId);
      if (islandSessions) {
        islandSessions.delete(sessionId);
        if (islandSessions.size === 0) islandSessionIndex.delete(islandId);
      }
      transport.close().catch(() => {});
    }
  };

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (!sessionId) return;

    console.log(PREFIX, `Session ${sessionId} closed`);
    proxySessions.delete(sessionId);

    const islandSessions = islandSessionIndex.get(islandId);
    if (islandSessions) {
      islandSessions.delete(sessionId);
      if (islandSessions.size === 0) islandSessionIndex.delete(islandId);
    }

    // Tell the island to clean up its tunnel session
    const closeMsg: HubToIslandMessage = {
      type: "mcp_tunnel_close",
      sessionId,
    };
    if (islandWs.readyState === 1) {
      try {
        islandWs.send(JSON.stringify(closeMsg));
      } catch (err) {
        console.warn(PREFIX, `Failed to send tunnel close for session ${sessionId} (island ${islandId}):`, err);
      }
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
 * Deliver a JSON-RPC response/notification from the island to the MCP client.
 * Called when a `mcp_tunnel_response` message arrives from the island WS.
 */
export function deliverTunnelResponse(sessionId: string, message: unknown): void {
  const session = proxySessions.get(sessionId);
  if (!session) return;
  session.transport.send(message as JSONRPCMessage).catch((err) => {
    console.error(PREFIX, `Failed to send to MCP client (session ${sessionId}):`, err);
  });
}

/**
 * Close all proxy sessions for an island (e.g. when the island disconnects).
 */
export function closeAllSessionsForIsland(islandId: string): void {
  const sessionIds = islandSessionIndex.get(islandId);
  if (!sessionIds || sessionIds.size === 0) return;

  console.log(PREFIX, `Closing ${sessionIds.size} proxy session(s) for island ${islandId}`);
  for (const sessionId of sessionIds) {
    const session = proxySessions.get(sessionId);
    if (session) {
      proxySessions.delete(sessionId);
      session.transport.close().catch(() => {});
    }
  }
  islandSessionIndex.delete(islandId);
}
