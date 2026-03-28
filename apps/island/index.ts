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

// --- Hub Connector (opt-in via API_KEY env var) ---
const API_KEY = process.env.API_KEY;
if (!isPrimary) {
  console.log("[island] Hub connector skipped — another instance owns the HTTP port");
} else if (API_KEY) {
  const hubUrl = process.env.HUB_URL ?? "ws://localhost:3001/ws/island";
  const islandName = process.env.ISLAND_NAME ?? "My Island";
  const islandDescription = process.env.ISLAND_DESCRIPTION ?? "";
  const isSecured = process.env.ISLAND_SECURED === "true" || process.env.ISLAND_SECURED === "1";

  const connector = new HubConnector({
    hubUrl,
    apiKey: API_KEY,
    islandName,
    islandDescription,
    secured: isSecured,
  });

  connector.onConnected = (id, accessKey) => {
    console.log(`[island] Connected to Hub — island ID: ${id}`);
    
    // Display access key and MCP config for secured islands
    if (accessKey) {
      console.log();
      console.log("  ════════════════════════════════════════════════════════");
      console.log("  🔒 Your island is secured. Here's your MCP configuration:");
      console.log();
      console.log("  {");
      console.log(`    "mcpServers": {`);
      console.log(`      "${islandName}": {`);
      console.log(`        "url": "${hubUrl.replace("/ws/island", "")}/islands/${id}/mcp",`);
      console.log(`        "headers": {`);
      console.log(`          "Authorization": "Bearer ${accessKey}"`);
      console.log(`        }`);
      console.log(`      }`);
      console.log(`    }`);
      console.log("  }");
      console.log("  ⚠️  The previous key (if any) is now invalid. Save this key securely!");
      console.log("  ════════════════════════════════════════════════════════");
      console.log();
    } else if (isSecured) {
      console.log("[island] Island is secured — use your existing access key to connect");
      console.log("[island] To regenerate your access key, run: islandctl island get-key");
    } else {
      // Unsecured island — show simple MCP config
      const mcpUrl = hubUrl.replace(/^ws/, "http").replace("/ws/island", "") + `/islands/${id}/mcp`;
      console.log();
      console.log("  🔓 Your island is open. MCP endpoint:");
      console.log(`     ${mcpUrl}`);
      console.log();
    }
    
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
  console.log("[island] Hub connector disabled (set API_KEY to enable)");
}

