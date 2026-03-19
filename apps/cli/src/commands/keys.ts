import { Command } from "commander";
import { resolveConfig, apiRequest } from "../lib/api.js";
import { printTable, printSuccess } from "../lib/output.js";

interface ApiKey {
  id: string;
  label: string | null;
  created_at: string;
  last_seen_at: string | null;
}

interface CreateKeyResponse {
  id: string;
  key: string;
  label: string | null;
  createdAt: string;
}

export function registerKeysCommand(program: Command): void {
  const keys = program.command("keys").description("Manage API keys");

  keys
    .command("list")
    .description("List all API keys")
    .option("--hub-url <url>", "Hub API URL")
    .option("--admin-key <key>", "Admin key")
    .action((opts) => {
      const config = resolveConfig(opts);
      apiRequest<{ keys: ApiKey[] }>(config, "GET", "/api/admin/keys").then(({ keys }) => {
        printTable(keys, ["id", "label", "created_at", "last_seen_at"]);
      });
    });

  keys
    .command("create")
    .description("Create a new API key")
    .option("-l, --label <label>", "Label for the key")
    .option("--hub-url <url>", "Hub API URL")
    .option("--admin-key <key>", "Admin key")
    .action((opts) => {
      const config = resolveConfig(opts);
      apiRequest<CreateKeyResponse>(config, "POST", "/api/admin/keys", {
        label: opts.label,
      }).then((res) => {
        printSuccess(`Key created`);
        console.log(`  ID:    ${res.id}`);
        console.log(`  Key:   ${res.key}`);
        console.log(`  Label: ${res.label ?? "(none)"}`);
      });
    });

  keys
    .command("revoke <id>")
    .description("Revoke an API key by ID")
    .option("--hub-url <url>", "Hub API URL")
    .option("--admin-key <key>", "Admin key")
    .action((id, opts) => {
      const config = resolveConfig(opts);
      apiRequest(config, "DELETE", `/api/admin/keys/${id}`).then(() => {
        printSuccess(`Key ${id} revoked`);
      });
    });
}
