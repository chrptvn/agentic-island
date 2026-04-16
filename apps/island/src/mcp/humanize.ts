/**
 * Converts raw game data into descriptive output with coordinates.
 * Stats are humanized (feelings), but positions are exposed as (x, y).
 */

import { EMOTION_PAIRS } from "@agentic-island/shared";

// ─── Stat labels ─────────────────────────────────────────────────────────────

type StatLevel = string;

function ratioLabel(value: number, max: number, scale: [string, string, string, string, string, string]): StatLevel {
  const pct = max > 0 ? value / max : 0;
  if (pct <= 0)     return scale[0];
  if (pct <= 0.15)  return scale[1];
  if (pct <= 0.35)  return scale[2];
  if (pct <= 0.6)   return scale[3];
  if (pct <= 0.85)  return scale[4];
  return scale[5];
}

export function humanizeHealth(value: number, max: number): string {
  return ratioLabel(value, max, ["dead", "dying", "badly wounded", "hurt", "healthy", "in perfect health"]);
}

export function humanizeHunger(value: number, max: number): string {
  return ratioLabel(value, max, ["starving", "very hungry", "hungry", "peckish", "satisfied", "full"]);
}

export function humanizeEnergy(value: number, max: number): string {
  return ratioLabel(value, max, ["exhausted", "very tired", "tired", "rested", "energetic", "full of energy"]);
}

// ─── Quantity labels ─────────────────────────────────────────────────────────

export function humanizeQuantity(n: number): string {
  if (n <= 0) return "none";
  if (n === 1) return "one";
  if (n <= 3) return "a couple";
  if (n <= 6) return "a few";
  if (n <= 12) return "some";
  if (n <= 25) return "many";
  return "a lot of";
}

// ─── Entity health (e.g. tree after chopping) ────────────────────────────────

export function humanizeEntityCondition(health: number, maxHealth: number): string {
  const pct = maxHealth > 0 ? health / maxHealth : 0;
  if (pct <= 0)    return "destroyed";
  if (pct <= 0.25) return "almost destroyed";
  if (pct <= 0.5)  return "heavily damaged";
  if (pct <= 0.75) return "damaged";
  return "intact";
}

// ─── Item name prettifier ────────────────────────────────────────────────────

function prettifyName(id: string): string {
  return id.replace(/_/g, " ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Prominence helpers ───────────────────────────────────────────────────────

function mostProminentPhysical(stats: { health: number; maxHealth: number; hunger: number; maxHunger: number; energy: number; maxEnergy: number }): string {
  const healthDev = stats.maxHealth > 0 ? 1 - stats.health / stats.maxHealth : 0;
  const hungerDev  = stats.maxHunger > 0 ? 1 - stats.hunger / stats.maxHunger : 0;
  const energyDev  = stats.maxEnergy > 0 ? 1 - stats.energy / stats.maxEnergy : 0;
  if (healthDev >= hungerDev && healthDev >= energyDev) return humanizeHealth(stats.health, stats.maxHealth);
  if (hungerDev >= energyDev) return humanizeHunger(stats.hunger, stats.maxHunger);
  return humanizeEnergy(stats.energy, stats.maxEnergy);
}

function mostProminentEmotion(emotions: Record<string, number> | undefined): string | null {
  if (!emotions) return null;
  let maxDev = 0;
  let label: string | null = null;
  for (const pair of EMOTION_PAIRS) {
    const val = emotions[pair.key] ?? 50;
    const dev = Math.abs(val - 50);
    if (dev > maxDev) {
      maxDev = dev;
      label = val < 50 ? pair.low : pair.high;
    }
  }
  return label;
}

// ─── Entity description (tile ID → natural language) ─────────────────────────

const ENTITY_DESCRIPTIONS: Record<string, string> = {
  young_tree:          "a young oak tree",
  old_tree_base:       "a large old oak tree",
  old_tree_top:        "the canopy of a large oak tree",
  young_berry:         "a berry bush",
  young_berry_empty:   "a bare berry bush",
  old_berry_base:      "a large berry tree",
  old_berry_top:       "the canopy of a large berry tree",
  old_berry_empty_base: "a bare berry tree",
  old_berry_empty_top: "the bare canopy of a berry tree",
  oak_sprout:          "a tiny oak sprout",
  oak_sprout_big:      "a growing oak sapling",
  berry_sprout:        "a tiny berry sprout",
  berry_sprout_big:    "a growing berry sapling",
  rock:                "a large rock",
  log_pile:            "a pile of logs",
  campfire_extinct:    "an unlit campfire",
  campfire_lit:        "a crackling campfire",
  chest:               "a wooden chest",
  berries:             "berries on the ground",
  branches:            "some branches on the ground",
  acorns:              "acorns on the ground",
  wood:                "a piece of wood",
  stone_axe:           "a stone axe on the ground",

};

export function describeEntity(tileId: string): string {
  return ENTITY_DESCRIPTIONS[tileId] ?? prettifyName(tileId);
}

// ─── Surroundings humanizer ──────────────────────────────────────────────────

interface RawNearbyCell {
  direction: string;
  steps: number;
  dx: number;
  dy: number;
  terrain: string;
  entity?: string;
  path?: boolean;
  character?: string;
}

interface RawSurroundings {
  character: string;
  position: { x: number; y: number };
  facing: string;
  facing_tile: { x: number; y: number; terrain: string; entity?: string; path?: boolean; character?: string } | null;
  standing: { terrain: string; entity?: string; path?: boolean };
  stats: {
    health: number; maxHealth: number;
    hunger: number; maxHunger: number;
    energy: number; maxEnergy: number;
    inventory: { item: string; qty: number }[];
    equipment: Record<string, { item: string; qty: number } | null>;
    goal: string;
  };
  action: string;
  pathLength: number;
  nearby: RawNearbyCell[];
  sensoryEvents?: { text: string; createdAt: number }[];
}

interface TileInfo {
  x: number;
  y: number;
  description: string;
}

function describeCell(cell: RawNearbyCell): string {
  const parts: string[] = [];

  if (cell.character) {
    parts.push(`a character named ${cell.character}`);
  }
  if (cell.entity) {
    parts.push(describeEntity(cell.entity));
  }
  if (cell.terrain === "water") {
    parts.push("water");
  } else if (!cell.entity && !cell.character) {
    parts.push(cell.path ? "a dirt path" : "open grass");
  }

  return parts.join(", ");
}

function describeFarCell(cell: RawNearbyCell): string | null {
  const parts: string[] = [];
  if (cell.character) parts.push(`a character`);
  if (cell.entity) parts.push(describeEntity(cell.entity));
  if (cell.terrain === "water") parts.push("water");
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function describeDistantCell(cell: RawNearbyCell): string | null {
  if (cell.terrain === "water") return "water";
  return null;
}

function cellToTileInfo(cell: RawNearbyCell, origin: { x: number; y: number }, describe: (c: RawNearbyCell) => string | null): TileInfo | null {
  const desc = describe(cell);
  if (desc === null) return null;
  return { x: origin.x + cell.dx, y: origin.y + cell.dy, description: desc };
}

function describeInventory(inventory: { item: string; qty: number }[]): { item: string; qty: number }[] {
  return inventory.map(({ item, qty }) => ({ item, qty }));
}

function describeEquipment(equipment: Record<string, { item: string; qty: number } | null>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [slot, eq] of Object.entries(equipment)) {
    result[slot] = eq ? prettifyName(eq.item) : "empty";
  }
  return result;
}

function describeAction(action: string, pathLength: number): string {
  if (action === "idle") return "standing still";
  if (action === "moving") return pathLength > 5 ? "walking a long distance" : "walking";
  if (action === "searching") return "looking around";
  return action;
}

export function humanizeSurroundings(raw: RawSurroundings): object {
  // Standing description
  const standingParts: string[] = [];
  if (raw.standing.entity) standingParts.push(`on ${describeEntity(raw.standing.entity)}`);
  if (raw.standing.path) standingParts.push("on a dirt path");
  if (!raw.standing.entity && !raw.standing.path) standingParts.push("on open grass");

  const origin = raw.position;

  // Ring 1 — adjacent (steps === 1): full detail
  const surroundings: TileInfo[] = raw.nearby
    .filter(c => c.steps === 1)
    .map(c => ({ x: origin.x + c.dx, y: origin.y + c.dy, description: describeCell(c) }));

  // Ring 2 — near (steps === 2): entities + water only
  const nearby: TileInfo[] = raw.nearby
    .filter(c => c.steps === 2)
    .map(c => cellToTileInfo(c, origin, describeFarCell))
    .filter((t): t is TileInfo => t !== null);

  // Ring 3 — far (steps === 3): terrain boundaries only
  const farAway: TileInfo[] = raw.nearby
    .filter(c => c.steps === 3)
    .map(c => cellToTileInfo(c, origin, describeDistantCell))
    .filter((t): t is TileInfo => t !== null);

  // Describe what's in front of the character
  const facingDesc = raw.facing_tile
    ? (() => {
        const parts: string[] = [];
        if (raw.facing_tile.character) parts.push(`a character named ${raw.facing_tile.character}`);
        if (raw.facing_tile.entity) parts.push(describeEntity(raw.facing_tile.entity));
        if (raw.facing_tile.terrain === "water") parts.push("water");
        else if (!raw.facing_tile.entity && !raw.facing_tile.character) {
          parts.push(raw.facing_tile.path ? "a dirt path" : "open grass");
        }
        return parts.join(", ");
      })()
    : "the edge of the island";

  return {
    character: raw.character,
    position: raw.position,
    feeling: (() => {
      const physical = mostProminentPhysical(raw.stats);
      const emotion = mostProminentEmotion((raw.stats as { emotions?: Record<string, number> }).emotions);
      return emotion ? `${capitalize(emotion)} and ${physical}` : capitalize(physical);
    })(),
    standing: standingParts.join(", "),
    facing: `${raw.facing} — ${facingDesc}`,
    ...(raw.facing_tile ? { facing_tile: { x: raw.facing_tile.x, y: raw.facing_tile.y } } : {}),
    doing: describeAction(raw.action, raw.pathLength),
    carrying: describeInventory(raw.stats.inventory),
    equipment: describeEquipment(raw.stats.equipment),
    surroundings,
    ...(nearby.length > 0 ? { nearby } : {}),
    ...(farAway.length > 0 ? { far_away: farAway } : {}),
    ...(raw.sensoryEvents && raw.sensoryEvents.length > 0
      ? { sensations: raw.sensoryEvents.map((e) => e.text) }
      : {}),
  };
}

// ─── Tool response sanitizers ────────────────────────────────────────────────

/** Humanize move_to / walk responses. */
export function humanizeMoveResult(raw: Record<string, unknown>): object {
  return {
    message: raw.message ?? (raw.found === false ? "Could not find a path to that target." : "Started walking."),
    doing: raw.action === "idle" ? "standing still" : "walking",
    ...(raw.found === false && raw.nearby ? { nearby_things: raw.nearby } : {}),
  };
}

/** Humanize harvest results — hide entity health numbers. */
export function humanizeHarvestResult(raw: Record<string, unknown>): object {
  const entity = raw.entity as { tileId?: string; health?: number; maxHealth?: number; destroyed?: boolean } | undefined;
  const harvested = raw.harvested as Record<string, number> | undefined;

  const gathered = harvested
    ? Object.entries(harvested).map(([item, qty]) =>
        qty === 1 ? prettifyName(item) : `${humanizeQuantity(qty)} ${prettifyName(item)}`)
    : [];

  return {
    message: raw.message ?? "You harvested some resources.",
    gathered,
    ...(entity ? {
      target: entity.destroyed
        ? `The ${entity.tileId ? describeEntity(entity.tileId) : "thing"} was destroyed.`
        : entity.health !== undefined && entity.maxHealth !== undefined
          ? `The ${entity.tileId ? describeEntity(entity.tileId) : "thing"} looks ${humanizeEntityCondition(entity.health, entity.maxHealth)}.`
          : undefined,
    } : {}),
  };
}

/** Humanize eat results — fuzzy hunger feeling. */
export function humanizeEatResult(raw: Record<string, unknown>): object {
  const stats = raw.stats as { hunger?: number; maxHunger?: number; health?: number; maxHealth?: number; energy?: number } | undefined;
  const effects = raw.effects as { hunger?: number; health?: number; energy?: number; consumed?: boolean; message?: string } | undefined;
  const parts: string[] = [];
  if (effects?.hunger && effects.hunger > 0) parts.push(`+${effects.hunger} hunger`);
  if (effects?.hunger && effects.hunger < 0) parts.push(`${effects.hunger} hunger`);
  if (effects?.health && effects.health < 0) parts.push(`${effects.health} health`);
  if (effects?.health && effects.health > 0) parts.push(`+${effects.health} health`);
  if (effects?.energy && effects.energy !== 0) parts.push(`${effects.energy > 0 ? "+" : ""}${effects.energy} energy`);
  const effectStr = parts.length ? ` (${parts.join(", ")})` : "";
  return {
    message: effects?.message ?? raw.message ?? `You ate ${raw.eaten ?? "something"}${effectStr}.`,
    ...(stats ? { hunger: humanizeHunger(stats.hunger ?? 0, stats.maxHunger ?? 100) } : {}),
    ...(effects?.consumed === false ? { note: "Item is still in your inventory." } : {}),
  };
}

/** Humanize feed entity results. */
export function humanizeFeedResult(raw: Record<string, unknown>): object {
  const health = raw.health as number | undefined;
  const maxHealth = raw.maxHealth as number | undefined;
  return {
    message: `You fed the fire.`,
    ...(health !== undefined && maxHealth !== undefined
      ? { condition: humanizeEntityCondition(health, maxHealth) }
      : {}),
  };
}

/** Humanize plow results. */
export function humanizePlowResult(raw: Record<string, unknown>): object {
  const completed = raw.completed as boolean | undefined;
  return {
    message: completed
      ? "You finished plowing a dirt path."
      : "You made some progress plowing. Keep going.",
  };
}
