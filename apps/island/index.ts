import { startHttpServer } from "./src/server/http.js";
import { initTileRegistry, getAtlasPng } from "./src/island/tile-registry.js";
import { Island } from "./src/island/island.js";
import { HubConnector } from "./src/hub-connector/connector.js";
import { packageSprites, type SpritePayload } from "./src/hub-connector/sprite-uploader.js";
import { StateStreamer } from "./src/hub-connector/state-streamer.js";
import { getIslandConfig } from "./src/island/island-config.js";
import { sanitizeServerName } from "./src/utils/sanitize.js";
import { initToolAtlas, getToolAtlasPng, getToolAtlas128Png } from "./src/island/tool-sprites.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, ".env");

/** Persist a key=value pair into the island's .env file. */
function saveToEnv(key: string, value: string): void {
  let lines: string[] = [];
  try { lines = readFileSync(ENV_PATH, "utf8").split("\n"); } catch { /* no file yet */ }
  const exists = lines.some(l => l.match(new RegExp(`^${key}=`)));
  if (exists) {
    lines = lines.map(l => l.match(new RegExp(`^${key}=`)) ? `${key}=${value}` : l);
  } else {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(ENV_PATH, lines.join("\n"), "utf8");
}

// Build the tileset atlas in memory (must happen before Island uses tile-registry)
await initTileRegistry();
// Build the tool overlay atlas in memory
await initToolAtlas();

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

  connector.onConnected = async (id, accessKey) => {
    console.log(`[island] Connected to Hub — island ID: ${id}`);

    if (accessKey) {
      // New key issued — save it for later retrieval
      process.env.ISLAND_ACCESS_KEY = accessKey;
      try { saveToEnv("ISLAND_ACCESS_KEY", accessKey); } catch { /* non-fatal */ }
    }

    let storedKey = accessKey ?? process.env.ISLAND_ACCESS_KEY;

    // If secured but key is missing locally, auto-regenerate via REST API
    if (isSecured && !storedKey) {
      try {
        const httpBase = hubUrl.replace(/^ws/, "http").replace("/ws/island", "");
        const res = await fetch(`${httpBase}/api/islands/${id}/regenerate-key`, {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
        if (res.ok) {
          const json = await res.json() as { accessKey: string };
          storedKey = json.accessKey;
          process.env.ISLAND_ACCESS_KEY = storedKey;
          try { saveToEnv("ISLAND_ACCESS_KEY", storedKey); } catch { /* non-fatal */ }
        }
      } catch { /* non-fatal — key display will be skipped */ }
    }

    const mcpUrl = hubUrl.replace(/^ws/, "http").replace("/ws/island", "") + `/islands/${id}/mcp`;
    const sanitizedName = sanitizeServerName(islandName);
    if (isSecured && storedKey) {
      console.log();
      console.log("  ════════════════════════════════════════════════════════");
      console.log("  🔒 Your island is secured. Here's your MCP configuration:");
      console.log();
      console.log("  {");
      console.log(`    "servers": {`);
      console.log(`      "${sanitizedName}": {`);
      console.log(`        "type": "http",`);
      console.log(`        "url": "${mcpUrl}",`);
      console.log(`        "headers": {`);
      console.log(`          "Authorization": "Bearer ${storedKey}"`);
      console.log(`        }`);
      console.log(`      }`);
      console.log(`    }`);
      console.log("  }");
      console.log("  ════════════════════════════════════════════════════════");
      console.log();
    } else if (!isSecured) {
      console.log();
      console.log("  ════════════════════════════════════════════════════════");
      console.log("  🔓 Your island is open. Here's your MCP configuration:");
      console.log();
      console.log("  {");
      console.log(`    "servers": {`);
      console.log(`      "${sanitizedName}": {`);
      console.log(`        "type": "http",`);
      console.log(`        "url": "${mcpUrl}"`);
      console.log(`      }`);
      console.log(`    }`);
      console.log("  }");
      console.log("  ════════════════════════════════════════════════════════");
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

  // Package all sprites from the unified sprites/ directory.
  // Exclude source directories not needed by the client:
  // - Old character mega-sheets (replaced by per-agent composites)
  // - New LPC Characters sources (compositor reads them server-side)
  // - Source tileset sheets (replaced by the in-memory atlas)
  const SPRITE_EXCLUDE = [
    "/characters/",
    "/LPC Characters/",
    "/lpc-character-bases-v3_1/",
    "/lpc-characters/",
    "/Pipoya RPG Tileset 32x32/",
    "/decoration_medieval/",
    "/food.png",
  ];
  const sprites = await packageSprites(join(__dirname, "sprites"), "", SPRITE_EXCLUDE).catch((): SpritePayload[] => []);

  // Add the in-memory tileset atlas
  sprites.push({
    filename: "tileset-atlas.png",
    mimeType: "image/png",
    data: getAtlasPng().toString("base64"),
  });

  // Add shared tool overlay atlases (64px + 128px)
  sprites.push({
    filename: "tool-atlas.png",
    mimeType: "image/png",
    data: getToolAtlasPng().toString("base64"),
  });
  sprites.push({
    filename: "tool-atlas-128.png",
    mimeType: "image/png",
    data: getToolAtlas128Png().toString("base64"),
  });

  // Generate a pixel-art thumbnail from the island's terrain
  const thumbnailData = island.getThumbnailBase64();
  const thumbnail = {
    filename: "thumbnail.png",
    mimeType: "image/png",
    data: thumbnailData,
  };

  // Wire state streaming
  const streamer = new StateStreamer({ minIntervalMs: 200, charIntervalMs: 100 });
  streamer.onStateReady((state) => {
    connector.sendStateUpdate(state);
  });
  streamer.onCharacterReady((characters) => {
    connector.sendCharacterUpdate(characters);
  });

  // Listen for island updates
  island.on("map:updated", () => {
    streamer.handleIslandUpdate(island);
  });

  // Listen for dynamic sprite updates (character composites)
  island.on("sprites:update", (sprites: SpritePayload[]) => {
    connector.sendSpriteUpdate(sprites);
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

