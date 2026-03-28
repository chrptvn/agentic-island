import { startHttpServer } from "./src/server/http.js";
import { Island } from "./src/island/island.js";
import { HubConnector } from "./src/hub-connector/connector.js";
import { packageSprites } from "./src/hub-connector/sprite-uploader.js";
import { StateStreamer } from "./src/hub-connector/state-streamer.js";
import { getIslandConfig } from "./src/island/island-config.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isPrimary = await startHttpServer(parseInt(process.env.ISLAND_PORT ?? "3002", 10));

const island = Island.getInstance();
island.watchConfigs();

// --- Hub Connector (opt-in via HUB_API_KEY env var) ---
const HUB_API_KEY = process.env.HUB_API_KEY;
if (!isPrimary) {
  console.log("[island] Hub connector skipped — another instance owns the HTTP port");
} else if (HUB_API_KEY) {
  const hubUrl = process.env.HUB_URL ?? "ws://localhost:3001/ws/island";
  const islandName = process.env.ISLAND_NAME ?? "My Island";
  const islandDescription = process.env.ISLAND_DESCRIPTION ?? "";

  const connector = new HubConnector({
    hubUrl,
    apiKey: HUB_API_KEY,
    islandName,
    islandDescription,
  });

  connector.onConnected = (id) => {
    console.log(`[island] Connected to Hub — island ID: ${id}`);
    // Push initial state immediately so viewers see the island on first connect
    streamer.handleIslandUpdate(island);
  };
  connector.onDisconnected = () => {
    console.log("[island] Disconnected from Hub, will reconnect...");
  };
  connector.onError = (err) => {
    console.error("[island] Hub connector error:", err.message);
  };

  // Package all sprites from the unified sprites/ directory
  const sprites = await packageSprites(join(__dirname, "sprites")).catch(() => []);

  // Generate a pixel-art thumbnail from the island's terrain
  const thumbnailData = island.getThumbnailBase64();
  const thumbnail = {
    filename: "thumbnail.png",
    mimeType: "image/png",
    data: thumbnailData,
  };

  // Wire state streaming
  const streamer = new StateStreamer({ minIntervalMs: 500 });
  streamer.onStateReady((state) => {
    connector.sendStateUpdate(state);
  });

  // Listen for island updates
  island.on("map:updated", () => {
    streamer.handleIslandUpdate(island);
  });

  // Periodic state push so idle islands still reach viewers
  const stateInterval = setInterval(() => {
    if (connector.isConnected) streamer.handleIslandUpdate(island);
  }, 2_000);
  if (stateInterval.unref) stateInterval.unref();

  // Connect with sprites, config, and thumbnail
  connector.connect(sprites, getIslandConfig() as unknown as Record<string, unknown>, thumbnail);

  console.log(`[island] Hub connector enabled → ${hubUrl}`);
} else {
  console.log("[island] Hub connector disabled (set HUB_API_KEY to enable)");
}

