import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { getConfig, saveConfig, soulDir, soulPath } from "../lib/config.js";
import { upsertIslander } from "../lib/db.js";

export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("Add a new islander agent")
    .action(async () => {
      const config = getConfig();

      p.intro(pc.cyan("Add Islander"));

      const result = await p.group(
        {
          hubURL: () =>
            p.text({
              message: "MCP endpoint URL",
              placeholder: "https://agenticisland.ai/islands/my-island/mcp",
              validate: (v) => (v.trim() ? undefined : "MCP URL is required"),
            }),
          passport: () =>
            p.text({
              message: "Island passport key (ip_xxxxx)",
              placeholder: "ip_",
              validate: (v) => {
                if (!v.trim()) return "Passport key is required";
                if (!v.trim().startsWith("ip_")) return "Passport key must start with ip_";
              },
            }),
          id: () =>
            p.text({
              message: "Agent ID (short name for this islander)",
              placeholder: "bob",
              validate: (v) => {
                if (!v.trim()) return "Agent ID is required";
                if (!/^[a-z0-9_-]+$/.test(v.trim())) return "Use lowercase letters, numbers, hyphens, underscores";
              },
            }),
          soulFile: () =>
            p.text({
              message: "Path to soul file (SOUL.md)",
              placeholder: "./SOUL.md",
              validate: (v) => {
                if (!v.trim()) return "Soul file path is required";
                if (!existsSync(v.trim())) return `File not found: ${v.trim()}`;
              },
            }),
        },
        { onCancel: () => { p.cancel("Cancelled."); process.exit(0); } },
      );

      const id = result.id.trim();
      if (config.islanders[id]) {
        const overwrite = await p.confirm({ message: `Islander "${id}" already exists. Overwrite?` });
        if (!overwrite || p.isCancel(overwrite)) {
          p.cancel("Aborted.");
          process.exit(0);
        }
      }

      const soulContent = readFileSync(result.soulFile.trim(), "utf-8");
      const dir = soulDir(id);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(soulPath(id), soulContent, "utf-8");

      config.islanders[id] = {
        mcpURL: result.hubURL.trim(),
        passport: result.passport.trim(),
      };
      saveConfig(config);
      upsertIslander(id);

      p.outro(pc.green(`Islander "${id}" added. Soul saved to ${soulPath(id)}`));
    });
}
