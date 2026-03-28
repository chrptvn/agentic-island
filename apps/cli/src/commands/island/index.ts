import { Command } from "commander";
import { registerIslandMapCommand } from "./map.js";
import { registerIslandCharactersCommand } from "./characters.js";
import { registerIslandStatusCommand } from "./status.js";
import { getCurrentContext } from "../../lib/config.js";

export function registerIslandCommand(program: Command): void {
  const ctx = getCurrentContext();
  const ctxHint = ctx ? ` [${ctx.name} → ${ctx.entry.url}]` : "";

  const island = program
    .command("island")
    .description(`Manage the game island${ctxHint}`);

  registerIslandStatusCommand(island);
  registerIslandMapCommand(island);
  registerIslandCharactersCommand(island);
}
