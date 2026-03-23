import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketTunnelTransport } from "./tunnel-transport.js";
import { makeTunnelSession, type McpSession } from "./mcp-server.js";

const PREFIX = "[mcp-tunnel]";

/** Active tunnel sessions keyed by the hub-assigned sessionId. */
const tunnelSessions = new Map<string, { session: McpSession; transport: WebSocketTunnelTransport }>();

/**
 * Handle an incoming JSON-RPC message from the hub for a tunnel session.
 * If the session doesn't exist yet, it is created on the fly.
 */
export function handleTunnelMessage(
  sessionId: string,
  message: unknown,
  sendToHub: (sessionId: string, msg: JSONRPCMessage) => void,
): void {
  let entry = tunnelSessions.get(sessionId);

  if (!entry) {
    console.log(PREFIX, `Creating tunnel session ${sessionId}`);
    const transport = new WebSocketTunnelTransport(sessionId, sendToHub);
    const session = makeTunnelSession(transport);
    entry = { session, transport };
    tunnelSessions.set(sessionId, entry);
  }

  entry.transport.deliverMessage(message as JSONRPCMessage);
}

/** Close and clean up a single tunnel session. */
export function closeTunnelSession(sessionId: string): void {
  const entry = tunnelSessions.get(sessionId);
  if (!entry) return;

  console.log(PREFIX, `Closing tunnel session ${sessionId}`);
  tunnelSessions.delete(sessionId);
  entry.transport.close().catch(() => {});
}

/** Close all tunnel sessions (e.g. when the hub WS connection drops). */
export function closeAllTunnelSessions(): void {
  if (tunnelSessions.size === 0) return;
  console.log(PREFIX, `Closing all ${tunnelSessions.size} tunnel session(s)`);
  for (const [id, entry] of tunnelSessions) {
    tunnelSessions.delete(id);
    entry.transport.close().catch(() => {});
  }
}
