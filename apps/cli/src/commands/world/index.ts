import { Command } from "commander";
import { registerWorldMapCommand } from "./map.js";
import { registerWorldCharactersCommand } from "./characters.js";
import { registerWorldStatusCommand } from "./status.js";

export function registerWorldCommand(program: Command): void {
  const world = program
    .command("world")
    .description("Manage the game world (world server)");

  registerWorldStatusCommand(world);
  registerWorldMapCommand(world);
  registerWorldCharactersCommand(world);
}
