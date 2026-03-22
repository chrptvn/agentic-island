#!/usr/bin/env tsx
/**
 * 🏝  Agentic Island — Publish Your World
 *
 * Interactive CLI that collects world metadata and a passport (API key),
 * then boots the core with a live connection to hub.agenticisland.ai.
 *
 * Usage:  pnpm run publish:world
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const DEFAULT_HUB_URL = "wss://hub.agenticisland.ai/ws/core";
const PASSPORT_URL = "https://agenticisland.ai";

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log();
  console.log("  🏝  Agentic Island — Publish Your World");
  console.log("  ────────────────────────────────────────");
  console.log();

  try {
    // ── World Name (required) ──────────────────────────────────
    let worldName = "";
    while (!worldName.trim()) {
      worldName = await rl.question("  World Name: ");
      if (!worldName.trim()) {
        console.log("  ⚠  World name is required.\n");
      }
    }
    worldName = worldName.trim();

    // ── World Description (optional) ───────────────────────────
    const worldDescription = (
      await rl.question("  Description (optional): ")
    ).trim();

    // ── Hub Address ──────────────────────────────────────────────
    const hubInput = (
      await rl.question(`  Hub Address (${DEFAULT_HUB_URL}): `)
    ).trim();
    const hubUrl = hubInput || DEFAULT_HUB_URL;

    // ── World Passport (required) ──────────────────────────────
    console.log();
    console.log(`  Get your passport at ${PASSPORT_URL}`);
    let passport = "";
    while (!passport.trim()) {
      passport = await rl.question("  World Passport: ");
      if (!passport.trim()) {
        console.log("  ⚠  Passport is required.\n");
      }
    }
    passport = passport.trim();

    rl.close();

    console.log();
    console.log(`  Connecting to ${hubUrl}…`);
    console.log();

    // ── Set env vars and boot the core ─────────────────────────
    process.env.HUB_API_KEY = passport;
    process.env.HUB_URL = hubUrl;
    process.env.WORLD_NAME = worldName;
    process.env.WORLD_DESCRIPTION = worldDescription;

    // Import the core entry point — it reads env vars on load
    await import("../apps/core/index.js");
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
