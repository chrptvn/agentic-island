import { Command } from "commander";
import { resolveConfig, apiRequest } from "../lib/api.js";
import { printTable, printSuccess, printJson } from "../lib/output.js";

interface World {
  id: string;
  name: string;
  description: string | null;
  status: string;
  player_count: number;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

export function registerWorldsCommand(program: Command): void {
  const worlds = program.command("worlds").description("Manage worlds");

  worlds
    .command("list")
    .description("List all worlds")
    .option("--hub-url <url>", "Hub API URL")
    .option("--admin-key <key>", "Admin key")
    .action((opts) => {
      const config = resolveConfig(opts);
      apiRequest<{ worlds: World[] }>(config, "GET", "/api/admin/worlds").then(
        ({ worlds }) => {
          printTable(worlds, ["id", "name", "status", "player_count", "last_heartbeat_at"]);
        },
      );
    });

  worlds
    .command("get <id>")
    .description("Inspect a world")
    .option("--hub-url <url>", "Hub API URL")
    .option("--admin-key <key>", "Admin key")
    .action((id, opts) => {
      const config = resolveConfig(opts);
      apiRequest<World>(config, "GET", `/api/admin/worlds/${id}`).then((world) => {
        printJson(world);
      });
    });

  worlds
    .command("delete <id>")
    .description("Delete a world")
    .option("--hub-url <url>", "Hub API URL")
    .option("--admin-key <key>", "Admin key")
    .action((id, opts) => {
      const config = resolveConfig(opts);
      apiRequest(config, "DELETE", `/api/admin/worlds/${id}`).then(() => {
        printSuccess(`World ${id} deleted`);
      });
    });
}
