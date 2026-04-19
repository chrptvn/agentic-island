import { Command } from "commander";
import { resolveIslandConfig, islandRequest } from "../lib/island-api.js";
import { printTable } from "../lib/output.js";

interface EntityEntry {
  id: string;
  name: string;
  description: string;
}

export function registerEntitiesCommand(program: Command): void {
  const ents = program.command("entities").alias("ents").description("Browse entity definitions");

  ents
    .command("list")
    .description("List all entity definitions loaded on the island")
    .option("--island-url <url>", "Override the target world URL (e.g. http://localhost:3002)")
    .addHelpText(
      "after",
      `
Examples:
  $ islandctl entities list`,
    )
    .action((opts) => {
      const config = resolveIslandConfig(opts);
      islandRequest<EntityEntry[]>(config, "GET", "/api/entities").then(
        (entities) => {
          if (entities.length === 0) {
            console.log("No entity definitions loaded.");
            return;
          }
          printTable(entities, ["id", "name", "description"]);
        },
      );
    });
}
