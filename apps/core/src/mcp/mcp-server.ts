import { randomUUID } from "crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { registerGenericPersonaTools, registerAdminCharacterTools, registerFeedEntityTools, registerSpawnPositionsTools } from "./tools/character-tools.js";
import { registerMapReadTools, registerMapAdminTools } from "./tools/map-tools.js";
import { registerSpawnableTilesTools, registerTileQueryTools, registerTileEditTools, registerPathTools } from "./tools/tile-tools.js";
import { registerFilterTools } from "./tools/filter-tools.js";
import { registerJournalTools } from "./tools/journal-tools.js";
import { registerSayTools } from "./tools/say-tools.js";
import { registerPlantTools } from "./tools/plant-tools.js";
import { World } from "../world/world.js";

// ─── Surroundings snapshot ───────────────────────────────────────────────────

const ALERT_ENERGY_THRESHOLD  = 20;
const ALERT_HUNGER_THRESHOLD  = 20;
const ALERT_COOLDOWN_MS       = 10_000; // min ms between same-type alerts

interface AlertCooldowns {
  energy:  number;
  hunger:  number;
}

// ─── Session ─────────────────────────────────────────────────────────────────

interface McpSession {
  server:       McpServer;
  transport:    StreamableHTTPServerTransport;
  characterId:  string | null;
  lastSnapshot: string;
  alertCooldowns: AlertCooldowns;
  worldListener: (() => void) | null;
}

/** Active sessions keyed by Mcp-Session-Id. */
const mcpSessions = new Map<string, McpSession>();

// ─── World push helpers ───────────────────────────────────────────────────────

function attachWorldListener(session: McpSession): void {
  if (session.worldListener) return; // already attached
  const id = session.characterId;
  if (!id) return;

  const listener = () => {
    const snapshot = World.getInstance().getSurroundings(id);
    if (!snapshot) return;

    const snapshotStr = JSON.stringify(snapshot);
    if (snapshotStr === session.lastSnapshot) return;
    session.lastSnapshot = snapshotStr;

    // Push resource-updated notification
    const uri = `genesis://character/${encodeURIComponent(id)}/surroundings`;
    session.server.server.sendResourceUpdated({ uri }).catch(() => {/* session may be gone */});

    // Push alert log messages for critical stats
    const stats = (snapshot as { stats: { energy: number; hunger: number } }).stats;
    const now = Date.now();

    if (stats.energy < ALERT_ENERGY_THRESHOLD && now - session.alertCooldowns.energy > ALERT_COOLDOWN_MS) {
      session.alertCooldowns.energy = now;
      session.server.sendLoggingMessage({
        level: "warning",
        data: `⚡ Energy low (${Math.round(stats.energy)}/100)! Rest near a lit campfire to recover faster.`,
      }).catch(() => {});
    }

    if (stats.hunger < ALERT_HUNGER_THRESHOLD && now - session.alertCooldowns.hunger > ALERT_COOLDOWN_MS) {
      session.alertCooldowns.hunger = now;
      session.server.sendLoggingMessage({
        level: "warning",
        data: `🍖 Hunger low (${Math.round(stats.hunger)}/100)! Eat berries or acorns from your inventory.`,
      }).catch(() => {});
    }
  };

  World.getInstance().on("map:updated", listener);
  session.worldListener = listener;
}

function detachWorldListener(session: McpSession): void {
  if (session.worldListener) {
    World.getInstance().off("map:updated", session.worldListener);
    session.worldListener = null;
  }
}

// ─── Session factory ──────────────────────────────────────────────────────────

function makeSession(): McpSession {
  const server = new McpServer({ name: "genesis", version: "1.0.0" });

  // ── set_character: bind this session to a character and activate push ─────
  server.tool(
    "set_character",
    "Bind this session to a character by ID. Once bound, the server will push live environment updates whenever the world changes. The agent receives a `genesis://character/{id}/surroundings` resource notification and can read it to get current position, stats, and nearby entities without polling.",
    { character_id: z.string().min(1).describe("The character's unique id to bind this session to") },
    async ({ character_id }) => {
      const world = World.getInstance();
      if (!world.characters.has(character_id)) {
        return { content: [{ type: "text", text: `No character named "${character_id}" exists. Spawn it first.` }], isError: true };
      }
      session.characterId = character_id;
      session.lastSnapshot = "";
      session.alertCooldowns = { energy: 0, hunger: 0 };
      detachWorldListener(session);
      attachWorldListener(session);
      return {
        content: [{
          type: "text",
          text: `Session bound to "${character_id}". Push notifications active.\nSubscribe to: genesis://character/${encodeURIComponent(character_id)}/surroundings`,
        }],
      };
    }
  );

  // ── Surroundings resource template ────────────────────────────────────────
  server.resource(
    "character-surroundings",
    new ResourceTemplate("genesis://character/{id}/surroundings", { list: undefined }),
    { description: "Live snapshot of a character's position, stats, inventory, and nearby tiles/entities within a 3-tile radius. Subscribe to this resource to receive push notifications whenever the world changes." },
    async (uri, { id }) => {
      const characterId = decodeURIComponent(id as string);
      const snapshot = World.getInstance().getSurroundings(characterId);
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
          text: JSON.stringify(snapshot, null, 2),
        }],
      };
    }
  );

  // ── Game tools (character actions, inventory, crafting) ─────────────────────
  registerGenericPersonaTools(server);
  registerFeedEntityTools(server);
  registerSpawnPositionsTools(server);
  registerFilterTools(server);
  registerJournalTools(server);
  registerSayTools(server);
  registerPlantTools(server);

  // ── World tools (map, tiles, character admin) ─────────────────────────────
  registerMapReadTools(server);
  registerMapAdminTools(server);
  registerTileQueryTools(server);
  registerTileEditTools(server);
  registerSpawnableTilesTools(server);
  registerAdminCharacterTools(server);
  registerPathTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => { mcpSessions.set(id, session); },
  });

  // Clean up session and world listener when transport closes.
  transport.onclose = () => {
    if (transport.sessionId) mcpSessions.delete(transport.sessionId);
    detachWorldListener(session);
  };

  server.connect(transport);
  const session: McpSession = {
    server,
    transport,
    characterId: null,
    lastSnapshot: "",
    alertCooldowns: { energy: 0, hunger: 0 },
    worldListener: null,
  };
  return session;
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
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    await session.transport.handleRequest(req, res, body);
    return;
  }

  // No session ID — must be an initialize request.
  const msg = body as Record<string, unknown>;
  if (msg?.method !== "initialize") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Mcp-Session-Id header required for non-initialize requests" }));
    return;
  }

  const session = makeSession();
  await session.transport.handleRequest(req, res, body);
}
