#!/usr/bin/env tsx
/**
 * 🏝  Agentic Island — Publish Your World
 *
 * Interactive CLI that collects world metadata and a passport (API key),
 * then boots the world engine with a live connection to the chosen hub.
 *
 * If apps/world/.env is present, any variables already set there are used
 * directly and their prompts are skipped. After collecting any missing values
 * interactively, the user is offered the option to save them back to .env.
 *
 * Usage:  pnpm run publish:world
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "../apps/world/.env");

const HUB_LOCAL = "ws://localhost:3001/ws/world";
const HUB_OFFICIAL = "wss://hub.agenticisland.ai/ws/world";
const PASSPORT_URL = "https://agenticisland.ai";

function mask(value: string): string {
  return value.length <= 8 ? "***" : `${value.slice(0, 8)}…`;
}

/** Update or append key=value pairs in a .env file, preserving all other lines. */
function saveToEnv(updates: Record<string, string>): void {
  let lines: string[] = [];
  try {
    lines = readFileSync(ENV_PATH, "utf8").split("\n");
  } catch {
    // File doesn't exist yet — start fresh
  }

  const written = new Set<string>();

  // Update existing lines
  lines = lines.map((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && match[1] in updates) {
      written.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });

  // Append keys that weren't already in the file
  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  writeFileSync(ENV_PATH, lines.join("\n"), "utf8");
}

async function main(): Promise<void> {
  // Load apps/world/.env if present — populates process.env before prompting
  try {
    process.loadEnvFile(ENV_PATH);
  } catch {
    // File absent or unreadable — proceed without it
  }

  const rl = createInterface({ input: stdin, output: stdout });

  console.log();
  console.log("  🏝  Agentic Island — Publish Your World");
  console.log("  ────────────────────────────────────────");
  console.log();

  try {
    const enteredInteractively: Record<string, string> = {};

    // ── Hub selection ──────────────────────────────────────────
    let hubUrl: string;
    if (process.env.HUB_URL) {
      hubUrl = process.env.HUB_URL;
      console.log(`  ✓ Hub:      ${hubUrl}  (from .env)`);
    } else {
      console.log("  Select a Hub:");
      console.log(`    1. ${HUB_LOCAL}  (Local)`);
      console.log(`    2. ${HUB_OFFICIAL}  (Official Server)`);
      console.log("    3. Custom");
      console.log();

      let hubChoice = "";
      while (!["1", "2", "3"].includes(hubChoice)) {
        hubChoice = (await rl.question("  > ")).trim();
        if (!["1", "2", "3"].includes(hubChoice)) {
          console.log("  ⚠  Please enter 1, 2, or 3.\n");
        }
      }

      if (hubChoice === "1") {
        hubUrl = HUB_LOCAL;
      } else if (hubChoice === "2") {
        hubUrl = HUB_OFFICIAL;
      } else {
        console.log();
        let custom = "";
        while (!custom) {
          custom = (await rl.question("  Hub URL: ")).trim();
          if (!custom) {
            console.log("  ⚠  Hub URL is required.\n");
          } else if (!/^wss?:\/\//.test(custom)) {
            console.log("  ⚠  URL must start with ws:// or wss://\n");
            custom = "";
          }
        }
        hubUrl = custom;
      }
      enteredInteractively.HUB_URL = hubUrl;
    }

    // ── World Passport (required) ──────────────────────────────
    let passport: string;
    if (process.env.HUB_API_KEY) {
      passport = process.env.HUB_API_KEY;
      console.log(`  ✓ Passport: ${mask(passport)}  (from .env)`);
    } else {
      console.log();
      console.log(`  Get your passport at ${PASSPORT_URL}`);
      passport = "";
      while (!passport) {
        passport = (await rl.question("  World Passport: ")).trim();
        if (!passport) {
          console.log("  ⚠  Passport is required.\n");
        }
      }
      enteredInteractively.HUB_API_KEY = passport;
    }

    // ── World Name (required) ──────────────────────────────────
    let worldName: string;
    if (process.env.WORLD_NAME) {
      worldName = process.env.WORLD_NAME;
      console.log(`  ✓ Name:     ${worldName}  (from .env)`);
    } else {
      console.log();
      worldName = "";
      while (!worldName) {
        worldName = (await rl.question("  World Name: ")).trim();
        if (!worldName) {
          console.log("  ⚠  World name is required.\n");
        }
      }
      enteredInteractively.WORLD_NAME = worldName;
    }

    // ── World Description (optional) ───────────────────────────
    let worldDescription: string;
    if (process.env.WORLD_DESCRIPTION !== undefined) {
      worldDescription = process.env.WORLD_DESCRIPTION;
      if (worldDescription) {
        console.log(`  ✓ Description: ${worldDescription}  (from .env)`);
      }
    } else {
      worldDescription = (
        await rl.question("  Description (optional): ")
      ).trim();
      enteredInteractively.WORLD_DESCRIPTION = worldDescription;
    }

    // ── Save to .env? (only if something was entered interactively) ─
    if (Object.keys(enteredInteractively).length > 0) {
      console.log();
      const save = (await rl.question("  Save to apps/world/.env? [Y/n] ")).trim().toLowerCase();
      if (save === "" || save === "y" || save === "yes") {
        saveToEnv(enteredInteractively);
        console.log("  ✓ Saved.");
      }
    }

    rl.close();

    console.log();
    console.log(`  Connecting to ${hubUrl}…`);
    console.log();

    // ── Set env vars and boot the world engine ─────────────────
    process.env.HUB_API_KEY = passport;
    process.env.HUB_URL = hubUrl;
    process.env.WORLD_NAME = worldName;
    process.env.WORLD_DESCRIPTION = worldDescription;

    // Import the world entry point — it reads env vars on load
    await import("../apps/world/index.js");
  } catch (err) {
    rl.close();
    if ((err as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") {
      // readline closed via Ctrl+C — ignore
      return;
    }
    console.error("\n  ✖ ", err);
    process.exit(1);
  }
}

main();
