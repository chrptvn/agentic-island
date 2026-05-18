import { Command } from "commander";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pc from "picocolors";
import { getConfig } from "../lib/config.js";
import { updateStatus, getIslanderRow } from "../lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(__dirname, "..", "daemon", "runner.js");

function startOne(id: string): void {
  const row = getIslanderRow(id);
  if (row?.status === "running" && row.pid) {
    try {
      process.kill(row.pid, 0); // check if still alive
      console.log(pc.yellow(`Islander "${id}" is already running (pid ${row.pid}). Use: islander stop ${id}`));
      return;
    } catch {
      // Process not running, proceed to start
    }
  }

  const child = spawn(process.execPath, [RUNNER, id], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const pid = child.pid!;
  updateStatus(id, "running", pid);
  console.log(pc.green(`Started islander "${id}" (pid ${pid})`));
}

export function registerStartCommand(program: Command): void {
  program
    .command("start [id]")
    .description("Start one or all islander daemons")
    .action((id?: string) => {
      const config = getConfig();
      const ids = id ? [id] : Object.keys(config.islanders);

      if (ids.length === 0) {
        console.log(pc.dim("No islanders configured. Run: islander add"));
        return;
      }

      for (const i of ids) {
        if (!config.islanders[i]) {
          console.error(pc.red(`Islander "${i}" not found.`));
          continue;
        }
        startOne(i);
      }
    });
}
