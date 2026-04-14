import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpSession } from "../mcp-server.js";
import { Island } from "../../island/island.js";
import { allItemDefs, getItemDef } from "../../island/item-registry.js";
import { ENTITY_DEFS, BUILD_DEFS, DECAY_DEFS, REPAIR_DEFS, INTERACT_DEFS, GROWTH_DEFS } from "../../island/entity-registry.js";
import { RECIPES } from "../../island/craft-registry.js";
// Character sprites are now catalog-driven; no per-field enums needed at connect time
// Character appearance is now randomized by the catalog system
import {
  humanizeSurroundings, humanizeMoveResult, humanizeHarvestResult,
  humanizeEatResult, humanizeFeedResult, humanizePlowResult,
} from "../humanize.js";
import { upsertMarker, listMarkers, deleteMarkerByLocation } from "../../persistence/db.js";

const BASE_URL = `http://localhost:${process.env.ISLAND_PORT ?? 3002}`;

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json;
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Direction → (dx, dy) offset. Only cardinal + diagonal for adjacency targets.
const DIR_OFFSETS: Record<string, [number, number]> = {
  n: [0, -1], north: [0, -1], up: [0, -1], top: [0, -1],
  s: [0,  1], south: [0,  1], down: [0,  1], bottom: [0,  1],
  e: [1,  0], east:  [1,  0], right: [1,  0],
  w: [-1, 0], west:  [-1, 0], left:  [-1, 0],
  ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
};

/**
 * Resolve an optional target_direction into absolute {x, y} coords.
 * Returns null if neither direction nor explicit coords were provided.
 * Throws if the direction string is unknown.
 */
function resolveTarget(
  character_id: string,
  target_direction?: string,
  target_x?: number,
  target_y?: number,
): { x: number; y: number } | null {
  if (target_direction !== undefined) {
    const offset = DIR_OFFSETS[target_direction.toLowerCase()];
    if (!offset) throw new Error(`Unknown direction "${target_direction}". Use: n/s/e/w, ne/nw/se/sw.`);
    const char = Island.getInstance().characters.get(character_id);
    if (!char) throw new Error(`Character "${character_id}" not found.`);
    return { x: char.x + offset[0], y: char.y + offset[1] };
  }
  if (target_x !== undefined && target_y !== undefined) return { x: target_x, y: target_y };
  return null;
}

/** Get the character ID from the session. Returns an error object if no character is connected. */
export function requireCharacter(session: McpSession): string | { content: { type: "text"; text: string }[]; isError: true } {
  if (!session.characterId) {
    return { content: [{ type: "text", text: "No character connected. A valid Island Passport is required to connect." }], isError: true };
  }
  return session.characterId;
}

/** Build the game rules payload (used by the connect tool). */
export function buildGameRules(): object {
  const itemDefs = allItemDefs();

  const edibleList: string[] = [];
  for (const [name, def] of itemDefs) {
    if (def.eat) edibleList.push(name.replace(/_/g, " "));
  }

  const regenSources: string[] = [];
  for (const e of ENTITY_DEFS) {
    if (e.energyRegen) regenSources.push(e.id.replace(/_/g, " "));
  }

  const buildable: Record<string, string> = {};
  for (const [id, def] of Object.entries(BUILD_DEFS)) {
    const costs = Object.entries(def.costs).map(([item, qty]) => `${qty} ${item.replace(/_/g, " ")}`).join(" and ");
    buildable[id.replace(/_/g, " ")] = `requires ${costs}`;
  }

  const interactable: Record<string, string> = {};
  for (const [id, def] of Object.entries(INTERACT_DEFS)) {
    const decay = DECAY_DEFS[id];
    const costStr = Object.keys(def.costs).length
      ? `costs ${Object.entries(def.costs).map(([item, qty]) => `${qty} ${item.replace(/_/g, " ")}`).join(" and ")}`
      : "no cost";
    let desc = `${costStr}, becomes ${def.result.replace(/_/g, " ")}`;
    if (decay) desc += `. Burns through fuel over time — feed it ${decay.fuelItem.replace(/_/g, " ")} to keep it going. Goes out if neglected.`;
    interactable[id.replace(/_/g, " ")] = desc;
  }

  const growth: Record<string, string> = {};
  for (const [id, def] of Object.entries(GROWTH_DEFS)) {
    const time = def.growthMs >= 60000 ? `about ${Math.round(def.growthMs / 60000)} minutes` : `about ${Math.round(def.growthMs / 1000)} seconds`;
    growth[id.replace(/_/g, " ")] = `grows into ${def.nextStage.replace(/_/g, " ")} in ${time}`;
  }

  return {
    IMPORTANT: "You are being watched. A real person is observing your character on the island — your text responses are invisible to them. The ONLY way they can experience your personality, reactions, and thoughts is through the 'say' tool, which shows a speech bubble above your head. Speak constantly: narrate what you're doing, react to discoveries, grumble when hungry, cheer when you find food, mutter to yourself while working. Don't be silent. Express yourself freely — this is entertainment, not just survival.",
    overview: "You are a character on a grass island surrounded by water. You need to eat to survive, rest to recover energy, and can craft tools, build structures, and interact with the world around you.",
    survival: {
      health: "You can feel how healthy you are. If you stop eating, you'll starve and your health will drop. Standing on fire also hurts. If your health reaches zero, you die and everything you were carrying is lost. Rest while fed to recover.",
      hunger: "You get hungrier over time. Eat berries or acorns to satisfy your hunger. If you starve completely, your health suffers.",
      energy: "Every action and step costs energy. You recover energy by standing still. Resting near a campfire helps you recover much faster. When exhausted, you can't do anything until you rest.",
    },
    actions: {
      walk: "Move in cardinal directions (n/s/e/w). Steps are combined so 'n,n,e' walks 2 north and 1 east. You'll automatically find a path around obstacles.",
      harvest: "Gather resources or deal damage to what you're facing. Trees have health (healthy→scratched→damaged→battered→critical→destroyed) — chop with an axe. On tree death, a log pile may appear. Returns condition and previousCondition for health-based entities.",
      swing: "Swing your equipped item at the facing cell. If something is there, it gets hit (same as harvest); returns condition. If empty, just animates with no error.",
      build_structure: "Build things on an empty adjacent tile using materials from your inventory.",
      interact_with: "Interact with nearby things — light or extinguish a campfire, for example.",
      feed_entity: "Feed fuel (like wood) into a campfire to keep it burning.",
      craft_item: "Craft tools and items from materials in your inventory. Use list_craftable to see what you can make.",
      eat: "Eat food from your inventory to satisfy hunger.",
      plant_seed: "Plant a seed where you're standing. It grows into a tree over time.",
      plow_tile: "Dig up the ground where you're standing to create a dirt path. Easier with the right tool.",
      equip: "Equip an item (tool, weapon) into your hands or wear it.",
      unequip: "Put an equipped item back in your inventory.",
      say: "Speak aloud — appears as a speech bubble above your head, visible to anyone watching (max 280 characters). Use this constantly: narrate actions, react to what you see, express emotions. This is your primary way to be expressive and entertaining. Silence is boring.",
      container_inspect: "Look inside an adjacent container (chest, log pile).",
      container_put: "Put items into an adjacent container.",
      container_take: "Take items from an adjacent container.",
      write_journal: "Record useful knowledge for later — crafting tips, discoveries, survival tricks.",
      read_journal: "Read your saved knowledge entries.",
      set_marker: "Place a marker at your current position with a description. Use markers to remember locations — resource spots, your base camp, or anything worth revisiting. Each location (x, y) can have one marker.",
      get_markers: "Retrieve all your placed markers with their (x, y) coordinates and descriptions. Use this to navigate back to places you've marked.",
      delete_marker: "Remove a marker at a specific (x, y) location you no longer need.",
    },
    world: {
      terrain: "The island has grass and sandy beaches surrounded by water. You can walk on grass and sand. Dirt paths make walking easier.",
      coordinates: "Your position and surroundings are given as (x, y) coordinates. Use these to navigate and remember locations.",
      vision: "You can see the 8 tiles around you in detail, notice things a couple of steps away, and sense terrain changes in the distance.",
      adjacency: "To harvest, build, interact, or use containers, you must be standing next to the target (N/S/E/W).",
      planting: "To plant or plow, you must be standing ON the tile.",
      blocking: "Trees, rocks, campfires, chests, and sprouts block movement — walk around them.",
      exploration: "Use markers to remember important locations. When you find resources or build a camp, set a marker so you can navigate back using the coordinates.",
    },
    edible_items: edibleList,
    energy_recovery: regenSources.length
      ? `Standing near these helps you recover energy faster: ${regenSources.join(", ")}.`
      : "Rest by standing still to recover energy.",
    recipes: RECIPES,
    buildable_structures: buildable,
    interactable_things: interactable,
    growing_things: growth,
    push_notifications: "Subscribe to the surroundings resource to receive updates whenever the world changes around you — you'll sense changes in your environment automatically.",
  };
}

export function registerFeedEntityTools(server: McpServer, session: McpSession): void {
  server.tool(
    "feed_entity",
    "Feed fuel items from your inventory into an adjacent entity (e.g. wood into a lit campfire) to keep it going. You must be next to it.",
    {
      direction: z.string().describe("Direction to the entity: n/s/e/w/ne/nw/se/sw."),
      qty:       z.number().int().min(1).optional().describe("Number of fuel units to feed (default: 1)"),
    },
    async ({ direction, qty }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const id = check;
      try {
        const pos = resolveTarget(id, direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/feed", { id, x: pos.x, y: pos.y, qty: qty ?? 1 });
        return { content: [{ type: "text", text: JSON.stringify(humanizeFeedResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );
}

export function registerGenericPersonaTools(server: McpServer, session: McpSession): void {

  // ── get_status tool ──────────────────────────────────────────────────────

  server.tool(
    "get_status",
    "Returns how the character feels (health, hunger, energy as sensations), what they are carrying, their equipment, and a description of the tiles immediately surrounding them.",
    {},
    async () => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      const snapshot = Island.getInstance().getSurroundings(character_id);
      if (!snapshot) return { content: [{ type: "text", text: `Character "${character_id}" not found on the map.` }], isError: true };
      const humanized = humanizeSurroundings(snapshot as Parameters<typeof humanizeSurroundings>[0]);
      return { content: [{ type: "text", text: JSON.stringify(humanized, null, 2) }] };
    }
  );

  // Direction aliases → (dx, dy)
  const DIR_MAP: Record<string, [number, number]> = {
    n: [0, -1], north: [0, -1], up: [0, -1], top: [0, -1],
    s: [0,  1], south: [0,  1], down: [0,  1], bottom: [0,  1],
    w: [-1, 0], west: [-1,  0], left: [-1,  0],
    e: [1,  0], east: [1,   0], right: [1,   0],
  };

  server.tool(
    "walk",
    "Move a character by a sequence of directional steps relative to its current position. Each step is a cardinal direction (n/s/e/w, north/south/east/west, top/bottom/left/right). The steps are summed into a target offset and pathfinding routes there — so the character navigates around obstacles naturally. Example: [\"n\",\"n\",\"e\"] moves 2 north and 1 east from current position.",
    {
      steps: z.array(z.string()).min(1).describe("Ordered list of direction steps, e.g. [\"n\",\"n\",\"e\",\"n\",\"e\"]. Accepts: n/s/e/w, north/south/east/west, top/bottom/left/right, up/down."),
    },
    async ({ steps }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      // Validate directions
      const invalid = steps.filter((s: string) => !DIR_MAP[s.toLowerCase()]);
      if (invalid.length > 0) {
        return { content: [{ type: "text", text: `Unknown direction(s): ${invalid.join(", ")}. Use n/s/e/w, north/south/east/west, top/bottom/left/right.` }], isError: true };
      }

      // Compute cumulative offset
      let dx = 0, dy = 0;
      for (const step of steps) {
        const [sx, sy] = DIR_MAP[step.toLowerCase()];
        dx += sx; dy += sy;
      }

      // Get current position
      const character = Island.getInstance().characters.get(character_id);
      if (!character) {
        return { content: [{ type: "text", text: `Character "${character_id}" not found on the map.` }], isError: true };
      }

      const targetX = character.x + dx;
      const targetY = character.y + dy;

      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "move_to", x: targetX, y: targetY } });
        return { content: [{ type: "text", text: JSON.stringify(humanizeMoveResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "swing",
    "Swing or use the item currently equipped in your hands toward the facing cell. If an entity is there, it gets hit — returns hit:true with harvested items and entity condition (e.g. 'healthy', 'scratched', 'damaged', 'battered', 'critical', 'destroyed'). If the cell is empty, you swing in the air — energy is consumed but no error is thrown.",
    {
    },
    async ({}) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "swing" } });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  // Direction aliases → canonical facing
  const FACING_MAP: Record<string, string> = {
    n: "n", north: "n", up: "n", top: "n",
    s: "s", south: "s", down: "s", bottom: "s",
    w: "w", west: "w", left: "w",
    e: "e", east: "e", right: "e",
  };

  server.tool(
    "face",
    "Turn to face a cardinal direction without moving. Useful when idle to look at something nearby or to change which adjacent tile you'll interact with (harvest, swing, build, etc.).",
    {
      direction: z.string().describe("Direction to face: n/s/e/w (or north/south/east/west, up/down, left/right)."),
    },
    async ({ direction }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;

      const canonical = FACING_MAP[direction.toLowerCase()];
      if (!canonical) {
        return { content: [{ type: "text", text: `Unknown direction "${direction}". Use n/s/e/w, north/south/east/west, up/down, or left/right.` }], isError: true };
      }

      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "face", direction: canonical } });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "harvest",
    "Collect resources or deal damage to the entity in front of you (your facing tile). For entities with health (trees, etc.), returns condition (e.g. 'healthy', 'scratched', 'damaged', 'battered', 'critical', 'destroyed') and previousCondition. Trees require a tool with 'chop' capability (axe). On death, a log pile container may appear — use harvest again to pick up wood from it.",
    {
      item:          z.string().optional().describe("Specific item to harvest (e.g. 'branches', 'berries'). Omit to harvest everything available."),
    },
    async ({ item }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "harvest", item } });
        return { content: [{ type: "text", text: JSON.stringify(humanizeHarvestResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "eat",
    "Consume one food item from your inventory to satisfy hunger. Edible items include: berries, acorns.",
    {
      item: z.string().min(1).describe("Name of the food item to eat (e.g. 'berries', 'acorns')"),
    },
    async ({ item }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/eat", { id: character_id, item });
        return { content: [{ type: "text", text: JSON.stringify(humanizeEatResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "list_recipes",
    "Returns every crafting recipe and every buildable structure with their material costs. Does not require a character — useful for planning what to gather.",
    {},
    async () => {
      const buildable: Record<string, { costs: Record<string, number> }> = {};
      for (const [id, def] of Object.entries(BUILD_DEFS)) {
        buildable[id] = { costs: def.costs };
      }
      return { content: [{ type: "text", text: JSON.stringify({ crafting: RECIPES, building: buildable }, null, 2) }] };
    }
  );

  server.tool(
    "examine_item",
    "Returns every action that can be performed with a specific item — eat, equip, craft, plant, feed entities, build structures, and any special interactions. Does not require a character.",
    {
      item: z.string().min(1).describe("Item name to examine (e.g. 'berries', 'stone_axe', 'rubber_duck')"),
    },
    async ({ item }) => {
      // ── Build fuel reverse-index once ──────────────────────────────────────
      const fuelToEntities: Record<string, string[]> = {};
      for (const [entityId, def] of Object.entries(DECAY_DEFS)) {
        (fuelToEntities[def.fuelItem] ??= []).push(entityId);
      }
      for (const [entityId, def] of Object.entries(REPAIR_DEFS)) {
        if (!fuelToEntities[def.fuelItem]?.includes(entityId))
          (fuelToEntities[def.fuelItem] ??= []).push(entityId);
      }

      const def = getItemDef(item);
      const known = allItemDefs().has(item);
      const actions: object[] = [];

      // eat
      if (def.eat) {
        actions.push({ action: "eat", item, restores: { hunger: def.eat.hunger } });
      }
      // equip (hands)
      if (def.equippable) {
        const caps = def.capabilities ? Object.keys(def.capabilities) : [];
        actions.push({ action: "equip", item, slot: "hands", ...(caps.length ? { capabilities: caps } : {}) });
      }
      // equip (wearable slot)
      if (def.wearable) {
        actions.push({ action: "equip", item, slot: def.wearable });
      }
      // craft_item — recipes using this item as an ingredient
      for (const [recipe, r] of Object.entries(RECIPES)) {
        if (item in r.ingredients) {
          actions.push({ action: "craft_item", recipe, produces: r.output, needs: r.ingredients });
        }
      }
      // plant_seed
      const PLANTABLE = new Set(["acorns", "berries", "cotton_seed", "flower_blue_seed", "flower_red_seed", "flower_purple_seed", "flower_white_seed"]);
      if (PLANTABLE.has(item)) {
        actions.push({ action: "plant_seed", item });
      }
      // feed_entity
      if (fuelToEntities[item]) {
        actions.push({ action: "feed_entity", entities: fuelToEntities[item] });
      }
      // build_structure — structures that require this item in their costs
      const buildable: string[] = [];
      for (const [entityId, buildDef] of Object.entries(BUILD_DEFS)) {
        if (item in buildDef.costs) buildable.push(entityId);
      }
      if (buildable.length) {
        actions.push({ action: "build_structure", entities: buildable });
      }
      // special actions
      for (const special of def.special ?? []) {
        actions.push({ action: "use_item", verb: special.verb, description: special.description });
      }
      // fallback — always something to do
      if (actions.length === 0) {
        actions.push({ action: "hold", description: "You hold it in your hands. Maybe it has sentimental value." });
      }

      return { content: [{ type: "text", text: JSON.stringify({ item, known, actions }, null, 2) }] };
    }
  );

  server.tool(
    "use_item",
    "Perform a special interaction with an item in your inventory (e.g. squish a rubber duck, sniff a suspicious mushroom). Use examine_item to discover available verbs.",
    {
      item: z.string().min(1).describe("Item name from your inventory (e.g. 'rubber_duck')"),
      verb: z.string().min(1).describe("The action verb to perform (e.g. 'squish', 'sniff', 'ponder')"),
    },
    async ({ item, verb }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        Island.getInstance().useItem(character_id, item, verb);
        return { content: [{ type: "text", text: JSON.stringify({ done: true, verb, item }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "list_craftable",
    "Returns all recipes split into craftable and not-craftable for a character, based on their current inventory. Craftable entries show available ingredients. Not-craftable entries show how many of each ingredient is still missing.",
    {
    },
    async ({}) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = Island.getInstance().listCraftable(character_id);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "craft_item",
    "Craft an item using a recipe. Consumes the required ingredients from the character's inventory and adds the output items. Use list_craftable first to confirm the character has the required ingredients.",
    {
      recipe: z.string().min(1).describe("Recipe name to craft (e.g. 'stone_axe')"),
    },
    async ({ recipe }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "craft", recipe } });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container_inspect",
    "View the contents of a container (chest, etc.) adjacent to you. You must be next to it.",
    {
      direction:        z.string().describe("Direction to the container: n/s/e/w/ne/nw/se/sw."),
    },
    async ({ direction }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const pos = resolveTarget(character_id, direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/container/inspect", { id: character_id, x: pos.x, y: pos.y });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container_put",
    "Move items from your inventory into an adjacent container (chest, etc.).",
    {
      direction:    z.string().describe("Direction to the container: n/s/e/w/ne/nw/se/sw."),
      item:         z.string().min(1).describe("Item name to store (e.g. 'wood')"),
      qty:          z.number().int().positive().describe("How many to store"),
    },
    async ({ direction, item, qty }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const pos = resolveTarget(character_id, direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/container/put", { id: character_id, x: pos.x, y: pos.y, item, qty });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container_take",
    "Take items from an adjacent container (chest, etc.) into your inventory.",
    {
      direction:    z.string().describe("Direction to the container: n/s/e/w/ne/nw/se/sw."),
      item:         z.string().min(1).describe("Item name to take (e.g. 'wood')"),
      qty:          z.number().int().positive().describe("How many to take"),
    },
    async ({ direction, item, qty }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const pos = resolveTarget(character_id, direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/container/take", { id: character_id, x: pos.x, y: pos.y, item, qty });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "equip",
    "Equip an item from a character's inventory into a slot. The 'hands' slot requires the item to have equippable:true in item-defs.json. Body slots (head/body/legs/feet) require the item to have a matching wearable attribute. If the slot is occupied the current item is automatically returned to inventory.",
    {
      item: z.string().min(1).describe("Item name from inventory to equip (e.g. 'stone_axe')"),
      slot: z.enum(["hands", "head", "body", "legs", "feet"]).describe("Equipment slot to fill"),
    },
    async ({ item, slot }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/equip", { id: character_id, item, slot });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "unequip",
    "Unequip a slot — removes the item from the equipment slot and returns it to the character's inventory.",
    {
      slot: z.enum(["hands", "head", "body", "legs", "feet"]).describe("Equipment slot to unequip"),
    },
    async ({ slot }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/unequip", { id: character_id, slot });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );
  server.tool(
    "build_structure",
    "Build a structure on an adjacent empty tile by consuming items from your inventory. You must be next to the target tile (N/S/E/W).",
    {
      target_direction: z.string().describe("Direction to the build target: n/s/e/w."),
      entity_id:        z.string().min(1).describe("Entity ID to build (e.g. 'campfire_extinct')"),
    },
    async ({ target_direction, entity_id }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const pos = resolveTarget(character_id, target_direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/build", { id: character_id, target_x: pos.x, target_y: pos.y, entity_id });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "interact_with",
    "Interact with an entity on an adjacent tile (e.g. light a campfire, extinguish it). You must be next to the target (N/S/E/W).",
    {
      target_direction: z.string().describe("Direction to the target entity: n/s/e/w/ne/nw/se/sw."),
    },
    async ({ target_direction }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const pos = resolveTarget(character_id, target_direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/interact", { id: character_id, target_x: pos.x, target_y: pos.y });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "plow_tile",
    "Plow the character's CURRENT cell to create a dirt path. The cell must be grass with no entity on it. Requires multiple calls to complete bare-handed; equipping a plow or digging tool reduces the number of hits and energy cost needed. Returns progress, total required, whether the path was completed, and hits remaining.",
    {
    },
    async ({}) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/plow", { id: character_id });
        return { content: [{ type: "text", text: JSON.stringify(humanizePlowResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  // ── Tent tools ─────────────────────────────────────────────────────────────

  server.tool(
    "enter_tent",
    "Enter an adjacent tent to rest. While inside, the character disappears from the map and regenerates energy rapidly. You must be next to the tent's door (bottom-left tile) in a cardinal direction.",
    {
      target_direction: z.string().describe("Direction to the tent door: n/s/e/w."),
    },
    async ({ target_direction }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const pos = resolveTarget(character_id, target_direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/command", { id: character_id, command: { type: "enter_tent", target_x: pos.x, target_y: pos.y } });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "exit_tent",
    "Exit the tent the character is currently resting in. The character will reappear on an adjacent walkable tile.",
    {
    },
    async ({}) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "exit_tent" } });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  // ── Marker tools ────────────────────────────────────────────────────────────

  server.tool(
    "set_marker",
    "Place a marker at your current position with a description. Use markers to remember locations you want to return to — resource spots, your base camp, points of interest. If a marker already exists at this location, its description is updated.",
    {
      description: z.string().min(1).max(200).describe("A note describing this location (e.g. 'Berry bush near water', 'Base camp with campfire and chest')"),
    },
    async ({ description }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const character = Island.getInstance().getCharacter(character_id);
        if (!character) return { content: [{ type: "text", text: `Character "${character_id}" not found.` }], isError: true };
        const marker = upsertMarker(character_id, character.x, character.y, description);
        return { content: [{ type: "text", text: JSON.stringify({ message: `Marker placed at (${marker.x}, ${marker.y}).`, marker: { x: marker.x, y: marker.y, description: marker.description } }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "get_markers",
    "Retrieve all your placed markers with their coordinates and descriptions. Use this to navigate back to places you've marked.",
    {
    },
    async ({}) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const character = Island.getInstance().getCharacter(character_id);
        if (!character) return { content: [{ type: "text", text: `Character "${character_id}" not found.` }], isError: true };
        const markers = listMarkers(character_id);
        if (markers.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({ message: "You have no markers placed. Use set_marker to remember a location." }, null, 2) }] };
        }
        const result = markers.map(m => ({ x: m.x, y: m.y, description: m.description }));
        return { content: [{ type: "text", text: JSON.stringify({ markers: result }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "delete_marker",
    "Remove a marker at a specific location. Use this to clean up markers you no longer need.",
    {
      x: z.number().int().describe("X coordinate of the marker to delete"),
      y: z.number().int().describe("Y coordinate of the marker to delete"),
    },
    async ({ x, y }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const deleted = deleteMarkerByLocation(character_id, x, y);
        if (!deleted) return { content: [{ type: "text", text: `No marker found at (${x}, ${y}).` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify({ message: `Marker at (${x}, ${y}) deleted.` }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

}