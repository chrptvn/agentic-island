import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const CONFIG_DIR = join(homedir(), ".agenticisland");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface IslanderEntry {
  /** Full MCP endpoint URL, e.g. https://agenticisland.ai/islands/abc123/mcp or http://localhost:3002/mcp */
  mcpURL: string;
  passport: string;
}

export interface IslanderConfig {
  llm: LLMConfig;
  islanders: Record<string, IslanderEntry>;
}

const DEFAULT_CONFIG: IslanderConfig = {
  llm: {
    baseURL: "http://localhost:8080/v1",
    apiKey: "",
    model: "llama3",
  },
  islanders: {},
};

export function getConfig(): IslanderConfig {
  if (!existsSync(CONFIG_FILE)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<IslanderConfig>;
    return { ...DEFAULT_CONFIG, ...parsed, llm: { ...DEFAULT_CONFIG.llm, ...parsed.llm }, islanders: parsed.islanders ?? {} };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: IslanderConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getIslanderEntry(id: string): IslanderEntry | undefined {
  return getConfig().islanders[id];
}

export function soulPath(id: string): string {
  return join(CONFIG_DIR, "islander", id, "SOUL.md");
}

export function soulDir(id: string): string {
  return join(CONFIG_DIR, "islander", id);
}
