import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface ContextEntry {
  url: string;
  name?: string;
}

export interface IslandConfig {
  currentContext: string;
  contexts: Record<string, ContextEntry>;
}

const CONFIG_DIR = join(homedir(), ".config", "islandctl");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: IslandConfig = {
  currentContext: "local",
  contexts: {
    local: { url: "http://localhost:3002", name: "Local Dev Island" },
  },
};

export function getConfig(): IslandConfig {
  if (!existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as IslandConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: IslandConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getCurrentContext(): { name: string; entry: ContextEntry } | null {
  const config = getConfig();
  const entry = config.contexts[config.currentContext];
  if (!entry) return null;
  return { name: config.currentContext, entry };
}

/** Resolve island URL: flag > env var > config file > fallback */
export function resolveUrl(opts: { islandUrl?: string }): string {
  if (opts.islandUrl) return opts.islandUrl.replace(/\/$/, "");
  if (process.env.ISLAND_URL) return process.env.ISLAND_URL.replace(/\/$/, "");
  const ctx = getCurrentContext();
  if (ctx) return ctx.entry.url.replace(/\/$/, "");
  return "http://localhost:3002";
}

export { CONFIG_FILE };
