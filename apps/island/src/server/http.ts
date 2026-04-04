import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFile, readdir } from "fs/promises";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { Island } from "../island/island.js";
import { MAP_SIZE_PRESETS, type MapSize } from "../island/map.js";
import { TILES, TILE_SIZE, TILE_GAP, TILE_SHEET, SHEET_OVERRIDES } from "../island/tile-registry.js";
import { allItemDefs } from "../island/item-registry.js";
import { RECIPES } from "../island/craft-registry.js";
import { BUILD_DEFS } from "../island/entity-registry.js";
import { handleMcpRequest } from "../mcp/mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_DIR  = join(__dirname, "../..", "sprites");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "null")); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function drainBody(req: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    req.resume();
    req.on("end", resolve);
    req.on("error", resolve);
  });
}

function jsonOk(res: ServerResponse, data: unknown) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}

function jsonErr(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // MCP endpoint — session-per-client, routes by Mcp-Session-Id header
  if (url === "/mcp" || url.startsWith("/mcp?") || url.startsWith("/mcp/")) {
    const body = method === "POST" ? await readBody(req).catch(() => undefined) : undefined;
    await handleMcpRequest(req, res, body);
    return;
  }


  // JSON API
  if (url === "/api/status" && method === "GET") {
    const island = Island.getInstance();
    const map = island.getMap();
    const characters = [...island.characters.entries()].map(([id, c]) => ({
      id, x: c.x, y: c.y, action: c.action,
    }));
    jsonOk(res, {
      islandName: process.env.ISLAND_NAME ?? "My Island",
      map: { width: map.width, height: map.height, seed: map.seed },
      characterCount: characters.length,
      characters,
    });
    return;
  }

  if (url === "/api/tiles" && method === "GET") {
    jsonOk(res, { sheet: TILE_SHEET, tileSize: TILE_SIZE, tileGap: TILE_GAP, sheets: SHEET_OVERRIDES, tiles: TILES, itemDefs: Object.fromEntries(allItemDefs()) });
    return;
  }

  if (url === "/api/sheets" && method === "GET") {
    const sprites = await readdir(SPRITE_DIR)
      .then(files => files.filter(f => f.endsWith(".png")).map(f => ({ url: `/${f}`, group: "sprites" })));
    jsonOk(res, { sheets: sprites });
    return;
  }

  if (url === "/api/recipes" && method === "GET") {
    const buildable: Record<string, { costs: Record<string, number> }> = {};
    for (const [id, def] of Object.entries(BUILD_DEFS)) {
      buildable[id] = { costs: def.costs };
    }
    jsonOk(res, { crafting: RECIPES, building: buildable });
    return;
  }

  if (url === "/api/characters" && method === "GET") {
    const island = Island.getInstance();
    const characters = Object.fromEntries(
      [...island.characters.entries()].map(([id, c]) => [
        id, { x: c.x, y: c.y, action: c.action, pathLength: c.path.length, stats: c.stats },
      ])
    );
    jsonOk(res, characters);
    return;
  }

  if (url === "/api/disconnect" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string };
      Island.getInstance().disconnect(body.id);
      jsonOk(res, { message: `Character "${body.id}" disconnected from the island.` });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/regenerate" && method === "POST") {
    try {
      const body = await readBody(req) as { size?: MapSize; seed?: number };
      if (body.size && !MAP_SIZE_PRESETS[body.size]) {
        jsonErr(res, 400, `Invalid size "${body.size}". Valid sizes: ${Object.keys(MAP_SIZE_PRESETS).join(", ")}`);
        return;
      }
      const island = Island.getInstance();
      const map = island.regenerateMap({ size: body.size, seed: body.seed });
      jsonOk(res, { message: "Map regenerated.", size: map.size, seed: map.seed, width: map.width, height: map.height });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/reset" && method === "POST") {
    try {
      const body = await readBody(req) as { size?: MapSize; characterId?: string };
      if (body.size && !MAP_SIZE_PRESETS[body.size]) {
        jsonErr(res, 400, `Invalid size "${body.size}". Valid sizes: ${Object.keys(MAP_SIZE_PRESETS).join(", ")}`);
        return;
      }
      const island = Island.getInstance();
      const map = island.regenerateMap({ size: body.size });
      const characterId = body.characterId ?? "Carl";
      try { island.disconnect(characterId); } catch { /* not spawned, fine */ }
      const { character, reconnected } = island.connect(characterId);
      jsonOk(res, { message: `Island reset. "${characterId}" spawned at (${character.x}, ${character.y}).`, size: map.size, seed: map.seed, width: map.width, height: map.height, character: { id: characterId, x: character.x, y: character.y }, reconnected });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/command" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; command: { type: string; x?: number; y?: number; target_filter?: string[] } };
      const island = Island.getInstance();

      if (body.command.type === "harvest") {
        const { item, target_x, target_y } = body.command as { item?: string; target_x?: number; target_y?: number };
        const result = island.harvest(body.id, item, target_x, target_y);
        const pos = target_x !== undefined ? `(${target_x},${target_y})` : "current position";
        jsonOk(res, { message: `Harvested at ${pos}.`, ...result });
        return;
      }

      if (body.command.type === "craft") {
        const { recipe } = body.command as unknown as { recipe: string };
        const result = island.craft(body.id, recipe);
        jsonOk(res, { message: `Crafted ${Object.keys(result.crafted).join(", ")}.`, ...result });
        return;
      }

      if (body.command.type === "enter_tent") {
        const { target_x, target_y } = body.command as unknown as { target_x: number; target_y: number };
        const result = island.enterTent(body.id, target_x, target_y);
        jsonOk(res, { message: `Entered tent at (${target_x},${target_y}).`, ...result });
        return;
      }

      if (body.command.type === "exit_tent") {
        const result = island.exitTent(body.id);
        jsonOk(res, { message: `Exited tent. Now at (${result.x},${result.y}).`, ...result });
        return;
      }

      if (body.command.type !== "move_to") {
        jsonErr(res, 400, `Unknown command type "${body.command.type}". Valid types: move_to, harvest, craft, enter_tent, exit_tent.`);
        return;
      }

      const moveCmd = body.command.target_filter
        ? { move_to: { target_filter: body.command.target_filter } }
        : { move_to: { x: body.command.x!, y: body.command.y! } };
      const { character, entityPos, notFound } = island.sendCommand(body.id, moveCmd);

      if (notFound) {
        const nearbyDesc = Object.entries(notFound.nearby)
          .sort((a, b) => b[1] - a[1])
          .map(([id, count]) => `${id} ×${count}`)
          .join(", ");
        jsonOk(res, {
          found: false,
          searched: notFound.searched,
          message: `Nothing matching [${notFound.searched.join(", ")}] found within 15 tiles.${nearbyDesc ? ` Nearby entities: ${nearbyDesc}.` : " No entities visible nearby."}`,
          nearby: notFound.nearby,
          position: { x: character.x, y: character.y },
        });
        return;
      }

      const atDestination = character.path.length === 0;
      const msg = atDestination && entityPos
        ? `Already adjacent to entity at (${entityPos.x},${entityPos.y}). Ready to harvest — pass target_x: ${entityPos.x}, target_y: ${entityPos.y} to harvest.`
        : `Command 'move_to' sent to "${body.id}". Walking ${character.path.length} steps.`;
      jsonOk(res, {
        message: msg,
        position: { x: character.x, y: character.y },
        destination: character.path[character.path.length - 1] ?? { x: character.x, y: character.y },
        entityPosition: entityPos,
        pathLength: character.path.length,
        action: character.action,
      });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/eat" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; item: string };
      const island = Island.getInstance();
      const result = island.eat(body.id, body.item);
      jsonOk(res, { message: `Ate ${body.item} (+${result.hungerRestored} hunger).`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/container/inspect" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number };
      const result = Island.getInstance().containerInspect(body.id, body.x, body.y);
      jsonOk(res, result);
    } catch (err) { jsonErr(res, 400, (err as Error).message); }
    return;
  }

  if (url === "/api/container/put" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number; item: string; qty: number };
      const result = Island.getInstance().containerPut(body.id, body.x, body.y, body.item, body.qty);
      jsonOk(res, { message: `Stored ${result.transferred}x ${body.item} in container.`, ...result });
    } catch (err) { jsonErr(res, 400, (err as Error).message); }
    return;
  }

  if (url === "/api/container/take" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number; item: string; qty: number };
      const result = Island.getInstance().containerTake(body.id, body.x, body.y, body.item, body.qty);
      jsonOk(res, { message: `Took ${result.transferred}x ${body.item} from container.`, ...result });
    } catch (err) { jsonErr(res, 400, (err as Error).message); }
    return;
  }

  if (url === "/api/equip" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; item: string; slot: string };
      const island = Island.getInstance();
      const result = island.equip(body.id, body.item, body.slot as import("../island/character-registry.js").EquipmentSlot);
      jsonOk(res, { message: `Equipped "${body.item}" in slot "${body.slot}".`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/unequip" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; slot: string };
      const island = Island.getInstance();
      const result = island.unequip(body.id, body.slot as import("../island/character-registry.js").EquipmentSlot);
      jsonOk(res, { message: `Unequipped "${result.item}" from slot "${body.slot}".`, item: result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/plant" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; seed_item: string };
      const result = Island.getInstance().plant(body.id, body.seed_item);
      jsonOk(res, { message: `Planted "${result.planted}" at current position.`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/path" && method === "POST") {
    try {
      const body = await readBody(req) as { x: number; y: number; action: "add" | "remove" };
      if (body.action !== "add" && body.action !== "remove") {
        jsonErr(res, 400, `"action" must be "add" or "remove".`);
        return;
      }
      const island = Island.getInstance();
      if (body.action === "add") {
        island.addPath(body.x, body.y);
        jsonOk(res, { message: `Dirt path added at (${body.x}, ${body.y}).`, x: body.x, y: body.y });
      } else {
        island.removePath(body.x, body.y);
        jsonOk(res, { message: `Dirt path removed at (${body.x}, ${body.y}).`, x: body.x, y: body.y });
      }
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/plow" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string };
      const result = Island.getInstance().plowCell(body.id);
      const msg = result.completed
        ? `Path created! Cell plowed successfully.`
        : `Plowing in progress (${result.progress}/${result.required}). ${result.hitsRemaining} hit(s) remaining.`;
      jsonOk(res, { ...result, message: msg });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/say" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; text: string };
      Island.getInstance().say(body.id, body.text);
      jsonOk(res, { message: `"${body.id}" says: ${body.text}` });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/build" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; target_x: number; target_y: number; entity_id: string };
      const result = Island.getInstance().build(body.id, body.target_x, body.target_y, body.entity_id);
      jsonOk(res, { message: `Built "${result.built}" at (${body.target_x}, ${body.target_y}).`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/interact" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; target_x: number; target_y: number };
      const result = Island.getInstance().interact(body.id, body.target_x, body.target_y);
      jsonOk(res, { message: `Interacted with entity at (${body.target_x}, ${body.target_y}) → now "${result.result}".`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/access-key" && method === "GET") {
    const accessKey = process.env.ISLAND_ACCESS_KEY;
    const isSecured = process.env.ISLAND_SECURED === "true" || process.env.ISLAND_SECURED === "1";

    if (!isSecured) {
      jsonErr(res, 400, "Island is not secured — no access key needed");
      return;
    }
    if (!accessKey) {
      jsonErr(res, 404, "Access key not available — restart the island to receive a new one");
      return;
    }

    const hubUrl = process.env.HUB_URL ?? "ws://localhost:3001/ws/island";
    const islandName = process.env.ISLAND_NAME ?? "My Island";
    const apiBaseUrl = hubUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace("/ws/island", "");

    // Find island ID by listing hub islands
    try {
      const listRes = await fetch(`${apiBaseUrl}/api/islands`);
      if (!listRes.ok) throw new Error(`Hub unreachable: ${listRes.statusText}`);
      const { islands } = await listRes.json() as { islands: { id: string; name: string }[] };
      const island = islands.find(i => i.name === islandName);
      const mcpUrl = island
        ? `${apiBaseUrl}/islands/${island.id}/mcp`
        : `${apiBaseUrl}/islands/<id>/mcp`;
      jsonOk(res, { islandName, accessKey, mcpUrl });
    } catch (err) {
      jsonOk(res, { islandName, accessKey, mcpUrl: null, warning: (err as Error).message });
    }
    return;
  }

  if (url === "/api/access-key/regenerate" && method === "POST") {
    const apiKey = process.env.API_KEY;
    const hubUrl = process.env.HUB_URL;
    const islandName = process.env.ISLAND_NAME ?? "My Island";

    if (!apiKey || !hubUrl) {
      jsonErr(res, 503, "Island is not connected to a hub (API_KEY or HUB_URL not set)");
      return;
    }

    const isSecured = process.env.ISLAND_SECURED === "true" || process.env.ISLAND_SECURED === "1";
    if (!isSecured) {
      jsonErr(res, 400, "Island is not secured — no access key needed");
      return;
    }

    // Derive hub HTTP URL from WebSocket URL
    const apiBaseUrl = hubUrl
      .replace(/^wss:\/\//, "https://")
      .replace(/^ws:\/\//, "http://")
      .replace("/ws/island", "");

    // List islands to find our ID by name, then regenerate key
    try {
      const listRes = await fetch(`${apiBaseUrl}/api/islands`);
      if (!listRes.ok) throw new Error(`Hub unreachable: ${listRes.statusText}`);

      const { islands } = await listRes.json() as { islands: { id: string; name: string; secured: boolean }[] };
      const matching = islands.filter(i => i.name === islandName && i.secured);

      if (matching.length === 0) {
        jsonErr(res, 404, `No secured online island found with name "${islandName}"`);
        return;
      }

      for (const island of matching) {
        const regenRes = await fetch(`${apiBaseUrl}/api/islands/${island.id}/regenerate-key`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        });

        if (regenRes.ok) {
          const data = await regenRes.json() as { accessKey: string };
          jsonOk(res, {
            islandId: island.id,
            islandName,
            accessKey: data.accessKey,
            mcpUrl: `${apiBaseUrl}/islands/${island.id}/mcp`,
          });
          return;
        }
        if (regenRes.status !== 404) {
          const err = await regenRes.json() as { error: string };
          jsonErr(res, regenRes.status, err.error ?? regenRes.statusText);
          return;
        }
      }

      jsonErr(res, 403, "Could not regenerate key — passport mismatch or island not found");
    } catch (err) {
      jsonErr(res, 500, (err as Error).message);
    }
    return;
  }

  if (url === "/api/feed" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number; qty?: number };
      const result = Island.getInstance().feedEntity(body.id, body.x, body.y, body.qty ?? 1);
      jsonOk(res, { message: `Fed ${result.fed} fuel to entity at (${body.x}, ${body.y}). Health: ${result.health}/${result.maxHealth}.`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }


  // Static file serving: sprites only (no local viewer)
  const requestedFile = url === "/" ? "" : decodeURIComponent(url);
  if (requestedFile) {
    const spritePath = join(SPRITE_DIR, requestedFile);
    try {
      const data = await readFile(spritePath);
      const mime = MIME[extname(spritePath)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(data);
      return;
    } catch { /* not found */ }
  }

  res.writeHead(404);
  res.end("Not found");
}

export function startHttpServer(initialPort = 3000): Promise<boolean> {
  const island = Island.getInstance();

  const httpServer = createServer((req, res) =>
    handleRequest(req, res).catch((err) => {
      process.stderr.write(`HTTP handler error: ${err}\n`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    })
  );

  // Poll DB every second to catch map changes made by other processes (e.g. MCP server)
  setInterval(() => island.syncFromDb(), 1000).unref();

  return new Promise((resolve, reject) => {
    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(`Agentic Island: port ${initialPort} already in use — skipping HTTP server (MCP will proxy to existing instance).\n`);
        httpServer.removeAllListeners();
        resolve(false);
      } else {
        process.stderr.write(`Agentic Island error: ${err.message}\n`);
        reject(err);
      }
    });

    httpServer.listen(initialPort, () => {
      const addr = httpServer.address();
      const bound = typeof addr === "object" && addr ? addr.port : initialPort;
      process.stderr.write(`Agentic Island running at http://localhost:${bound}\n`);
      process.stderr.write(`Agentic Island MCP server : http://localhost:${bound}/mcp\n`);
      resolve(true);
    });
  });
}
