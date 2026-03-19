import { Command } from "commander";
import { registerCoreMapCommand } from "./map.js";
import { registerCoreCharactersCommand } from "./characters.js";
import { registerCoreStatusCommand } from "./status.js";

export function registerCoreCommand(program: Command): void {
  const core = program
    .command("core")
    .description("Manage the game world (core server)");

  registerCoreStatusCommand(core);
  registerCoreMapCommand(core);
  registerCoreCharactersCommand(core);
}
