/**
 * scripts/setup-env.ts
 *
 * Auto-generates .env files from .env.example templates for local development.
 * Replaces __GENERATED_*__ placeholders with cryptographically random values.
 * Idempotent: skips if .env already exists.
 *
 * Usage: tsx scripts/setup-env.ts
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const GENERATORS: Record<string, () => string> = {
  __GENERATED_PASSPORT_SALT__: () => randomBytes(32).toString("hex"),
  __GENERATED_ADMIN_KEY__: () => randomBytes(24).toString("hex"),
};

interface EnvTarget {
  name: string;
  envPath: string;
  examplePath: string;
}

const targets: EnvTarget[] = [
  {
    name: "api",
    envPath: join(ROOT, "apps/api/.env"),
    examplePath: join(ROOT, "apps/api/.env.example"),
  },
  {
    name: "web",
    envPath: join(ROOT, "apps/web/.env"),
    examplePath: join(ROOT, "apps/web/.env.example"),
  },
];

let created = 0;

for (const target of targets) {
  if (existsSync(target.envPath)) {
    continue;
  }

  if (!existsSync(target.examplePath)) {
    console.warn(`[setup-env] ⚠ ${target.examplePath} not found — skipping ${target.name}`);
    continue;
  }

  let content = readFileSync(target.examplePath, "utf-8");

  for (const [placeholder, generate] of Object.entries(GENERATORS)) {
    if (content.includes(placeholder)) {
      content = content.replaceAll(placeholder, generate());
    }
  }

  writeFileSync(target.envPath, content);
  console.log(`[setup-env] ✔ Created ${target.name} .env`);
  created++;
}

if (created === 0) {
  console.log("[setup-env] All .env files already exist — nothing to do.");
}
