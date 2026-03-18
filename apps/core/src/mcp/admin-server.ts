import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerMapReadTools, registerMapAdminTools } from "./tools/map-tools.js";
import { registerTileQueryTools, registerTileEditTools, registerSpawnableTilesTools, registerPathTools } from "./tools/tile-tools.js";
import { registerAdminCharacterTools, registerSpawnPositionsTools, registerFeedEntityTools } from "./tools/character-tools.js";
import { registerFilterTools } from "./tools/filter-tools.js";

export interface AdminServerHandle {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

export function makeAdminServer(): AdminServerHandle {
  const server = new McpServer({ name: "genesis-admin", version: "1.0.0" });

  registerMapReadTools(server);
  registerMapAdminTools(server);
  registerTileQueryTools(server);
  registerTileEditTools(server);
  registerSpawnableTilesTools(server);
  registerAdminCharacterTools(server);
  registerSpawnPositionsTools(server);
  registerFeedEntityTools(server);
  registerFilterTools(server);
  registerPathTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  server.connect(transport);

  return { server, transport };
}
