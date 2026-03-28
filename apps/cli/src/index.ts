#!/usr/bin/env node
import { Command } from "commander";
import { registerContextCommand } from "./commands/context.js";
import { registerIslandCommand } from "./commands/island/index.js";

const program = new Command();

program
  .name("islandctl")
  .description("Agentic Island CLI")
  .version("0.1.0");

registerContextCommand(program);
registerIslandCommand(program);

program.parse(process.argv);
