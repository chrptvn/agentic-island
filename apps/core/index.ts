import { startHttpServer } from "./src/server/http.js";
import { World } from "./src/world/world.js";
import { HubConnector } from "./src/hub-connector/connector.js";
import { packageSprites } from "./src/hub-connector/sprite-uploader.js";
import { StateStreamer } from "./src/hub-connector/state-streamer.js";
import { getWorldConfig } from "./src/world/world-config.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

startHttpServer(parseInt(process.env.CORE_PORT ?? "3000", 10));

const world = World.getInstance();
world.watchConfigs();

// --- Hub Connector (opt-in via HUB_API_KEY env var) ---
const HUB_API_KEY = process.env.HUB_API_KEY;
if (HUB_API_KEY) {
  const hubUrl = process.env.HUB_URL ?? "ws://localhost:4000/ws/core";
  const worldName = process.env.WORLD_NAME ?? "My Island";
  const worldDescription = process.env.WORLD_DESCRIPTION ?? "";

  const connector = new HubConnector({
    hubUrl,
    apiKey: HUB_API_KEY,
    worldName,
    worldDescription,
  });

  connector.onConnected = (id) => {
    console.log(`[core] Connected to Hub — world ID: ${id}`);
    // Push initial state immediately so viewers see the world on first connect
    streamer.handleWorldUpdate(world);
  };
  connector.onDisconnected = () => {
    console.log("[core] Disconnected from Hub, will reconnect...");
  };
  connector.onError = (err) => {
    console.error("[core] Hub connector error:", err.message);
  };

  // Package all sprites from the unified sprites/ directory
  const sprites = await packageSprites(join(__dirname, "sprites")).catch(() => []);

  // Wire state streaming
  const streamer = new StateStreamer({ minIntervalMs: 500 });
  streamer.onStateReady((state) => {
    connector.sendStateUpdate(state);
  });

  // Listen for world updates
  world.on("map:updated", () => {
    streamer.handleWorldUpdate(world);
  });

  // Periodic state push so idle worlds still reach viewers
  const stateInterval = setInterval(() => {
    if (connector.isConnected) streamer.handleWorldUpdate(world);
  }, 2_000);
  if (stateInterval.unref) stateInterval.unref();

  // Connect with sprites and config
  connector.connect(sprites, getWorldConfig() as unknown as Record<string, unknown>);

  console.log(`[core] Hub connector enabled → ${hubUrl}`);
} else {
  console.log("[core] Hub connector disabled (set HUB_API_KEY to enable)");
}

// Legacy stdio transport, enabled via MCP_TRANSPORT=stdio for backward compatibility.
if (process.env.MCP_TRANSPORT === "stdio") {
  const { startServer } = await import("./src/mcp/server.js");
  startServer().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
