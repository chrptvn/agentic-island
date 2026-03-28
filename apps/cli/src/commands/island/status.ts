import { Command } from "commander";
import { resolveIslandConfig, islandRequest } from "../../lib/island-api.js";
import { printTable } from "../../lib/output.js";
import pc from "picocolors";

interface WorldStatus {
  worldName: string;
  map: { width: number; height: number; seed: number };
  characterCount: number;
  characters: { id: string; x: number; y: number; action: string | null }[];
}

export function registerIslandStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show current world status (map info, characters)")
    .option("--island-url <url>", "Island URL")
    .action((opts) => {
      const config = resolveIslandConfig(opts);
      islandRequest<WorldStatus>(config, "GET", "/api/status").then((s) => {
        console.log(`${pc.bold("World:")}  ${pc.cyan(s.worldName)}`);
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
