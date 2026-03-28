import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import pc from "picocolors";

interface RegenerateKeyResponse {
  accessKey: string;
  message: string;
}

interface ErrorResponse {
  error: string;
}

/**
 * Parse a .env file into a key-value object
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function registerGetKeyCommand(program: Command): void {
  program
    .command("get-key")
    .description("Regenerate the MCP access key for a secured island")
    .option("-d, --dir <path>", "Island directory containing .env file", ".")
    .option("--env-file <path>", "Path to .env file (overrides --dir)")
    .action(async (opts: { dir: string; envFile?: string }) => {
      // Find .env file
      const envPath = opts.envFile
        ? resolve(opts.envFile)
        : resolve(opts.dir, ".env");

      if (!existsSync(envPath)) {
        console.error(pc.red(`Error: .env file not found at ${envPath}`));
        console.error(pc.dim("Make sure you're in the island directory or use --dir/--env-file"));
        process.exit(1);
      }

      // Parse .env file
      const env = parseEnvFile(envPath);
      const apiKey = env.API_KEY;
      const hubUrl = env.HUB_URL ?? "ws://localhost:3001/ws/island";
      const islandName = env.ISLAND_NAME ?? "My Island";

      if (!apiKey) {
        console.error(pc.red("Error: API_KEY not found in .env file"));
        console.error(pc.dim("Run `pnpm run publish:island` first to get a passport"));
        process.exit(1);
      }

      // Derive hub API URL from WebSocket URL
      const apiBaseUrl = hubUrl
        .replace(/^wss?:\/\//, (m) => m.startsWith("wss") ? "https://" : "http://")
        .replace("/ws/island", "");

      // We need the island ID. Fetch it from the hub API
      console.log(pc.dim("Connecting to hub to find your island..."));

      try {
        // List islands to find ours (we'll match by name for now)
        const listRes = await fetch(`${apiBaseUrl}/api/islands`);
        if (!listRes.ok) {
          throw new Error(`Failed to list islands: ${listRes.statusText}`);
        }

        const { islands } = await listRes.json() as { islands: { id: string; name: string; secured: boolean }[] };
        
        // We need to identify our island. Since we have the passport (API_KEY),
        // we'll need to try the regenerate endpoint for each secured island
        // and see which one our passport works for.
        
        // For now, prompt the user to provide the island ID or find it by name
        const matchingIslands = islands.filter(i => i.name === islandName);
        
        if (matchingIslands.length === 0) {
          console.error(pc.red(`Error: No online island found with name "${islandName}"`));
          console.error(pc.dim("Make sure your island is running and connected to the hub"));
          process.exit(1);
        }

        if (matchingIslands.length > 1) {
          console.log(pc.yellow(`Multiple islands found with name "${islandName}":`));
          matchingIslands.forEach((i) => {
            console.log(`  - ${i.id} ${i.secured ? "🔒" : "🔓"}`);
          });
          console.log(pc.dim("\nTrying each one with your passport..."));
        }

        // Try regenerating key for each matching island
        let success = false;
        for (const island of matchingIslands) {
          if (!island.secured) {
            console.log(pc.yellow(`Island ${island.id} is not secured — no access key needed`));
            continue;
          }

          const res = await fetch(`${apiBaseUrl}/api/islands/${island.id}/regenerate-key`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          });

          if (res.ok) {
            const data = await res.json() as RegenerateKeyResponse;
            
            console.log();
            console.log(pc.green("✓ Access key regenerated successfully!"));
            console.log();
            console.log("  ════════════════════════════════════════════════════════");
            console.log("  🔒 Here's your new MCP configuration:");
            console.log();
            console.log("  {");
            console.log(`    "mcpServers": {`);
            console.log(`      "${islandName}": {`);
            console.log(`        "url": "${apiBaseUrl}/islands/${island.id}/mcp",`);
            console.log(`        "headers": {`);
            console.log(`          "Authorization": "Bearer ${data.accessKey}"`);
            console.log(`        }`);
            console.log(`      }`);
            console.log(`    }`);
            console.log("  }");
            console.log();
            console.log(pc.yellow("  ⚠️  The previous access key is now invalid!"));
            console.log("  ════════════════════════════════════════════════════════");
            console.log();
            
            success = true;
            break;
          }

          // Check if it's an auth error (wrong passport) vs other error
          if (res.status === 404) {
            // Not our island, try next
            continue;
          }

          const err = await res.json() as ErrorResponse;
          console.error(pc.red(`Error: ${err.error}`));
        }

        if (!success) {
          console.error(pc.red("Error: Could not regenerate key — check your passport or island status"));
          process.exit(1);
        }

      } catch (error) {
        console.error(pc.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
}
