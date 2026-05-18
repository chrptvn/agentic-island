import { Command } from "commander";
import pc from "picocolors";
import { getConfig } from "../lib/config.js";
import { getAllIslanderRows, getIslanderRow } from "../lib/db.js";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List all configured islanders and their status")
    .action(() => {
      const config = getConfig();
      const ids = Object.keys(config.islanders);

      if (ids.length === 0) {
        console.log(pc.dim("No islanders configured. Run: islander add"));
        return;
      }

      const rows = getAllIslanderRows();
      const rowMap = new Map(rows.map((r) => [r.id, r]));

      const COL = { id: 20, hub: 32, status: 10, last: 24 };
      const header =
        pc.bold("ID".padEnd(COL.id)) +
        pc.bold("HUB".padEnd(COL.hub)) +
        pc.bold("STATUS".padEnd(COL.status)) +
        pc.bold("LAST ACTIVITY");
      console.log(header);
      console.log("─".repeat(COL.id + COL.hub + COL.status + COL.last));

      for (const id of ids) {
        const entry = config.islanders[id];
        const row = rowMap.get(id);
        const status = row?.status ?? "stopped";
        const statusColored =
          status === "running"
            ? pc.green(status.padEnd(COL.status))
            : status === "error"
              ? pc.red(status.padEnd(COL.status))
              : pc.dim(status.padEnd(COL.status));
        const last = row?.last_activity ? new Date(row.last_activity).toLocaleString() : pc.dim("never");
        console.log(
          id.padEnd(COL.id) +
            entry.mcpURL.slice(0, COL.hub - 2).padEnd(COL.hub) +
            statusColored +
            last,
        );
      }
    });
}
