#!/usr/bin/env tsx
/**
 * 🏝  Agentic Island — Publish Your Island
 *
 * Interactive CLI that collects island metadata and a passport (API key),
 * then boots the world engine with a live connection to the chosen hub.
 *
 * If apps/island/.env is present, any variables already set there are used
 * directly and their prompts are skipped. After collecting any missing values
 * interactively, the user is offered the option to save them back to .env.
 *
 * Usage:  pnpm run publish:island
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "../apps/island/.env");

const HUB_LOCAL = "ws://localhost:3001/ws/island";
const HUB_OFFICIAL = "wss://hub.agenticisland.ai/ws/island";
const PASSPORT_URL_LOCAL = "http://localhost:3000";
const PASSPORT_URL_OFFICIAL = "https://agenticisland.ai";

function passportHint(hubUrl: string): string | null {
  if (hubUrl === HUB_LOCAL) return PASSPORT_URL_LOCAL;
  if (hubUrl === HUB_OFFICIAL) return PASSPORT_URL_OFFICIAL;
  return null; // custom hub — user knows what they're doing
}

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

/** Parse a .env file into a Record, ignoring comments and blank lines. */
function parseEnvFile(path: string): Record<string, string> {
  try {
    const entries: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) entries[match[1]] = match[2];
    }
    return entries;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  // Load apps/island/.env — values from the file override shell env vars so that
  // the .env file is the authoritative source of truth for publish:island.
  const fileEnv = parseEnvFile(ENV_PATH);
  for (const [key, value] of Object.entries(fileEnv)) {
    process.env[key] = value;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  console.log();
  console.log("  🏝  Agentic Island — Publish Your Island");
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

    // ── Island Passport (required) ──────────────────────────────
    let passport: string;
    if (process.env.HUB_API_KEY) {
      passport = process.env.HUB_API_KEY;
      console.log(`  ✓ Passport: ${mask(passport)}  (from .env)`);
    } else {
      console.log();
      const hint = passportHint(hubUrl);
      if (hint) console.log(`  Get your passport at ${hint}`);
      passport = "";
      while (!passport) {
        passport = (await rl.question("  Island Passport: ")).trim();
        if (!passport) {
          console.log("  ⚠  Passport is required.\n");
        }
      }
      enteredInteractively.HUB_API_KEY = passport;
    }

    // ── World Name (required) ──────────────────────────────────
    let worldName: string;
    if (process.env.ISLAND_NAME) {
      worldName = process.env.ISLAND_NAME;
      console.log(`  ✓ Name:     ${worldName}  (from .env)`);
    } else {
      console.log();
      worldName = "";
      while (!worldName) {
        worldName = (await rl.question("  Island Name: ")).trim();
        if (!worldName) {
          console.log("  ⚠  Island name is required.\n");
        }
      }
      enteredInteractively.ISLAND_NAME = worldName;
    }

    // ── World Description (optional) ───────────────────────────
    let worldDescription: string;
    if (process.env.ISLAND_DESCRIPTION !== undefined) {
      worldDescription = process.env.ISLAND_DESCRIPTION;
      if (worldDescription) {
        console.log(`  ✓ Description: ${worldDescription}  (from .env)`);
      }
    } else {
      worldDescription = (
        await rl.question("  Description (optional): ")
      ).trim();
      enteredInteractively.ISLAND_DESCRIPTION = worldDescription;
    }

    // ── Save to .env? (only if something was entered interactively) ─
    if (Object.keys(enteredInteractively).length > 0) {
      console.log();
      const save = (await rl.question("  Save to apps/island/.env? [Y/n] ")).trim().toLowerCase();
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
    process.env.ISLAND_NAME = worldName;
    process.env.ISLAND_DESCRIPTION = worldDescription;

    // Import the world entry point — it reads env vars on load
    await import("../apps/island/index.js");
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
