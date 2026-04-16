import { randomUUID } from "crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { IncomingMessage, ServerResponse } from "http";
import { registerGenericPersonaTools, registerFeedEntityTools } from "./tools/character-tools.js";
import { registerJournalTools } from "./tools/journal-tools.js";
import { registerSayTools } from "./tools/say-tools.js";
import { registerPlantTools } from "./tools/plant-tools.js";
import { humanizeSurroundings } from "./humanize.js";
import { Island } from "../island/island.js";
import { validatePassportKey } from "../passport/index.js";

// ─── Surroundings snapshot ───────────────────────────────────────────────────

const ALERT_ENERGY_THRESHOLD  = 20;
const ALERT_HUNGER_THRESHOLD  = 20;
const ALERT_COOLDOWN_MS       = 10_000; // min ms between same-type alerts
const SURROUNDINGS_PUSH_INTERVAL_MS = 5_000; // throttle full-status push to agents

interface AlertCooldowns {
  energy:  number;
  hunger:  number;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface McpSession {
  server:         McpServer;
  transport:      Transport;
  /** Character ID (passport name) — set after passport validation and auto-spawn. */
  characterId:    string | null;
  lastSnapshot:   string;
  alertCooldowns: AlertCooldowns;
  worldListener:          (() => void) | null;
  lastSurroundingsPushAt: number;
}

/** Active sessions keyed by Mcp-Session-Id. */
const mcpSessions = new Map<string, McpSession>();

/** All active sessions regardless of transport type (HTTP or tunnel). */
const allMcpSessions = new Set<McpSession>();

/** Returns true if another active session already owns this character ID. */
export function isCharacterClaimed(characterId: string, excludeSession?: McpSession): boolean {
  for (const s of allMcpSessions) {
    if (s === excludeSession) continue;
    if (s.characterId === characterId) return true;
  }
  return false;
}

// ─── Island push helpers ───────────────────────────────────────────────────────

export function attachWorldListener(session: McpSession): void {
  if (session.worldListener) return; // already attached
  const id = session.characterId;
  if (!id) return;

  const listener = () => {
    const snapshot = Island.getInstance().getSurroundings(id);
    if (!snapshot) return;

    const snapshotStr = JSON.stringify(snapshot);
    if (snapshotStr === session.lastSnapshot) return;
    session.lastSnapshot = snapshotStr;

    // Push resource-updated notification
    const uri = `agentic-island://character/${encodeURIComponent(id)}/surroundings`;
    session.server.server.sendResourceUpdated({ uri }).catch(() => {/* session may be gone */});

    // Push full humanized status (throttled)
    const now = Date.now();
    if (now - session.lastSurroundingsPushAt >= SURROUNDINGS_PUSH_INTERVAL_MS) {
      session.lastSurroundingsPushAt = now;
      const humanized = humanizeSurroundings(snapshot as Parameters<typeof humanizeSurroundings>[0]);
      session.server.sendLoggingMessage({
        level: "info",
        data: JSON.stringify(humanized, null, 2),
      }).catch(() => {});
    }

    // Push alert log messages for critical stats
    const stats = (snapshot as { stats: { energy: number; hunger: number } }).stats;
    const alertNow = Date.now();

    if (stats.energy < ALERT_ENERGY_THRESHOLD && alertNow - session.alertCooldowns.energy > ALERT_COOLDOWN_MS) {
      session.alertCooldowns.energy = alertNow;
      session.server.sendLoggingMessage({
        level: "warning",
        data: `⚡ Energy low (${Math.round(stats.energy)}/100)! Rest near a lit campfire to recover faster.`,
      }).catch(() => {});
    }

    if (stats.hunger < ALERT_HUNGER_THRESHOLD && alertNow - session.alertCooldowns.hunger > ALERT_COOLDOWN_MS) {
      session.alertCooldowns.hunger = alertNow;
      session.server.sendLoggingMessage({
        level: "warning",
        data: `🍖 Hunger low (${Math.round(stats.hunger)}/100)! Eat berries or acorns from your inventory.`,
      }).catch(() => {});
    }
  };

  Island.getInstance().on("map:updated", listener);
  session.worldListener = listener;
}

export function detachWorldListener(session: McpSession): void {
  if (session.worldListener) {
    Island.getInstance().off("map:updated", session.worldListener);
    session.worldListener = null;
  }
}

// ─── Session factory ──────────────────────────────────────────────────────────

/** Register all tools, resources, and the surroundings resource on a session. */
function initServer(server: McpServer, session: McpSession): void {

  // ── Surroundings resource template ────────────────────────────────────────
  server.resource(
    "character-surroundings",
    new ResourceTemplate("agentic-island://character/{id}/surroundings", { list: undefined }),
    { description: "Live narrative snapshot of how the character feels and what they see around them. Subscribe to receive push notifications whenever the world changes." },
    async (uri, { id }) => {
      const characterId = decodeURIComponent(id as string);
      const snapshot = Island.getInstance().getSurroundings(characterId);
      if (!snapshot) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: `No character named "${characterId}"` }),
          }],
        };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(humanizeSurroundings(snapshot as Parameters<typeof humanizeSurroundings>[0]), null, 2),
        }],
      };
    }
  );

  // ── Player tools (character actions, inventory, crafting) ────────────────────
  registerGenericPersonaTools(server, session);
  registerFeedEntityTools(server, session);
  registerJournalTools(server, session);
  registerSayTools(server, session);
  registerPlantTools(server, session);
}

/** Create a local HTTP-backed MCP session (original behaviour). */
function makeHttpSession(): McpSession {
  const server = new McpServer({ name: "agentic-island", version: "1.0.0" });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => { mcpSessions.set(id, session); },
  });

  transport.onclose = () => {
    if (transport.sessionId) mcpSessions.delete(transport.sessionId);
    allMcpSessions.delete(session);
    detachWorldListener(session);
    if (session.characterId) {
      Island.getInstance().disconnect(session.characterId);
      session.characterId = null;
    }
  };

  const session: McpSession = {
    server,
    transport,
    characterId: null,
    lastSnapshot: "",
    alertCooldowns: { energy: 0, hunger: 0 },
    worldListener: null,
    lastSurroundingsPushAt: 0,
  };

  allMcpSessions.add(session);
  initServer(server, session);
  server.connect(transport);
  return session;
}

/**
 * Create a tunnel-backed MCP session for proxying via the hub.
 * The caller supplies a pre-built Transport (WebSocketTunnelTransport)
 * and the passport key from the Bearer token.
 */
export function makeTunnelSession(transport: Transport, passportKey?: string): McpSession {
  const server = new McpServer({ name: "agentic-island", version: "1.0.0" });

  const session: McpSession = {
    server,
    transport,
    characterId: null,
    lastSnapshot: "",
    alertCooldowns: { energy: 0, hunger: 0 },
    worldListener: null,
    lastSurroundingsPushAt: 0,
  };

  // Validate passport and auto-spawn character
  if (passportKey) {
    spawnFromPassport(session, passportKey);
  }

  allMcpSessions.add(session);

  transport.onclose = () => {
    allMcpSessions.delete(session);
    detachWorldListener(session);
    if (session.characterId) {
      Island.getInstance().disconnect(session.characterId);
      session.characterId = null;
    }
  };

  initServer(server, session);
  server.connect(transport);
  return session;
}

/**
 * Validate a passport key and spawn the character into the world.
 * Returns the character ID on success, null on failure.
 */
export function spawnFromPassport(session: McpSession, passportKey: string): string | null {
  const passport = validatePassportKey(passportKey);
  if (!passport) {
    console.log("[mcp] Invalid passport key provided");
    return null;
  }

  const characterId = passport.name;

  // If another session already owns this character, disconnect it first
  if (isCharacterClaimed(characterId, session)) {
    // Kick the previous session's character
    for (const s of allMcpSessions) {
      if (s === session) continue;
      if (s.characterId === characterId) {
        try { Island.getInstance().disconnect(characterId); } catch { /* ok */ }
        detachWorldListener(s);
        s.characterId = null;
        break;
      }
    }
  }

  // Connect/spawn the character in the island world
  const island = Island.getInstance();
  island.connect(characterId, passport.appearance);

  session.characterId = characterId;
  attachWorldListener(session);

  console.log(`[mcp] Character "${characterId}" spawned via passport`);
  return characterId;
}

/**
 * Route an incoming HTTP request to the correct MCP session.
 * - No Mcp-Session-Id + initialize  → create new session
 * - Valid Mcp-Session-Id            → resume existing session
 * - Anything else                   → 400 / 404
 */
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId) {
    const session = mcpSessions.get(sessionId);
    if (session) {
      await (session.transport as StreamableHTTPServerTransport).handleRequest(req, res, body);
      return;
    }

    // Stale session (e.g. after server restart) — handle gracefully
    if (req.method === "DELETE") {
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session expired. Send a new initialize request to reconnect." }));
      return;
    }
    // POST with stale session — fall through to allow re-initialization
  }

  // No session ID (or stale session) — must be an initialize request.
  const msg = body as Record<string, unknown>;
  if (msg?.method !== "initialize") {
    const error = sessionId
      ? "Session expired after server restart. Send a new initialize request to reconnect."
      : "Mcp-Session-Id header required for non-initialize requests";
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error }));
    return;
  }

  if (sessionId) {
    console.log("[mcp] Replacing stale session", sessionId);
  }

  const session = makeHttpSession();
  await (session.transport as StreamableHTTPServerTransport).handleRequest(req, res, body);
}
