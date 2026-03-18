import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { World } from "../../world/world.js";
import { TILES } from "../../world/tile-registry.js";
import { ENTITY_DEFS } from "../../world/entity-registry.js";

export function registerSpawnableTilesTools(server: McpServer): void {
  server.tool(
    "list_spawnable_tiles",
    "Return all entity tiles that can be procedurally spawned on the map (spawn weight > 0), including their tile IDs, spawn weight, and whether they require a deep cell.",
    {},
    async () => {
      const spawnable = ENTITY_DEFS
        .filter(e => e.spawn && e.spawn.weight > 0)
        .map(e => ({
          id:           e.id,
          tileType:     e.tileType,
          topTileId:    e.topTileId,
          weight:       e.spawn!.weight,
          requiresDeep: e.spawn!.requiresDeep,
        }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: spawnable.length, tiles: spawnable }, null, 2),
          },
        ],
      };
    }
  );
}

export function registerTileQueryTools(server: McpServer): void {
  server.tool(
    "list_tiles",
    "List all available tiles from the tileset registry. Returns tile IDs, sheet positions, descriptions, categories, and suggested layer. Use tile IDs with set_tile to paint specific tiles on the map. Note: tiles with category 'item' are inventory items and cannot be placed on the map directly — they can only be stored in containers.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: TILES.length,
                layers: {
                  0: "base terrain (grass, stone, water, sand…)",
                  1: "ground cover (path, rubble, decoration…)",
                  2: "objects (tree, fire, chest, well…)",
                },
                note: "Tiles with category 'item' are inventory-only and cannot be placed on the map.",
                tiles: TILES.map((t) => ({
                  id:          t.id,
                  col:         t.col,
                  row:         t.row,
                  layer:       t.layer,
                  description: t.description,
                  category:    t.category,
                  placeable:   t.category !== "item",
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

export function registerTileEditTools(server: McpServer): void {
  const world = World.getInstance();

  server.tool(
    "set_tile",
    "Paint a specific tile at a given (x, y) position on a layer. Layer 0 = base terrain (replaces grass/stone/water), layer 1 = ground cover, layer 2 = path tiles, layer 3 = objects on top. Changes are persisted and immediately visible in the browser. Use list_tiles to discover available tile IDs and their suggested layers. Tiles with category 'item' (e.g. wood, branches, stone_knife) cannot be placed on the map — they are inventory items.",
    {
      x:       z.number().int().describe("X coordinate (0 = left edge)"),
      y:       z.number().int().describe("Y coordinate (0 = top edge)"),
      layer:   z.number().int().min(0).max(4).describe("Layer: 0=terrain, 1=ground cover, 2=path, 3=objects, 4=canopy"),
      tile_id: z.string().describe("Tile ID from the registry (e.g. 'grass', 'tree', 'campfire')"),
    },
    async ({ x, y, layer, tile_id }) => {
      try {
        world.setTile(x, y, layer, tile_id);
        return {
          content: [
            {
              type: "text",
              text: `Placed tile "${tile_id}" at (${x}, ${y}) on layer ${layer}.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "set_tiles",
    "Paint multiple tiles in a single operation. All changes are written atomically in one DB transaction and trigger a single browser update. Ideal for painting areas, paths, or complex structures. Each entry specifies x, y, layer, and tile_id.",
    {
      tiles: z.array(
        z.object({
          x:       z.number().int().describe("X coordinate"),
          y:       z.number().int().describe("Y coordinate"),
          layer:   z.number().int().min(0).max(4).describe("Layer: 0=terrain, 1=ground cover, 2=path, 3=objects, 4=canopy"),
          tile_id: z.string().describe("Tile ID from the registry"),
        })
      ).min(1).describe("Array of tile placements"),
    },
    async ({ tiles }) => {
      try {
        world.setTiles(tiles.map((t: { x: number; y: number; layer: number; tile_id: string }) => ({ x: t.x, y: t.y, layer: t.layer, tileId: t.tile_id })));
        return {
          content: [{ type: "text", text: `Placed ${tiles.length} tile(s) successfully.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "clear_tile",
    "Remove a tile override from a specific layer at (x, y). Layer 0 reverts the cell to its procedurally generated terrain. Layers 1–4 become empty (transparent).",
    {
      x:     z.number().int().describe("X coordinate"),
      y:     z.number().int().describe("Y coordinate"),
      layer: z.number().int().min(0).max(4).describe("Layer to clear: 0=terrain, 1=ground cover, 2=path, 3=objects, 4=canopy"),
    },
    async ({ x, y, layer }) => {
      try {
        world.clearTile(x, y, layer);
        return {
          content: [{ type: "text", text: `Cleared layer ${layer} at (${x}, ${y}).` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );
}

export function registerPathTools(server: McpServer): void {
  const world = World.getInstance();

  server.tool(
    "set_path",
    "Place or remove a dirt path segment at (x, y). The correct tile variant is automatically chosen based on adjacent path cells — no need to specify a tile ID. Placing a path on a cell already occupied by a path is a no-op. Removing a non-path cell is a no-op.",
    {
      x:      z.number().int().describe("X coordinate"),
      y:      z.number().int().describe("Y coordinate"),
      action: z.enum(["add", "remove"]).describe('"add" to place a dirt path, "remove" to clear it'),
    },
    async ({ x, y, action }) => {
      try {
        if (action === "add") {
          world.addPath(x, y);
          return { content: [{ type: "text", text: `Dirt path added at (${x}, ${y}).` }] };
        } else {
          world.removePath(x, y);
          return { content: [{ type: "text", text: `Dirt path removed at (${x}, ${y}).` }] };
        }
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );
}

export function registerTileTools(server: McpServer): void {
  registerTileQueryTools(server);
  registerTileEditTools(server);
}
