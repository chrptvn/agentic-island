import { Command } from "commander";
import { resolveCoreConfig, coreRequest } from "../../lib/core-api.js";
import { printSuccess } from "../../lib/output.js";
import pc from "picocolors";

interface MapResult {
  message: string;
  seed: number;
  width: number;
  height: number;
  character?: { id: string; x: number; y: number };
}

export function registerCoreMapCommand(program: Command): void {
  const map = program.command("map").description("Manage the world map");

  map
    .command("regenerate")
    .description("Regenerate the map (wipes all entities and characters)")
    .option("--width <n>", "Map width in tiles", parseInt)
    .option("--height <n>", "Map height in tiles", parseInt)
    .option("--seed <n>", "RNG seed for deterministic generation", parseInt)
    .option("--fill-probability <n>", "Initial fill probability 0–1", parseFloat)
    .option("--iterations <n>", "Cellular automata passes", parseInt)
    .option("--core-url <url>", "Core URL")
    .action((opts) => {
      const config = resolveCoreConfig(opts);
      const body: Record<string, unknown> = {};
      if (opts.width) body.width = opts.width;
      if (opts.height) body.height = opts.height;
      if (opts.seed) body.seed = opts.seed;
      if (opts.fillProbability) body.fillProbability = opts.fillProbability;
      if (opts.iterations) body.iterations = opts.iterations;

      coreRequest<MapResult>(config, "POST", "/api/regenerate", body).then((res) => {
        printSuccess(res.message);
        console.log(`  Seed:  ${pc.cyan(String(res.seed))}`);
        console.log(`  Size:  ${pc.cyan(`${res.width}×${res.height}`)}`);
      });
    });

  map
    .command("reset")
    .description("Regenerate the map and respawn a character")
    .option("--character <id>", "Character ID to respawn", "hero")
    .option("--width <n>", "Map width in tiles", parseInt)
    .option("--height <n>", "Map height in tiles", parseInt)
    .option("--core-url <url>", "Core URL")
    .action((opts) => {
      const config = resolveCoreConfig(opts);
      const body: Record<string, unknown> = { characterId: opts.character };
      if (opts.width) body.width = opts.width;
      if (opts.height) body.height = opts.height;

      coreRequest<MapResult>(config, "POST", "/api/reset", body).then((res) => {
        printSuccess(res.message);
        console.log(`  Seed:  ${pc.cyan(String(res.seed))}`);
        console.log(`  Size:  ${pc.cyan(`${res.width}×${res.height}`)}`);
        if (res.character) {
          console.log(`  Char:  ${pc.cyan(res.character.id)} at (${res.character.x}, ${res.character.y})`);
        }
      });
    });
}
