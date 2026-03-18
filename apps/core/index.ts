import { startHttpServer } from "./src/server/http.js";
import { World } from "./src/world/world.js";

startHttpServer(parseInt(process.env.GENESIS_PORT ?? "3000", 10));

World.getInstance().watchConfigs();

// Legacy stdio transport, enabled via MCP_TRANSPORT=stdio for backward compatibility.
if (process.env.MCP_TRANSPORT === "stdio") {
  const { startServer } = await import("./src/mcp/server.js");
  startServer().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
