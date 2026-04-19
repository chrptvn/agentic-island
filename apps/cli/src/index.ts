#!/usr/bin/env node
import { Command } from "commander";
import { registerContextCommand } from "./commands/context.js";
import { registerIslandStatusCommand } from "./commands/island/status.js";
import { registerIslandMapCommand } from "./commands/island/map.js";
import { registerIslandCharactersCommand } from "./commands/island/characters.js";
import { registerEntitiesCommand } from "./commands/entities.js";

const program = new Command();

program
  .name("islandctl")
  .description("Agentic Island CLI")
  .version("0.1.0");

registerContextCommand(program);
registerIslandStatusCommand(program);
registerIslandMapCommand(program);
registerIslandCharactersCommand(program);
registerEntitiesCommand(program);

program.parse(process.argv);
