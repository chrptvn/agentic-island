import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketTunnelTransport } from "./tunnel-transport.js";
import { makeTunnelSession, type McpSession } from "./mcp-server.js";

const PREFIX = "[mcp-tunnel]";

/** Callback to notify the hub when the island closes a tunnel session. */
let notifySessionClosed: ((sessionId: string) => void) | null = null;

/** Set the callback used to notify the hub when a tunnel session is closed from the island side. */
export function setSessionClosedNotifier(cb: (sessionId: string) => void): void {
  notifySessionClosed = cb;
}

/** Active tunnel sessions keyed by the hub-assigned sessionId. */
const tunnelSessions = new Map<string, { session: McpSession; transport: WebSocketTunnelTransport }>();

/**
 * Handle an incoming JSON-RPC message from the hub for a tunnel session.
 * If the session doesn't exist yet, it is created on the fly.
 * `passportKey` is provided on the first message (initialize) to authenticate.
 */
export function handleTunnelMessage(
  sessionId: string,
  message: unknown,
  sendToHub: (sessionId: string, msg: JSONRPCMessage) => void,
  passportKey?: string,
): void {
  let entry = tunnelSessions.get(sessionId);

  if (!entry) {
    console.log(PREFIX, `Creating tunnel session ${sessionId}`);
    const transport = new WebSocketTunnelTransport(sessionId, sendToHub);
    const session = makeTunnelSession(transport, passportKey);
    entry = { session, transport };
    tunnelSessions.set(sessionId, entry);

    // Ensure tunnelSessions is cleaned up when the transport closes
    // (e.g. idle timeout closes it from the island side).
    const mcpOnClose = transport.onclose;
    transport.onclose = () => {
      if (tunnelSessions.delete(sessionId)) {
        console.log(PREFIX, `Tunnel session ${sessionId} closed (island-side)`);
        notifySessionClosed?.(sessionId);
      }
      mcpOnClose?.();
    };
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
