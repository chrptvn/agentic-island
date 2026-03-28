import { Command } from "commander";
import { resolveIslandConfig, islandRequest } from "../../lib/island-api.js";
import { printTable, printSuccess } from "../../lib/output.js";
import pc from "picocolors";

interface CharacterStats {
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  energy: number;
  maxEnergy: number;
}

interface CharacterEntry {
  x: number;
  y: number;
  action: string | null;
  pathLength: number;
  stats: CharacterStats;
}

export function registerIslandCharactersCommand(program: Command): void {
  const chars = program.command("characters").alias("chars").description("Manage characters");

  chars
    .command("list")
    .description("List all characters currently on the map")
    .option("--island-url <url>", "Island URL")
    .action((opts) => {
      const config = resolveIslandConfig(opts);
      islandRequest<Record<string, CharacterEntry>>(config, "GET", "/api/characters").then(
        (characters) => {
          const entries = Object.entries(characters);
          if (entries.length === 0) {
            console.log(pc.dim("No characters on the map."));
            return;
          }
          const rows = entries.map(([id, c]) => ({
            id,
            pos: `(${c.x}, ${c.y})`,
            hp: `${c.stats.health}/${c.stats.maxHealth}`,
            hunger: `${Math.round(c.stats.hunger)}/${c.stats.maxHunger}`,
            energy: `${Math.round(c.stats.energy)}/${c.stats.maxEnergy}`,
            action: c.action ?? pc.dim("idle"),
          }));
          printTable(rows, ["id", "pos", "hp", "hunger", "energy", "action"]);
        },
      );
    });

  chars
    .command("spawn <id>")
    .description("Spawn a character at a random valid position")
    .option("--x <n>", "X coordinate", parseInt)
    .option("--y <n>", "Y coordinate", parseInt)
    .option("--island-url <url>", "Island URL")
    .action((id, opts) => {
      const config = resolveIslandConfig(opts);
      const hasCoords = opts.x !== undefined && opts.y !== undefined;
      const path = hasCoords ? "/api/spawn" : "/api/spawn_random";
      const body = hasCoords ? { id, x: opts.x, y: opts.y } : { id };

      islandRequest<{ message: string }>(config, "POST", path, body).then((res) => {
        printSuccess(res.message);
      });
    });

  chars
    .command("despawn <id>")
    .description("Remove a character from the map")
    .option("--island-url <url>", "Island URL")
    .action((id, opts) => {
      const config = resolveIslandConfig(opts);
      islandRequest<{ message: string }>(config, "POST", "/api/despawn", { id }).then((res) => {
        printSuccess(res.message);
      });
    });
}
