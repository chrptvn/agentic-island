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
    .option("--island-url <url>", "Override the target world URL (e.g. http://localhost:3002)")
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
    .command("spawn")
    .argument("<id>", "Unique character ID to spawn")
    .description("Spawn a character on the map; spawns at a random position unless --x and --y are both given")
    .option("--x <n>", "Tile X coordinate for explicit placement (requires --y)", parseInt)
    .option("--y <n>", "Tile Y coordinate for explicit placement (requires --x)", parseInt)
    .option("--island-url <url>", "Override the target world URL (e.g. http://localhost:3002)")
    .addHelpText(
      "after",
      `
Examples:
  $ islandctl characters spawn bob
  $ islandctl characters spawn bob --x 10 --y 5`,
    )
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
    .command("despawn")
    .argument("<id>", "ID of the character to remove")
    .description("Remove a character from the map")
    .option("--island-url <url>", "Override the target world URL (e.g. http://localhost:3002)")
    .addHelpText(
      "after",
      `
Examples:
  $ islandctl characters despawn bob`,
    )
    .action((id, opts) => {
      const config = resolveIslandConfig(opts);
      islandRequest<{ message: string }>(config, "POST", "/api/despawn", { id }).then((res) => {
        printSuccess(res.message);
      });
    });

  chars
    .command("give")
    .argument("<id>", "Character ID to give items to")
    .argument("<item>", "Item ID (e.g. rocks, stick, fly_agaric)")
    .argument("[qty]", "Quantity to give (default: 1)", parseInt)
    .description("Give an item directly to a character's inventory")
    .option("--island-url <url>", "Override the target world URL (e.g. http://localhost:3002)")
    .addHelpText(
      "after",
      `
Examples:
  $ islandctl characters give bob rocks
  $ islandctl characters give bob rocks 10
  $ islandctl characters give "Afro Cool" moon_fragment 3`,
    )
    .action((id, item, qty, opts) => {
      const config = resolveIslandConfig(opts);
      islandRequest<{ message: string; inventory_entry: { item: string; qty: number } }>(
        config, "POST", "/api/give", { id, item, qty: qty ?? 1 }
      ).then((res) => {
        printSuccess(res.message);
        console.log(`  Stack: ${pc.cyan(String(res.inventory_entry.qty))}× ${res.inventory_entry.item}`);
      });
    });
}
