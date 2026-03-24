import { Command } from "commander";
import { registerWorldMapCommand } from "./map.js";
import { registerWorldCharactersCommand } from "./characters.js";
import { registerWorldStatusCommand } from "./status.js";
import { getCurrentContext } from "../../lib/config.js";

export function registerWorldCommand(program: Command): void {
  const ctx = getCurrentContext();
  const ctxHint = ctx ? ` [${ctx.name} → ${ctx.entry.url}]` : "";

  const world = program
    .command("world")
    .description(`Manage the game world${ctxHint}`);

  registerWorldStatusCommand(world);
  registerWorldMapCommand(world);
  registerWorldCharactersCommand(world);
}
