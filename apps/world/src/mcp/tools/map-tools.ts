import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { World } from "../../world/world.js";

const WORLD_PORT = parseInt(process.env.WORLD_PORT ?? "3002", 10);

async function postApi(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`http://localhost:${WORLD_PORT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function registerMapReadTools(server: McpServer): void {
  const world = World.getInstance();

  server.tool(
    "get_map",
    "Returns the full map as a 2D grid of tile IDs (e.g. 'grass', 'stone', 'water'). Use list_tiles to see all possible tile IDs.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(world.toJSON(), null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_tile",
    "Returns information about the tile at position (x, y).",
    {
      x: z.number().int().describe("X coordinate"),
      y: z.number().int().describe("Y coordinate"),
    },
    async ({ x, y }) => {
      const tile = world.map.getTile(x, y);
      if (!tile) {
        return {
          content: [
            {
              type: "text",
              text: `No tile at (${x}, ${y}). Map is ${world.map.width}x${world.map.height}.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tile),
          },
        ],
      };
    }
  );
}

export function registerMapAdminTools(server: McpServer): void {

  server.tool(
    "regenerate_map",
    "Regenerates the world map with optional new parameters.",
    {
      width: z.number().int().min(10).max(500).optional().describe("Map width (default: 80)"),
      height: z.number().int().min(10).max(500).optional().describe("Map height (default: 40)"),
      seed: z.number().int().optional().describe("RNG seed for deterministic generation"),
      fillProbability: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Initial fill probability 0–1 (default: 0.45)"),
      iterations: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of cellular automata passes (default: 5)"),
    },
    async (options) => {
      const result = await postApi("/api/regenerate", options) as { message: string; seed: number; width: number; height: number };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}

export function registerMapTools(server: McpServer): void {
  registerMapReadTools(server);
  registerMapAdminTools(server);
}
