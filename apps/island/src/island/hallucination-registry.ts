import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EMOTION_PAIRS } from "@agentic-island/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../..", "config", "hallucinations.json");
export const CONFIG_PATH_HALLUCINATIONS = () => CONFIG_PATH;

export interface HallucinationConfig {
  /** How often (ms) a fake sensory event fires per active hallucination entry. */
  intervalMs: number;
  /** Text pools keyed by emotion pole name (e.g. "anxious", "glad"). */
  pools: Record<string, string[]>;
}

function loadConfig(): HallucinationConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as HallucinationConfig;
}

export let HALLUCINATION_CONFIG: HallucinationConfig = loadConfig();

export function reloadHallucinations(): void {
  HALLUCINATION_CONFIG = loadConfig();
}

/**
 * Resolves an emotion pole name (e.g. "anxious", "glad") to the bipolar pair key
 * and the signed delta direction.
 *
 * Low poles push toward 0 (negative direction).
 * High poles push toward 100 (positive direction).
 *
 * Returns undefined if the pole name isn't recognised.
 */
export function emotionPoleToEmotionDelta(
  pole: string,
  magnitude: number,
): { pairKey: string; delta: number } | undefined {
  for (const pair of EMOTION_PAIRS) {
    if (pair.low === pole)  return { pairKey: pair.key, delta: -magnitude };
    if (pair.high === pole) return { pairKey: pair.key, delta: +magnitude };
  }
  return undefined;
}
