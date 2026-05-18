#!/usr/bin/env node
/**
 * Daemon entry point. Spawned as a detached background process by `islander start`.
 * Usage: node dist/daemon/runner.js <islanderId>
 */
import { getConfig } from "../lib/config.js";
import { updateStatus } from "../lib/db.js";
import { runAgentLoop } from "./agent-loop.js";

const islanderId = process.argv[2];
if (!islanderId) {
  process.stderr.write("Usage: runner.js <islanderId>\n");
  process.exit(1);
}

const config = getConfig();
if (!config.islanders[islanderId]) {
  process.stderr.write(`Islander "${islanderId}" not found in config\n`);
  process.exit(1);
}

updateStatus(islanderId, "running", process.pid);
process.stderr.write(`[islander/${islanderId}] Daemon started (pid=${process.pid})\n`);

runAgentLoop(islanderId, config).catch((err: unknown) => {
  process.stderr.write(`[islander/${islanderId}] Fatal error: ${String(err)}\n`);
  updateStatus(islanderId, "error");
  process.exit(1);
});
