#!/usr/bin/env node
import { Command } from "commander";
import { registerKeysCommand } from "./commands/keys.js";
import { registerWorldsCommand } from "./commands/worlds.js";

const program = new Command();

program
  .name("island-cli")
  .description("Agentic Island admin CLI")
  .version("0.1.0");

registerKeysCommand(program);
registerWorldsCommand(program);

program.parse(process.argv);
