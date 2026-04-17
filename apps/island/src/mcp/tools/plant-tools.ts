import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpSession } from "../mcp-server.js";
import { requireCharacter } from "./character-tools.js";

const BASE_URL = `http://localhost:${process.env.ISLAND_PORT ?? 3002}`;

export function registerPlantTools(server: McpServer, session: McpSession): void {
  server.tool(
    "plant_seed",
    "Plant a seed at the character's current position. Consumes 1 seed from inventory and places a sprout that grows over time into a tree, bush, flower patch, cotton patch, or moon blossom depending on the seed. Character must be standing on an empty grass cell.",
    {
      seed_item: z.enum(["acorns", "berries", "cotton_seed", "flower_pink_seed", "flower_blue_seed", "flower_red_seed", "sky_blossom_seed", "flower_white_seed", "flower_yellow_seed", "moon_fragment"]).describe("The seed to plant: 'acorns' grows an oak tree, 'berries' grows a berry bush, 'cotton_seed' grows a cotton patch, flower seeds grow their matching flower patch, and 'moon_fragment' grows a moon blossom (the only way to grow one)"),
    },
    async ({ seed_item }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
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
