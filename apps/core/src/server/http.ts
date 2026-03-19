import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFile, readdir } from "fs/promises";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, type WebSocket } from "ws";
import { World } from "../world/world.js";
import { TILES, TILE_SIZE, TILE_GAP, TILE_SHEET, SHEET_OVERRIDES } from "../world/tile-registry.js";
import { allItemDefs } from "../world/item-registry.js";
import { handleMcpRequest } from "../mcp/mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "../..", "public");
const TILE_DIR   = join(__dirname, "../..", "DawnLike");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
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
    const world = World.getInstance();
    const map = world.getMap();
    const characters = [...world.characters.entries()].map(([id, c]) => ({
      id, x: c.x, y: c.y, action: c.action,
    }));
    jsonOk(res, {
      worldName: process.env.WORLD_NAME ?? "My Island",
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
    const [publicPngs, dawnlikeItems] = await Promise.all([
      readdir(PUBLIC_DIR).then(files => files.filter(f => f.endsWith(".png")).map(f => ({ url: `/${f}`, group: "public" }))),
      readdir(join(TILE_DIR, "Items")).then(files => files.filter(f => f.endsWith(".png")).map(f => ({ url: `/tiles/Items/${f}`, group: "DawnLike/Items" }))),
    ]);
    jsonOk(res, { sheets: [...publicPngs, ...dawnlikeItems] });
    return;
  }

  if (url === "/api/characters" && method === "GET") {
    const world = World.getInstance();
    const characters = Object.fromEntries(
      [...world.characters.entries()].map(([id, c]) => [
        id, { x: c.x, y: c.y, action: c.action, pathLength: c.path.length, stats: c.stats },
      ])
    );
    jsonOk(res, characters);
    return;
  }

  if (url === "/api/spawn" && method === "POST") {
    try {
      const body = await readBody(req) as { x: number; y: number; id?: string };
      const world = World.getInstance();
      const character = world.spawnCharacter(body.x, body.y, body.id);
      jsonOk(res, { message: `Character "${character.id}" spawned at (${body.x}, ${body.y}).`, character });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/spawn_random" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string };
      const world = World.getInstance();
      const positions = world.getValidSpawnPositions();
      if (positions.length === 0) throw new Error("No valid spawn positions available.");
      const pos = positions[Math.floor(Math.random() * positions.length)];
      const character = world.spawnCharacter(pos.x, pos.y, body.id);
      jsonOk(res, { message: `Character "${character.id}" spawned at (${pos.x}, ${pos.y}).`, character });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/despawn" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string };
      World.getInstance().despawnCharacter(body.id);
      jsonOk(res, { message: `Character "${body.id}" despawned.` });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/regenerate" && method === "POST") {
    try {
      const body = await readBody(req) as { width?: number; height?: number; seed?: number; fillProbability?: number; iterations?: number };
      const world = World.getInstance();
      const map = world.regenerateMap(body);
      jsonOk(res, { message: "Map regenerated.", seed: map.seed, width: map.width, height: map.height });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/reset" && method === "POST") {
    try {
      const body = await readBody(req) as { width?: number; height?: number; characterId?: string };
      const world = World.getInstance();
      const map = world.regenerateMap({ width: body.width, height: body.height });
      const characterId = body.characterId ?? "Carl";
      try { world.despawnCharacter(characterId); } catch { /* not spawned, fine */ }
      const positions = world.getValidSpawnPositions();
      if (positions.length === 0) throw new Error("No valid spawn positions after regeneration.");
      const pos = positions[Math.floor(Math.random() * positions.length)];
      const character = world.spawnCharacter(pos.x, pos.y, characterId);
      jsonOk(res, { message: `World reset. "${character.id}" spawned at (${pos.x}, ${pos.y}).`, seed: map.seed, width: map.width, height: map.height, character });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/command" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; command: { type: string; x?: number; y?: number; target_filter?: string[] } };
      const world = World.getInstance();

      if (body.command.type === "harvest") {
        const { item, target_x, target_y } = body.command as { item?: string; target_x?: number; target_y?: number };
        const result = world.harvest(body.id, item, target_x, target_y);
        const pos = target_x !== undefined ? `(${target_x},${target_y})` : "current position";
        jsonOk(res, { message: `Harvested at ${pos}.`, ...result });
        return;
      }

      if (body.command.type === "craft") {
        const { recipe } = body.command as unknown as { recipe: string };
        const result = world.craft(body.id, recipe);
        jsonOk(res, { message: `Crafted ${Object.keys(result.crafted).join(", ")}.`, ...result });
        return;
      }

      if (body.command.type !== "move_to") {
        jsonErr(res, 400, `Unknown command type "${body.command.type}". Valid types: move_to, harvest, craft.`);
        return;
      }

      const moveCmd = body.command.target_filter
        ? { move_to: { target_filter: body.command.target_filter } }
        : { move_to: { x: body.command.x!, y: body.command.y! } };
      const { character, entityPos, notFound } = world.sendCommand(body.id, moveCmd);

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
      const world = World.getInstance();
      const result = world.eat(body.id, body.item);
      jsonOk(res, { message: `Ate ${body.item} (+${result.hungerRestored} hunger).`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/container/inspect" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number };
      const result = World.getInstance().containerInspect(body.id, body.x, body.y);
      jsonOk(res, result);
    } catch (err) { jsonErr(res, 400, (err as Error).message); }
    return;
  }

  if (url === "/api/container/put" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number; item: string; qty: number };
      const result = World.getInstance().containerPut(body.id, body.x, body.y, body.item, body.qty);
      jsonOk(res, { message: `Stored ${result.transferred}x ${body.item} in container.`, ...result });
    } catch (err) { jsonErr(res, 400, (err as Error).message); }
    return;
  }

  if (url === "/api/container/take" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number; item: string; qty: number };
      const result = World.getInstance().containerTake(body.id, body.x, body.y, body.item, body.qty);
      jsonOk(res, { message: `Took ${result.transferred}x ${body.item} from container.`, ...result });
    } catch (err) { jsonErr(res, 400, (err as Error).message); }
    return;
  }

  if (url === "/api/equip" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; item: string; slot: string };
      const world = World.getInstance();
      const result = world.equip(body.id, body.item, body.slot as import("../world/character-registry.js").EquipmentSlot);
      jsonOk(res, { message: `Equipped "${body.item}" in slot "${body.slot}".`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/unequip" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; slot: string };
      const world = World.getInstance();
      const result = world.unequip(body.id, body.slot as import("../world/character-registry.js").EquipmentSlot);
      jsonOk(res, { message: `Unequipped "${result.item}" from slot "${body.slot}".`, item: result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/plant" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; seed_item: string };
      const result = World.getInstance().plant(body.id, body.seed_item);
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
      const world = World.getInstance();
      if (body.action === "add") {
        world.addPath(body.x, body.y);
        jsonOk(res, { message: `Dirt path added at (${body.x}, ${body.y}).`, x: body.x, y: body.y });
      } else {
        world.removePath(body.x, body.y);
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
      const result = World.getInstance().plowCell(body.id);
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
      World.getInstance().say(body.id, body.text);
      jsonOk(res, { message: `"${body.id}" says: ${body.text}` });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/build" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; target_x: number; target_y: number; entity_id: string };
      const result = World.getInstance().build(body.id, body.target_x, body.target_y, body.entity_id);
      jsonOk(res, { message: `Built "${result.built}" at (${body.target_x}, ${body.target_y}).`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/interact" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; target_x: number; target_y: number };
      const result = World.getInstance().interact(body.id, body.target_x, body.target_y);
      jsonOk(res, { message: `Interacted with entity at (${body.target_x}, ${body.target_y}) → now "${result.result}".`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }

  if (url === "/api/feed" && method === "POST") {
    try {
      const body = await readBody(req) as { id: string; x: number; y: number; qty?: number };
      const result = World.getInstance().feedEntity(body.id, body.x, body.y, body.qty ?? 1);
      jsonOk(res, { message: `Fed ${result.fed} fuel to entity at (${body.x}, ${body.y}). Health: ${result.health}/${result.maxHealth}.`, ...result });
    } catch (err) {
      jsonErr(res, 400, (err as Error).message);
    }
    return;
  }


  let filePath: string;
  if (url.startsWith("/tiles/")) {
    filePath = join(TILE_DIR, url.slice("/tiles/".length));
  } else {
    filePath = join(PUBLIC_DIR, url === "/" ? "/index.html" : url);
  }

  try {
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function mapPayload(world: World) {
  return JSON.stringify({
    type: "map",
    data: world.toJSON(),
  });
}

export function startHttpServer(initialPort = 3000): void {
  const world = World.getInstance();

  const httpServer = createServer((req, res) =>
    handleRequest(req, res).catch((err) => {
      process.stderr.write(`HTTP handler error: ${err}\n`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    })
  );
  const wss = new WebSocketServer({ server: httpServer });

  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(mapPayload(world));
    ws.on("close", () => clients.delete(ws));
  });

  world.on("map:updated", () => {
    const msg = mapPayload(world);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  });

  // Poll DB every second to catch map changes made by other processes (e.g. MCP server)
  setInterval(() => world.syncFromDb(), 1000).unref();

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      process.stderr.write(`Agentic Island: port ${initialPort} already in use — skipping HTTP server (MCP will proxy to existing instance).\n`);
      httpServer.removeAllListeners();
    } else {
      process.stderr.write(`Agentic Island error: ${err.message}\n`);
    }
  });

  wss.on("error", () => { /* handled by httpServer error handler */ });

  httpServer.listen(initialPort, () => {
    const addr = httpServer.address();
    const bound = typeof addr === "object" && addr ? addr.port : initialPort;
    process.stderr.write(`Agentic Island running at http://localhost:${bound}\n`);
    process.stderr.write(`Agentic Island MCP server : http://localhost:${bound}/mcp\n`);
  });
}
