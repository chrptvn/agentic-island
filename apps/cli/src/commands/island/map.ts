import { Command } from "commander";
import { resolveIslandConfig, islandRequest } from "../../lib/island-api.js";
import { printSuccess } from "../../lib/output.js";
import pc from "picocolors";

interface MapResult {
  message: string;
  seed: number;
  width: number;
  height: number;
}

interface CharactersResult {
  [id: string]: { x: number; y: number };
}

export function registerIslandMapCommand(program: Command): void {
  const map = program.command("map").description("Manage the world map");

  map
    .command("regenerate")
    .description("Wipe all characters and regenerate the map")
    .option("--width <n>", "Map width in tiles (default: 30)", parseInt)
    .option("--height <n>", "Map height in tiles (default: 20)", parseInt)
    .option("--seed <n>", "RNG seed for deterministic generation (random if omitted)", parseInt)
    .option("--fill-probability <n>", "Initial cave-fill probability 0–1 (default: 0.45)", parseFloat)
    .option("--iterations <n>", "Cellular automata smoothing passes 1–20 (default: 5)", parseInt)
    .option("--island-url <url>", "Override the target world URL")
    .action(async (opts) => {
      const config = resolveIslandConfig(opts);

      // Despawn all characters first
      const chars = await islandRequest<CharactersResult>(config, "GET", "/api/characters");
      const ids = Object.keys(chars);
      if (ids.length > 0) {
        await Promise.all(
          ids.map((id) => islandRequest(config, "POST", "/api/despawn", { id })),
        );
        console.log(pc.dim(`Despawned ${ids.length} character(s): ${ids.join(", ")}`));
      }

      const body: Record<string, unknown> = {};
      if (opts.width) body.width = opts.width;
      if (opts.height) body.height = opts.height;
      if (opts.seed) body.seed = opts.seed;
      if (opts.fillProbability) body.fillProbability = opts.fillProbability;
      if (opts.iterations) body.iterations = opts.iterations;

      const res = await islandRequest<MapResult>(config, "POST", "/api/regenerate", body);
      printSuccess(res.message);
      console.log(`  Seed:  ${pc.cyan(String(res.seed))}`);
      console.log(`  Size:  ${pc.cyan(`${res.width}×${res.height}`)}`);
    });
}
