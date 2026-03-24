/**
 * Converts raw game data into narrative, analogue-style descriptions.
 * No coordinates, no numeric stats — just how the world *feels*.
 */

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

// ─── Direction labels ────────────────────────────────────────────────────────

const DIRECTION_NAMES: Record<string, string> = {
  n: "to the north", s: "to the south", e: "to the east", w: "to the west",
  ne: "to the northeast", nw: "to the northwest", se: "to the southeast", sw: "to the southwest",
};

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

function describeInventory(inventory: { item: string; qty: number }[]): string[] {
  if (inventory.length === 0) return ["nothing"];
  return inventory.map(({ item, qty }) =>
    qty === 1 ? prettifyName(item) : `${humanizeQuantity(qty)} ${prettifyName(item)}`
  );
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

  // Only show the 8 immediately adjacent tiles (steps === 1)
  const adjacent = raw.nearby.filter(c => c.steps === 1);
  const surroundings: Record<string, string> = {};
  for (const cell of adjacent) {
    const dirName = DIRECTION_NAMES[cell.direction] ?? cell.direction;
    surroundings[dirName] = describeCell(cell);
  }

  return {
    character: raw.character,
    feeling: {
      health: humanizeHealth(raw.stats.health, raw.stats.maxHealth),
      hunger: humanizeHunger(raw.stats.hunger, raw.stats.maxHunger),
      energy: humanizeEnergy(raw.stats.energy, raw.stats.maxEnergy),
    },
    standing: standingParts.join(", "),
    doing: describeAction(raw.action, raw.pathLength),
    carrying: describeInventory(raw.stats.inventory),
    equipment: describeEquipment(raw.stats.equipment),
    surroundings,
  };
}

// ─── Tool response sanitizers ────────────────────────────────────────────────

/** Strip coordinates and numeric stats from move_to / walk responses. */
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
  const stats = raw.stats as { hunger?: number; maxHunger?: number } | undefined;
  return {
    message: raw.message ?? `You ate something.`,
    ...(stats ? { hunger: humanizeHunger(stats.hunger ?? 0, stats.maxHunger ?? 100) } : {}),
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

/** Generic sanitizer: strip any x/y/position/coordinate keys recursively. */
export function stripCoordinates(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripCoordinates);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (["x", "y", "position", "target_x", "target_y", "target", "offset", "dx", "dy", "entityPosition", "destination"].includes(k)) continue;
    result[k] = stripCoordinates(v);
  }
  return result;
}
