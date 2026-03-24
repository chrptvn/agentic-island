import type { Command } from "commander";
import pc from "picocolors";
import { getConfig, saveConfig, CONFIG_FILE } from "../lib/config.js";

export function registerContextCommand(program: Command): void {
  const ctx = program
    .command("context")
    .alias("ctx")
    .description("Manage world contexts (like kubectl config)");

  ctx
    .command("list")
    .description("List all contexts")
    .action(() => {
      const config = getConfig();
      const names = Object.keys(config.contexts);
      if (names.length === 0) {
        console.log("No contexts configured.");
        return;
      }
      for (const name of names) {
        const entry = config.contexts[name]!;
        const current = name === config.currentContext;
        const marker = current ? pc.green("* ") : "  ";
        const label = current ? pc.bold(name) : name;
        const display = entry.name ? ` (${entry.name})` : "";
        console.log(`${marker}${label}${display}  ${pc.dim(entry.url)}`);
      }
    });

  ctx
    .command("current")
    .description("Show the active context")
    .action(() => {
      const config = getConfig();
      const entry = config.contexts[config.currentContext];
      if (!entry) {
        console.error(pc.red(`No active context set.`));
        process.exit(1);
      }
      const display = entry.name ? ` (${entry.name})` : "";
      console.log(`${pc.green(config.currentContext)}${display}  ${pc.dim(entry.url)}`);
    });

  ctx
    .command("use <name>")
    .description("Switch to a context")
    .action((name: string) => {
      const config = getConfig();
      if (!config.contexts[name]) {
        console.error(pc.red(`Context "${name}" not found. Run 'islandctl context list' to see available contexts.`));
        process.exit(1);
      }
      config.currentContext = name;
      saveConfig(config);
      const entry = config.contexts[name]!;
      console.log(`Switched to context ${pc.green(pc.bold(name))}  ${pc.dim(entry.url)}`);
    });

  ctx
    .command("add <name> <url>")
    .description("Add or update a context")
    .option("-n, --display-name <displayName>", "Human-readable name for the context")
    .action((name: string, url: string, opts: { displayName?: string }) => {
      const config = getConfig();
      const existed = !!config.contexts[name];
      config.contexts[name] = { url: url.replace(/\/$/, ""), ...(opts.displayName ? { name: opts.displayName } : {}) };
      saveConfig(config);
      const verb = existed ? "Updated" : "Added";
      console.log(`${verb} context ${pc.green(pc.bold(name))}  ${pc.dim(url)}`);
    });

  ctx
    .command("remove <name>")
    .alias("rm")
    .description("Remove a context")
    .action((name: string) => {
      const config = getConfig();
      if (!config.contexts[name]) {
        console.error(pc.red(`Context "${name}" not found.`));
        process.exit(1);
      }
      delete config.contexts[name];
      if (config.currentContext === name) {
        const remaining = Object.keys(config.contexts)[0];
        config.currentContext = remaining ?? "";
        if (remaining) {
          console.log(pc.yellow(`Active context removed. Switched to "${remaining}".`));
        } else {
          console.log(pc.yellow(`Active context removed. No contexts remaining.`));
        }
      }
      saveConfig(config);
      console.log(`Removed context ${pc.bold(name)}`);
    });

  ctx
    .command("config-path")
    .description("Show the path to the config file")
    .action(() => {
      console.log(CONFIG_FILE);
    });
}
