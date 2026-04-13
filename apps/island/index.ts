import type { TileRegistry } from "@agentic-island/shared";
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

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  const connector = new HubConnector({
    hubUrl,
    apiKey: API_KEY,
    islandName,
    islandDescription,
  });

  connector.onConnected = async (id) => {
    console.log(`[island] Connected to Hub — island ID: ${id}`);

    const mcpUrl = hubUrl.replace(/^ws/, "http").replace("/ws/island", "") + `/islands/${id}/mcp`;
    const passportUrl = hubUrl.replace(/^ws/, "http").replace("/ws/island", "") + `/islands/${id}`;
    const sanitizedName = sanitizeServerName(islandName);
    console.log();
    console.log("  ════════════════════════════════════════════════════════");
    console.log("  🏝️  Your island is published! MCP configuration:");
    console.log();
    console.log("  {");
    console.log(`    "servers": {`);
    console.log(`      "${sanitizedName}": {`);
    console.log(`        "type": "http",`);
    console.log(`        "url": "${mcpUrl}",`);
    console.log(`        "headers": {`);
    console.log(`          "Authorization": "Bearer <your-passport-key>"`);
    console.log(`        }`);
    console.log(`      }`);
    console.log(`    }`);
    console.log("  }");
    console.log();
    console.log(`  Get your passport key at: ${passportUrl}`);
    console.log("  ════════════════════════════════════════════════════════");
    console.log();

    // Push initial full snapshot so viewers see the island on first connect
    streamer.sendFullSnapshot(island);
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

  // Wire state streaming (delta-based with tile ID compression)
  const streamer = new StateStreamer({ minIntervalMs: 200 });
  streamer.setTileRegistry(island.getTileRegistry() as TileRegistry);

  streamer.onMapReady(({ map, tileRegistry, tileLookup }) => {
    connector.sendMapInit(map, tileRegistry, tileLookup);
  });
  streamer.onStateReady(({ entities, characters, overrides }) => {
    connector.sendInitialState(entities, characters, overrides);
  });
  streamer.onDeltaReady((delta) => {
    connector.sendStateDelta(delta);
  });

  // Listen for island updates
  island.on("map:updated", () => {
    streamer.handleIslandUpdate(island);
  });

  // Listen for dynamic sprite updates (character composites)
  island.on("sprites:update", (sprites: SpritePayload[]) => {
    connector.sendSpriteUpdate(sprites);
  });

  // Connect with sprites, config, and thumbnail
  connector.connect(sprites, getIslandConfig() as unknown as Record<string, unknown>, thumbnail);

  console.log(`[island] Hub connector enabled → ${hubUrl}`);
} else {
  console.log("[island] Hub connector disabled (set API_KEY to enable)");
}

