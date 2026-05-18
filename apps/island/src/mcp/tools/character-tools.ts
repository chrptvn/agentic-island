import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpSession } from "../mcp-server.js";
import { Island } from "../../island/island.js";
import { allItemDefs, getItemDef } from "../../island/item-registry.js";
import { ENTITY_DEFS, BUILD_DEFS, DECAY_DEFS, REPAIR_DEFS, INTERACT_DEFS, GROWTH_DEFS, ENTITY_DEF_BY_TILE_ID } from "../../island/entity-registry.js";
import { RECIPES } from "../../island/craft-registry.js";
// Character sprites are now catalog-driven; no per-field enums needed at connect time
// Character appearance is now randomized by the catalog system
import {
  humanizeMoveResult, humanizeHarvestResult,
  humanizeEatResult, humanizeFeedResult,
} from "../humanize.js";
import { buildStatusMarkdown, resultToMarkdown } from "./status-helper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_PROMPT_PATH = join(__dirname, "../../../config/agent-prompt.md");

function loadAgentPrompt(): string {
  try {
    return readFileSync(AGENT_PROMPT_PATH, "utf-8").trim();
  } catch {
    return "";
  }
}

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
    behavior: loadAgentPrompt(),
    overview: "You are a character on a grass island surrounded by water. You need to eat to survive, rest to recover energy, and can craft tools, build structures, and interact with the world around you.",
    survival: {
      health: "You can feel how healthy you are. If you stop eating, you'll starve and your health will drop. Standing on fire also hurts. If your health reaches zero, you die and everything you were carrying is lost. Rest while fed to recover.",
      hunger: "You get hungrier over time. Eat berries or acorns to satisfy your hunger. If you starve completely, your health suffers.",
      energy: "Every action and step costs energy. You recover energy by standing still. Resting near a campfire helps you recover much faster. When exhausted, you can't do anything until you rest.",
    },
    actions: {
      walk: "Move in cardinal directions (n/s/e/w). Steps are combined so 'n,n,e' walks 2 north and 1 east. You'll automatically find a path around obstacles.",
      use_on: "Universal action tool. Pass an item to eat food (self tile), plant a seed (self tile), plow ground (self tile, plow item), feed fuel into an adjacent entity, or swing a tool at a cardinal adjacent tile. Pass an entity_id (e.g. 'campfire_extinct') as item to build it on an adjacent tile. Omit item entirely (bare hands) to strike/pick an entity or interact with it (light/extinguish a campfire).",
      craft_item: "Craft tools and items from materials in your inventory. Use crafting_info to see what you can make.",
      crafting_info: "List all recipes and buildable structures. Pass check_inventory=true to see what you can craft with your current inventory.",
      say: "Speak aloud — appears as a speech bubble above your head, visible to anyone watching (max 280 characters).",
      container: "Interact with an adjacent container. op='inspect' to see contents, op='put' to store items, op='take' to retrieve items.",
      equip: "Equip or unequip a wearable item or held tool. Slots: hands, head, body, legs, feet.",
    },
    world: {
      terrain: "The island has grass and sandy beaches surrounded by water. You can walk on grass and sand. Dirt paths make walking easier.",
      coordinates: "Your position and surroundings are given as (x, y) coordinates. Use these to navigate.",
      vision: "Use get_status at any time to see your current state, surroundings, and what you're carrying. Action results describe only what happened.",
      adjacency: "To swing, build, interact, or use containers, you must be standing next to the target (N/S/E/W — cardinal only for swinging/building).",
      self_actions: "To eat, plant, or plow, target your own tile with use_on. To plant food-seeds (acorns, berries), pass mode='plant' to use_on.",
      blocking: "Trees, rocks, campfires, supply caches, and sprouts block movement — walk around them.",
    },
    edible_items: edibleList,
    energy_recovery: regenSources.length
      ? `Standing near these helps you recover energy faster: ${regenSources.join(", ")}.`
      : "Rest by standing still to recover energy.",
    recipes: RECIPES,
    buildable_structures: buildable,
    interactable_things: interactable,
    growing_things: growth,
  };
}


export function registerGenericPersonaTools(server: McpServer, session: McpSession): void {

  // Direction aliases → (dx, dy)
  const DIR_MAP: Record<string, [number, number]> = {
    n: [0, -1], north: [0, -1], up: [0, -1], top: [0, -1],
    s: [0,  1], south: [0,  1], down: [0,  1], bottom: [0,  1],
    w: [-1, 0], west: [-1,  0], left: [-1,  0],
    e: [1,  0], east: [1,   0], right: [1,   0],
  };

  server.tool(
    "get_status",
    "Check your current physical state, feelings, and immediate surroundings. Call this whenever you need to know how you feel, what you're carrying, or what's around you.",
    {},
    async () => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      return { content: [{ type: "text", text: buildStatusMarkdown(check) }] };
    }
  );

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
        return { content: [{ type: "text", text: resultToMarkdown(humanizeMoveResult(result as Record<string, unknown>)) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "use_on",
    "Universal action tool. Use an item on a target, or use bare hands on a target. " +
    "Pass an item from inventory to eat (self tile), plant a seed (self tile), plow ground (self tile), " +
    "feed fuel into an entity, or swing a tool at a cardinal adjacent tile. " +
    "Pass an entity_id (e.g. 'campfire_extinct') as item to build that structure on an adjacent tile. " +
    "Omit item entirely (bare hands) to strike/pick an entity or interact with it (light/extinguish a campfire). " +
    "Coordinates appear in the surroundings block after every action.",
    {
      item:     z.string().optional().describe(
        "Item from inventory (e.g. 'berries', 'stone_axe', 'wood', 'cotton_seed') or an entity_id to build (e.g. 'campfire_extinct'). " +
        "Omit to use bare hands (pick/interact)."
      ),
      target_x: z.number().int().describe("X coordinate of the target tile. Use your own position for self-actions (eat, plant, plow)."),
      target_y: z.number().int().describe("Y coordinate of the target tile. Use your own position for self-actions (eat, plant, plow)."),
      qty:      z.number().int().min(1).optional().describe("Quantity of fuel to feed when fuelling an entity (default: 1)."),
      mode:     z.enum(["plant"]).optional().describe("Force 'plant' mode for items that are both food and seeds (acorns, berries). By default, eating takes priority."),
    },
    async ({ item, target_x, target_y, qty, mode }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const char = Island.getInstance().characters.get(character_id);
        if (!char) throw new Error("Character not found.");

        const signedDx = target_x - char.x;
        const signedDy = target_y - char.y;
        const dist = Math.max(Math.abs(signedDx), Math.abs(signedDy)); // Chebyshev

        const cardinalFacing: Record<string, string> = {
          "0,-1": "n", "0,1": "s", "1,0": "e", "-1,0": "w",
        };

        // ── Bare-hands actions ─────────────────────────────────────────────────
        if (!item) {
          if (dist === 0) throw new Error("Cannot use bare hands on yourself. Target an adjacent tile.");
          if (dist > 1) throw new Error(`Target (${target_x}, ${target_y}) is too far. You are at (${char.x}, ${char.y}). Move closer.`);

          // Check if the entity at target is interactable
          const entityAtTarget = Island.getInstance().getEntities().find(e => e.x === target_x && e.y === target_y);
          if (entityAtTarget) {
            const entityId = ENTITY_DEF_BY_TILE_ID.get(entityAtTarget.tileId)?.id ?? entityAtTarget.tileId;
            if (INTERACT_DEFS[entityId]) {
              const result = await apiPost("/api/interact", { id: character_id, target_x, target_y });
              return { content: [{ type: "text", text: resultToMarkdown(result) }] };
            }
          }

          // Bare-hands strike (pick) — requires cardinal adjacency for auto-facing
          const facingDir = cardinalFacing[`${signedDx},${signedDy}`];
          if (!facingDir) throw new Error(`To pick/strike, stand N/S/E/W of the target. Target (${target_x}, ${target_y}) is diagonal. Move to a cardinal side.`);
          await apiPost("/api/command", { id: character_id, command: { type: "face", direction: facingDir } });
          const result = await apiPost("/api/command", { id: character_id, command: { type: "pick" } });
          return { content: [{ type: "text", text: resultToMarkdown(humanizeHarvestResult(result as Record<string, unknown>)) }] };
        }

        // ── Build dispatch (item is an entity_id) ─────────────────────────────
        if (item in BUILD_DEFS) {
          if (dist === 0) throw new Error("Cannot build on your own tile. Target an adjacent tile.");
          if (dist > 1) throw new Error(`Target (${target_x}, ${target_y}) is too far. Move closer to build.`);
          if (!cardinalFacing[`${signedDx},${signedDy}`]) throw new Error(`Building requires cardinal adjacency (N/S/E/W). Target (${target_x}, ${target_y}) is diagonal.`);
          const result = await apiPost("/api/build", { id: character_id, target_x, target_y, entity_id: item });
          return { content: [{ type: "text", text: resultToMarkdown(result) }] };
        }

        // ── Item-based dispatch ────────────────────────────────────────────────
        const itemDef = getItemDef(item);

        if (dist === 0) {
          if (itemDef.eat && mode !== "plant") {
            const result = await apiPost("/api/eat", { id: character_id, item });
            return { content: [{ type: "text", text: resultToMarkdown(humanizeEatResult(result as Record<string, unknown>)) }] };
          }
          if (itemDef.plantsAs) {
            const res = await fetch(`${BASE_URL}/api/plant`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: character_id, seed_item: item }),
            });
            const data = await res.json() as { message?: string; error?: string; planted?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            return { content: [{ type: "text", text: resultToMarkdown(data.message ?? `Planted ${data.planted ?? item}.`) }] };
          }
          if (itemDef.capabilities?.plow) {
            const result = await apiPost("/api/use", { id: character_id, item });
            return { content: [{ type: "text", text: resultToMarkdown(result) }] };
          }
          throw new Error(
            `Cannot use "${item}" on your own tile. ` +
            `To eat food, target self with an edible item. To plant a seed, target self with a seed item. ` +
            `To plow, target self with a plow item. To swing or build, target an adjacent tile.`
          );
        }

        if (dist <= 1) {
          const isFuel = Object.values(DECAY_DEFS).some(d => d.fuelItem === item)
                      || Object.values(REPAIR_DEFS).some(d => d.fuelItem === item);
          if (isFuel) {
            const result = await apiPost("/api/feed", { id: character_id, x: target_x, y: target_y, qty: qty ?? 1 });
            return { content: [{ type: "text", text: resultToMarkdown(humanizeFeedResult(result as Record<string, unknown>)) }] };
          }

          const facingDir = cardinalFacing[`${signedDx},${signedDy}`];
          if (!facingDir) throw new Error(`To swing at a tile, stand N/S/E/W of it (cardinal only). Target (${target_x}, ${target_y}) is diagonal. Move to a cardinal side.`);
          await apiPost("/api/command", { id: character_id, command: { type: "face", direction: facingDir } });
          const result = await apiPost("/api/use", { id: character_id, item });
          return { content: [{ type: "text", text: resultToMarkdown(result) }] };
        }

        throw new Error(`Target (${target_x}, ${target_y}) is too far. You are at (${char.x}, ${char.y}). Move closer first.`);
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "crafting_info",
    "Returns crafting recipes and buildable structures. Without check_inventory, returns all recipes and building costs. With check_inventory: true, shows which recipes you can craft now and what ingredients are missing for the rest.",
    {
      check_inventory: z.boolean().optional().describe("If true, filter by your current inventory — shows craftable recipes and missing ingredients. If false or omitted, returns all recipes and building costs."),
    },
    async ({ check_inventory }) => {
      if (check_inventory) {
        const check = requireCharacter(session);
        if (typeof check !== "string") return check;
        const character_id = check;
        try {
          const result = Island.getInstance().listCraftable(character_id);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          return { content: [{ type: "text", text: (err as Error).message }], isError: true };
        }
      } else {
        const buildable: Record<string, { costs: Record<string, number> }> = {};
        for (const [id, def] of Object.entries(BUILD_DEFS)) {
          buildable[id] = { costs: def.costs };
        }
        return { content: [{ type: "text", text: JSON.stringify({ crafting: RECIPES, building: buildable }, null, 2) }] };
      }
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
        const eatInfo: Record<string, unknown> = { action: "use_on (self tile)", item };
        if (def.eat.hunger) eatInfo.hunger = def.eat.hunger;
        if (def.eat.health) eatInfo.health = def.eat.health;
        if (def.eat.energy) eatInfo.energy = def.eat.energy;
        if (def.eat.consume === false) eatInfo.consumed = false;
        if (def.eat.message) eatInfo.hint = def.eat.message;
        actions.push(eatInfo);
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
      // plant — use_on with self tile (or mode="plant" for food+seed items)
      if (def.plantsAs) {
        const hint = def.eat
          ? `use_on(item="${item}", self tile, mode="plant") — use_on defaults to eating; mode="plant" forces planting`
          : `use_on(item="${item}", self tile)`;
        actions.push({ action: "plant", hint });
      }
      // fuel — use_on on adjacent entity
      if (fuelToEntities[item]) {
        actions.push({ action: "use_on (adjacent entity)", entities: fuelToEntities[item], description: "Feed as fuel to keep these entities going" });
      }
      // build — use_on with entity_id as item on adjacent tile
      const buildable: string[] = [];
      for (const [entityId, buildDef] of Object.entries(BUILD_DEFS)) {
        if (item in buildDef.costs) buildable.push(entityId);
      }
      if (buildable.length) {
        actions.push({ action: "use_on (adjacent tile, entity_id as item)", entities: buildable, description: "Required ingredient to build these structures" });
      }
      // special actions
      for (const special of def.special ?? []) {
        actions.push({ action: "use_on (self or adjacent tile)", item, description: special.description });
      }
      // fallback — always something to do
      if (actions.length === 0) {
        actions.push({ action: "hold", description: "You hold it in your hands. Maybe it has sentimental value." });
      }

      return { content: [{ type: "text", text: JSON.stringify({ item, known, actions }, null, 2) }] };
    }
  );

  server.tool(
    "craft_item",
    "Craft an item using a recipe. Consumes the required ingredients from the character's inventory and adds the output items. Use crafting_info first to confirm the character has the required ingredients.",
    {
      recipe: z.string().min(1).describe("Recipe name to craft (e.g. 'stone_axe')"),
    },
    async ({ recipe }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "craft", recipe } });
        return { content: [{ type: "text", text: resultToMarkdown(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container",
    "Interact with an adjacent container (supply cache, log pile, etc.). Use op 'inspect' to view contents, 'put' to store items, 'take' to retrieve items. You must be next to it.",
    {
      op:        z.enum(["inspect", "put", "take"]).describe("Operation: 'inspect' to view contents, 'put' to store items, 'take' to retrieve items."),
      direction: z.string().describe("Direction to the container: n/s/e/w/ne/nw/se/sw."),
      item:      z.string().optional().describe("Item name — required for put/take (e.g. 'wood')."),
      qty:       z.number().int().positive().optional().describe("Quantity — required for put/take."),
    },
    async ({ op, direction, item, qty }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const pos = resolveTarget(character_id, direction);
        if (!pos) throw new Error("Provide a direction.");
        if (op === "inspect") {
          const result = await apiPost("/api/container/inspect", { id: character_id, x: pos.x, y: pos.y });
          return { content: [{ type: "text", text: resultToMarkdown(result) }] };
        }
        if (!item) throw new Error(`"item" is required for op="${op}".`);
        if (!qty) throw new Error(`"qty" is required for op="${op}".`);
        const endpoint = op === "put" ? "/api/container/put" : "/api/container/take";
        const result = await apiPost(endpoint, { id: character_id, x: pos.x, y: pos.y, item, qty });
        return { content: [{ type: "text", text: resultToMarkdown(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "equip",
    "Equip or unequip an item. Use 'equip' to put on a wearable (armor, clothes) or hold a tool. Use 'unequip' to remove it. Valid slots: hands, head, body, legs, feet.",
    {
      op:   z.enum(["equip", "unequip"]).describe("'equip' to put on an item, 'unequip' to remove it."),
      item: z.string().optional().describe("Item name to equip — required for op='equip'."),
      slot: z.string().describe("Equipment slot: hands, head, body, legs, feet."),
    },
    async ({ op, item, slot }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        if (op === "equip") {
          if (!item) return { content: [{ type: "text", text: `"item" is required for op="equip".` }], isError: true };
          const result = await apiPost("/api/equip", { id: character_id, item, slot });
          return { content: [{ type: "text", text: resultToMarkdown(result) }] };
        } else {
          const result = await apiPost("/api/unequip", { id: character_id, slot });
          return { content: [{ type: "text", text: resultToMarkdown(result) }] };
        }
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

}
