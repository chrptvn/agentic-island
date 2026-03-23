import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SEARCH_TARGET_MAP } from "../../world/entity-registry.js";
import { TILES } from "../../world/tile-registry.js";

export function registerFilterTools(server: McpServer): void {
  server.tool(
    "list_target_filters",
    "Returns all valid token values for the move_to target_filter parameter, grouped by type. Use this to discover what you can search for before calling send_command.",
    {},
    async () => {
      const groups = [...SEARCH_TARGET_MAP.entries()].map(([token, tileIds]) => ({
        token,
        description: `Search group — finds the nearest entity in this group`,
        matchesTileIds: [...tileIds],
      }));

      const entityTileIds = TILES
        .filter((t) => t.layer === 2)
        .map((t) => ({
          token: t.id,
          description: t.description,
          category: t.category,
        }));

      const categorySet = new Set(TILES.map((t) => t.category));
      const categories = [...categorySet].map((cat) => ({
        token: cat,
        description: `Tile category — matches any entity tile with category "${cat}"`,
        tileCount: TILES.filter((t) => t.category === cat && t.layer === 2).length,
      }));

      const terrainTypes = [
        { token: "grass", description: "Grass terrain (walkable)" },
        { token: "water", description: "Water terrain (not walkable but reachable as target)" },
      ];

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ groups, entityTileIds, categories, terrainTypes }, null, 2),
        }],
      };
    }
  );
}
