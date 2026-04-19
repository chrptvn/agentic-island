import { Command } from "commander";
import { resolveIslandConfig, islandRequest } from "../../lib/island-api.js";
import { printTable } from "../../lib/output.js";
import pc from "picocolors";

interface IslandStatus {
  islandName: string;
  map: { width: number; height: number; seed: number };
  characterCount: number;
  characters: { id: string; x: number; y: number; action: string | null }[];
}

export function registerIslandStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show current world status (map info, characters)")
    .option("--island-url <url>", "Override the target world URL (e.g. http://localhost:3002)")
    .addHelpText(
      "after",
      `
Examples:
  $ islandctl status`,
    )
    .action((opts) => {
      const config = resolveIslandConfig(opts);
      islandRequest<IslandStatus>(config, "GET", "/api/status").then((s) => {
        console.log(`${pc.bold("World:")}  ${pc.cyan(s.islandName)}`);
        console.log(`${pc.bold("Map:")}    ${s.map.width}×${s.map.height}  seed=${pc.dim(String(s.map.seed))}`);
        console.log(`${pc.bold("Chars:")}  ${s.characterCount}`);
        if (s.characters.length > 0) {
          console.log();
          printTable(
            s.characters.map((c) => ({ ...c, action: c.action ?? pc.dim("idle") })),
            ["id", "x", "y", "action"],
          );
        }
      });
    });
}
