#!/usr/bin/env node
import { Command } from "commander";
import { registerConfigureCommand } from "./commands/configure.js";
import { registerAddCommand } from "./commands/add.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerListCommand } from "./commands/list.js";
import { registerStartCommand } from "./commands/start.js";
import { registerStopCommand } from "./commands/stop.js";
import { registerStatusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("islander")
  .description("Run AI agents (islanders) on Agentic Island worlds")
  .version("0.1.0");

registerConfigureCommand(program);
registerAddCommand(program);
registerRemoveCommand(program);
registerListCommand(program);
registerStartCommand(program);
registerStopCommand(program);
registerStatusCommand(program);

program.parse(process.argv);
