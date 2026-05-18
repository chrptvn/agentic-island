import { Command } from "commander";
import pc from "picocolors";
import { getLogs } from "../lib/db.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status <id>")
    .description("Show recent activity logs for an islander")
    .option("-n, --lines <n>", "Number of log lines to show", "30")
    .action((id: string, opts: { lines: string }) => {
      const limit = parseInt(opts.lines, 10) || 30;
      const logs = getLogs(id, limit).reverse();

      if (logs.length === 0) {
        console.log(pc.dim(`No logs for "${id}" yet.`));
        return;
      }

      console.log(pc.bold(`\nLast ${logs.length} log entries for "${id}":\n`));
      for (const entry of logs) {
        const time = new Date(entry.ts).toLocaleTimeString();
        const roleColor =
          entry.role === "tool_call"   ? pc.cyan :
          entry.role === "tool_result" ? pc.green :
          entry.role === "assistant"   ? pc.yellow :
          entry.role === "error"       ? pc.red :
          pc.dim;
        const snippet = entry.content.length > 200 ? entry.content.slice(0, 200) + "…" : entry.content;
        console.log(`${pc.dim(time)} ${roleColor(entry.role.padEnd(12))} ${snippet}`);
      }
    });
}
