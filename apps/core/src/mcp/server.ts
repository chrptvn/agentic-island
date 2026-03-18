import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMapTools } from "./tools/map-tools.js";
import { registerCharacterTools, registerGenericPersonaTools, registerFeedEntityTools, registerSpawnPositionsTools } from "./tools/character-tools.js";
import { registerTileTools, registerSpawnableTilesTools, registerPathTools } from "./tools/tile-tools.js";
import { registerFilterTools } from "./tools/filter-tools.js";
import { registerJournalTools } from "./tools/journal-tools.js";
import { registerSayTools } from "./tools/say-tools.js";
import { registerPlantTools } from "./tools/plant-tools.js";

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: "genesis",
    version: "1.0.0",
  });

  registerMapTools(server);
  registerTileTools(server);
  registerSpawnableTilesTools(server);
  registerCharacterTools(server);
  registerGenericPersonaTools(server);
  registerFeedEntityTools(server);
  registerSpawnPositionsTools(server);
  registerFilterTools(server);
  registerJournalTools(server);
  registerSayTools(server);
  registerPlantTools(server);
  registerPathTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("Genesis MCP server running on stdio\n");
}
