import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP Transport backed by a WebSocket tunnel through the hub.
 *
 * On the world side, each proxy MCP session gets one of these.
 * - `send(msg)` forwards JSON-RPC responses/notifications to the hub via WS.
 * - `deliverMessage(msg)` is called by the tunnel session manager to feed
 *   incoming JSON-RPC messages from the hub into the local McpServer.
 */
export class WebSocketTunnelTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    public readonly sessionId: string,
    private readonly sendToHub: (sessionId: string, message: JSONRPCMessage) => void,
  ) {}

  async start(): Promise<void> {
    // Nothing to do — the tunnel is already open.
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sendToHub(this.sessionId, message);
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  /** Called by the tunnel session manager to deliver a hub message to the McpServer. */
  deliverMessage(message: JSONRPCMessage): void {
    this.onmessage?.(message);
  }
}
