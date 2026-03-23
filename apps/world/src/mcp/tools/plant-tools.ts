import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const BASE_URL = `http://localhost:${process.env.WORLD_PORT ?? 3002}`;

export function registerPlantTools(server: McpServer): void {
  server.tool(
    "plant_seed",
    "Plant a seed at the character's current position. Consumes 1 seed from inventory and places a sprout that grows into a full tree over time (2 min → bigger sprout, then 5 min → mature tree). Character must be standing on an empty grass cell.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      seed_item: z.enum(["acorns", "berries"]).describe("The seed to plant: 'acorns' grows an oak tree, 'berries' grows a berry tree"),
    },
    async ({ character_id, seed_item }) => {
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
