import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpSession } from "../mcp-server.js";

const BASE_URL = `http://localhost:${process.env.WORLD_PORT ?? 3002}`;

export function registerPlantTools(server: McpServer, session: McpSession): void {
  server.tool(
    "plant_seed",
    "Plant a seed at the character's current position. Consumes 1 seed from inventory and places a sprout that grows into a full tree over time (2 min → bigger sprout, then 5 min → mature tree). Character must be standing on an empty grass cell.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      seed_item: z.enum(["acorns", "berries", "cotton_seed", "flower_blue_seed", "flower_red_seed", "flower_purple_seed", "flower_white_seed"]).describe("The seed to plant: 'acorns' grows an oak tree, 'berries' grows a berry tree, 'cotton_seed' grows a cotton plant, 'flower_*_seed' grows a flower of that color"),
    },
    async ({ character_id, seed_item }) => {
      if (!session.username) return { content: [{ type: "text", text: "Not connected. Call the 'connect' tool first with your username." }], isError: true };
      try {
        const res = await fetch(`${BASE_URL}/api/plant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: character_id, seed_item }),
        });
        const data = await res.json() as { message?: string; error?: string; planted?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        return {
          content: [{ type: "text", text: data.message ?? `Planted ${data.planted}.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
