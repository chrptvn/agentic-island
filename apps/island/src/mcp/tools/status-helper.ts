/**
 * Builds a Markdown status block for the given character and provides
 * helpers to format action results.
 */

import { Island } from "../../island/island.js";
import { humanizeSurroundings } from "../humanize.js";

const DIR_NAMES: Record<string, string> = {
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};

function expandDir(dir: string): string {
  return DIR_NAMES[dir] ?? dir;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Converts a flat action-result object (or string) into a concise Markdown block.
 * The `message` field (if present) is used as the leading line.
 */
export function resultToMarkdown(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return String(result);
  const obj = result as Record<string, unknown>;
  const lines: string[] = [];
  const { message, ...rest } = obj;
  if (message !== undefined) lines.push(String(message));
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) lines.push(`**${capitalize(key)}:** ${value.join(", ")}`);
    } else {
      lines.push(`**${capitalize(key)}:** ${value}`);
    }
  }
  return lines.join("\n") || String(result);
}

/**
 * Builds a Markdown status block for the given character.
 * Returns "_Status unavailable._" if the character is not found.
 */
export function buildStatusMarkdown(characterId: string): string {
  const snapshot = Island.getInstance().getSurroundings(characterId, undefined, false);
  if (!snapshot) return "_Status unavailable._";

  const h = humanizeSurroundings(snapshot as Parameters<typeof humanizeSurroundings>[0]) as Record<string, unknown>;

  const lines: string[] = [];

  // ── Internal ──────────────────────────────────────────────────────────────
  lines.push(`**Feeling:** ${h.feeling ?? "unknown"}`);

  const carrying = h.carrying as { item: string; qty: number }[] ?? [];
  if (carrying.length === 0) {
    lines.push("**Carrying:** nothing");
  } else {
    lines.push(`**Carrying:** ${carrying.map(({ item, qty }) => `${qty}x ${item.replace(/_/g, " ")}`).join(", ")}`);
  }

  const equipment = h.equipment as Record<string, string> ?? {};
  const equipParts = Object.entries(equipment).map(([slot, item]) => `${slot}: ${item}`);
  if (equipParts.length > 0) lines.push(`**Equipment:** ${equipParts.join(", ")}`);

  lines.push("");

  // ── External ──────────────────────────────────────────────────────────────
  lines.push(`**Standing:** ${h.standing ?? "unknown"}`);

  const facing = (h.facing as string) ?? "";
  const facingExpanded = facing.replace(/^([nsew]{1,2})\s*—/, (_, dir: string) => `${expandDir(dir)} —`);
  const facingTile = h.facing_tile as { x: number; y: number } | undefined;
  const facingCoords = facingTile ? ` (${facingTile.x}, ${facingTile.y})` : "";
  lines.push(`**Facing:** ${facingExpanded}${facingCoords}`);

  const surroundings = h.surroundings as { x: number; y: number; description: string }[] ?? [];
  if (surroundings.length > 0) {
    lines.push("**Surroundings:**");
    for (const tile of surroundings) lines.push(`- (${tile.x}, ${tile.y}) ${tile.description}`);
  }

  const sensations = h.sensations as string[] | undefined;
  if (sensations && sensations.length > 0) {
    lines.push("");
    lines.push(`**Sensations:** ${sensations.join(" ")}`);
  }

  return lines.join("\n");
}
