import { Command } from "commander";
import * as p from "@clack/prompts";
import { resolveIslandConfig, islandRequest } from "../../lib/island-api.js";
import { printSuccess } from "../../lib/output.js";
import pc from "picocolors";

interface MapResult {
  message: string;
  size: string;
  seed: number;
  width: number;
  height: number;
}

interface CharactersResult {
  [id: string]: { x: number; y: number };
}

const SIZE_PRESETS = {
  very_small: { width: 120, height: 80  },
  small:      { width: 160, height: 110 },
  medium:     { width: 210, height: 140 },
  large:      { width: 280, height: 190 },
  very_large: { width: 400, height: 270 },
} as const;

type SizePreset = keyof typeof SIZE_PRESETS;

const SIZE_CHOICES = Object.entries(SIZE_PRESETS).map(([name, dims]) => ({
  value: name as SizePreset,
  label: `${name.replace("_", " ")}`,
  hint: `${dims.width}×${dims.height}`,
}));

function hasExplicitMapOpts(opts: Record<string, unknown>): boolean {
  return opts.size !== undefined || opts.seed !== undefined;
}

export function registerIslandMapCommand(program: Command): void {
  const map = program.command("map").description("Manage the world map");

  map
    .command("regenerate")
    .description("Wipe all characters and regenerate the map")
    .option(
      "--size <preset>",
      `Map size preset: very_small (120×80) | small (160×110) | medium (210×140) | large (280×190) | very_large (400×270) (default: medium)`,
    )
    .option("--seed <n>", "RNG seed for deterministic generation; omit for a random seed", parseInt)
    .option("--island-url <url>", "Override the target world URL (e.g. http://localhost:3002)")
    .addHelpText(
      "after",
      `
Examples:
  $ islandctl map regenerate
  $ islandctl map regenerate --size large
  $ islandctl map regenerate --size medium --seed 42`,
    )
    .action(async (opts) => {
      if (!hasExplicitMapOpts(opts)) {
        p.intro(pc.bold("Regenerate map"));

        const answers = await p.group(
          {
            size: () =>
              p.select<SizePreset>({
                message: "Map size",
                initialValue: "medium",
                options: SIZE_CHOICES,
              }),
            seed: () =>
              p.text({
                message: "RNG seed for deterministic generation",
                placeholder: "leave blank for random",
              }),
          },
          {
            onCancel: () => {
              p.cancel("Cancelled.");
              process.exit(0);
            },
          },
        );

        opts.size = answers.size;
        if (answers.seed) opts.seed = parseInt(answers.seed, 10);
      }

      // Validate size preset
      const sizeName = (opts.size ?? "medium") as string;
      if (!(sizeName in SIZE_PRESETS)) {
        console.error(
          pc.red(
            `Invalid --size "${sizeName}". Valid options: ${Object.keys(SIZE_PRESETS).join(", ")}`,
          ),
        );
        process.exit(1);
      }

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

      const body: Record<string, unknown> = { size: sizeName };
      if (opts.seed) body.seed = opts.seed;

      const res = await islandRequest<MapResult>(config, "POST", "/api/regenerate", body);
      printSuccess(res.message);
      console.log(`  Seed:  ${pc.cyan(String(res.seed))}`);
      console.log(`  Size:  ${pc.cyan(`${res.width}×${res.height}`)}  ${pc.dim(`(${res.size ?? sizeName})`)}`);
    });
}

