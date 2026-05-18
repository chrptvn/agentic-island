import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { rmSync, existsSync } from "fs";
import { getConfig, saveConfig, soulDir } from "../lib/config.js";
import { clearIslanderRows, getIslanderRow } from "../lib/db.js";

export function registerRemoveCommand(program: Command): void {
  program
    .command("remove <id>")
    .description("Remove an islander agent")
    .action(async (id: string) => {
      const config = getConfig();

      if (!config.islanders[id]) {
        console.error(pc.red(`Islander "${id}" not found.`));
        process.exit(1);
      }

      const row = getIslanderRow(id);
      if (row?.status === "running") {
        console.error(pc.red(`Islander "${id}" is currently running. Stop it first with: islander stop ${id}`));
        process.exit(1);
      }

      const confirmed = await p.confirm({
        message: `Remove islander "${id}"? This will delete the soul file and all logs.`,
      });
      if (!confirmed || p.isCancel(confirmed)) {
        p.cancel("Aborted.");
        process.exit(0);
      }

      delete config.islanders[id];
      saveConfig(config);

      const dir = soulDir(id);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });

      clearIslanderRows(id);

      console.log(pc.green(`Islander "${id}" removed.`));
    });
}
