import { Command } from "commander";
import pc from "picocolors";
import { getConfig } from "../lib/config.js";
import { getIslanderRow, updateStatus } from "../lib/db.js";

function stopOne(id: string): void {
  const row = getIslanderRow(id);
  if (!row || row.status !== "running" || !row.pid) {
    console.log(pc.yellow(`Islander "${id}" is not running.`));
    return;
  }

  try {
    process.kill(row.pid, "SIGTERM");
    updateStatus(id, "stopped", null);
    console.log(pc.green(`Stopped islander "${id}" (pid ${row.pid})`));
  } catch (err) {
    console.error(pc.red(`Failed to stop "${id}": ${String(err)}`));
    updateStatus(id, "stopped", null);
  }
}

export function registerStopCommand(program: Command): void {
  program
    .command("stop [id]")
    .description("Stop one or all islander daemons")
    .action((id?: string) => {
      const config = getConfig();
      const ids = id ? [id] : Object.keys(config.islanders);

      if (ids.length === 0) {
        console.log(pc.dim("No islanders configured."));
        return;
      }

      for (const i of ids) {
        if (!config.islanders[i]) {
          console.error(pc.red(`Islander "${i}" not found.`));
          continue;
        }
        stopOne(i);
      }
    });
}
