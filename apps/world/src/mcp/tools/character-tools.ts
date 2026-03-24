import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { World } from "../../world/world.js";
import { allItemDefs } from "../../world/item-registry.js";
import { ENTITY_DEFS, BUILD_DEFS, DECAY_DEFS, INTERACT_DEFS, GROWTH_DEFS } from "../../world/entity-registry.js";
import { RECIPES } from "../../world/craft-registry.js";
import {
  humanizeSurroundings, humanizeMoveResult, humanizeHarvestResult,
  humanizeEatResult, humanizeFeedResult, humanizePlowResult, stripCoordinates,
} from "../humanize.js";

const BASE_URL = `http://localhost:${process.env.WORLD_PORT ?? 3002}`;

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
    const char = World.getInstance().characters.get(character_id);
    if (!char) throw new Error(`Character "${character_id}" not found.`);
    return { x: char.x + offset[0], y: char.y + offset[1] };
  }
  if (target_x !== undefined && target_y !== undefined) return { x: target_x, y: target_y };
  return null;
}

export function registerAdminCharacterTools(server: McpServer): void {
  server.tool(
    "spawn_character",
    "Spawn a human character at (x, y) on the map. The cell must be a grass tile with no existing entity on layer 2. Each character has a unique id (default: 'hero') and starts with full health, hunger, and energy stats plus an empty inventory and goal.",
    {
      x:  z.number().int().describe("X coordinate to spawn at"),
      y:  z.number().int().describe("Y coordinate to spawn at"),
      id: z.string().min(1).optional().describe("Unique character name (default: 'hero')"),
    },
    async ({ x, y, id }) => {
      try {
        const result = await apiPost("/api/spawn", { x, y, id });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "despawn_character",
    "Remove a character from the map and delete all their data (position, inventory, equipment). This is permanent.",
    {
      id: z.string().min(1).describe("The character's unique id (e.g. 'hero')"),
    },
    async ({ id }) => {
      try {
        const result = await apiPost("/api/despawn", { id });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "list_characters",
    "List all characters currently on the map with their positions and stats.",
    {
      id: z.string().optional().describe("Filter to a specific character ID (e.g. 'hero'). Omit to list all."),
    },
    async ({ id }) => {
      try {
        const characters = await apiGet("/api/characters") as Record<string, unknown>;
        if (id) {
          const char = characters[id];
          if (!char) return { content: [{ type: "text", text: `No character with id "${id}".` }], isError: true };
          return { content: [{ type: "text", text: JSON.stringify({ id, ...char as object }, null, 2) }] };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ total: Object.keys(characters).length, characters }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );
}

export function registerSpawnPositionsTools(server: McpServer): void {
  server.tool(
    "list_spawn_positions",
    "Return all valid positions on the current map where a character can be spawned (grass tile, no blocking entity on layer 2, no character already present). Use this to pick a spawn point before calling spawn_character.",
    {},
    async () => {
      const positions = World.getInstance().getValidSpawnPositions();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: positions.length, positions }, null, 2),
          },
        ],
      };
    }
  );
}

export function registerFeedEntityTools(server: McpServer): void {
  server.tool(
    "feed_entity",
    "Feed fuel items from your inventory into an adjacent entity (e.g. wood into a lit campfire) to keep it going. You must be next to it.",
    {
      id:        z.string().min(1).describe("Character ID feeding the entity"),
      direction: z.string().describe("Direction to the entity: n/s/e/w/ne/nw/se/sw."),
      qty:       z.number().int().min(1).optional().describe("Number of fuel units to feed (default: 1)"),
    },
    async ({ id, direction, qty }) => {
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

export function registerGenericPersonaTools(server: McpServer): void {
  server.tool(
    "get_game_rules",
    "Returns a guide to how the world works — what you can do, how things feel, and how to survive. Call this once at the start of a session.",
    {},
    () => {
      const itemDefs = allItemDefs();

      // Edible items (narrative)
      const edibleList: string[] = [];
      for (const [name, def] of itemDefs) {
        if (def.eat) edibleList.push(name.replace(/_/g, " "));
      }

      // Regen auras (narrative)
      const regenSources: string[] = [];
      for (const e of ENTITY_DEFS) {
        if (e.energyRegen) regenSources.push(e.id.replace(/_/g, " "));
      }

      // Buildable structures
      const buildable: Record<string, string> = {};
      for (const [id, def] of Object.entries(BUILD_DEFS)) {
        const costs = Object.entries(def.costs).map(([item, qty]) => `${qty} ${item.replace(/_/g, " ")}`).join(" and ");
        buildable[id.replace(/_/g, " ")] = `requires ${costs}`;
      }

      // Interactive entities
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

      // Growth stages
      const growth: Record<string, string> = {};
      for (const [id, def] of Object.entries(GROWTH_DEFS)) {
        const time = def.growthMs >= 60000 ? `about ${Math.round(def.growthMs / 60000)} minutes` : `about ${Math.round(def.growthMs / 1000)} seconds`;
        growth[id.replace(/_/g, " ")] = `grows into ${def.nextStage.replace(/_/g, " ")} in ${time}`;
      }

      const rules = {
        IMPORTANT: "All in-world communication MUST go through the 'say' tool. Never express thoughts, reactions, or speech as plain text — use say() so it appears above your character. Your text responses are invisible to the world; only say() is visible.",
        overview: "You are a character on a grass island surrounded by water. You need to eat to survive, rest to recover energy, and can craft tools, build structures, and interact with the world around you.",
        survival: {
          health: "You can feel how healthy you are. If you stop eating, you'll starve and your health will drop. Rest while fed to recover.",
          hunger: "You get hungrier over time. Eat berries or acorns to satisfy your hunger. If you starve completely, your health suffers.",
          energy: "Every action and step costs energy. You recover energy by standing still. Resting near a campfire helps you recover much faster. When exhausted, you can't do anything until you rest.",
        },
        actions: {
          move_to: "Walk toward something (e.g. 'trees', 'berries', 'rocks'). You'll automatically find a path. Walking on dirt paths is less tiring.",
          walk: "Move in cardinal directions (n/s/e/w). Steps are combined so 'n,n,e' walks 2 north and 1 east.",
          harvest: "Gather resources from things next to you — pick berries from bushes, chop trees for wood (need an axe), collect rocks.",
          build_structure: "Build things on an empty adjacent tile using materials from your inventory.",
          interact_with: "Interact with nearby things — light or extinguish a campfire, for example.",
          feed_entity: "Feed fuel (like wood) into a campfire to keep it burning.",
          craft_item: "Craft tools and items from materials in your inventory. Use list_craftable to see what you can make.",
          eat: "Eat food from your inventory to satisfy hunger.",
          plant_seed: "Plant a seed where you're standing. It grows into a tree over time.",
          plow_tile: "Dig up the ground where you're standing to create a dirt path. Easier with the right tool.",
          equip: "Equip an item (tool, weapon) into your hands or wear it.",
          unequip: "Put an equipped item back in your inventory.",
          say: "Speak aloud (appears as speech bubble, max 280 characters).",
          container_inspect: "Look inside an adjacent container (chest, log pile).",
          container_put: "Put items into an adjacent container.",
          container_take: "Take items from an adjacent container.",
          write_journal: "Record useful knowledge for later — crafting tips, discoveries, survival tricks.",
          read_journal: "Read your saved knowledge entries.",
        },
        world: {
          terrain: "The island is grass surrounded by water. You can only walk on grass. Dirt paths make walking easier.",
          adjacency: "To harvest, build, interact, or use containers, you must be standing next to the target (N/S/E/W).",
          planting: "To plant or plow, you must be standing ON the tile.",
          blocking: "Trees, rocks, campfires, chests, and sprouts block movement — walk around them.",
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

      return {
        content: [{ type: "text", text: JSON.stringify(rules, null, 2) }],
      };
    }
  );

  server.tool(
    "get_status",
    "Returns how the character feels (health, hunger, energy as sensations), what they are carrying, their equipment, and a description of the 8 tiles immediately surrounding them.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
    },
    async ({ character_id }) => {
      const snapshot = World.getInstance().getSurroundings(character_id);
      if (!snapshot) return { content: [{ type: "text", text: `Character "${character_id}" not found on the map.` }], isError: true };
      const humanized = humanizeSurroundings(snapshot as Parameters<typeof humanizeSurroundings>[0]);
      return { content: [{ type: "text", text: JSON.stringify(humanized, null, 2) }] };
    }
  );

  server.tool(
    "move_to",
    "Walk a character to the nearest cell matching any of the given filters. For blocking entities (trees, rocks) the character automatically stops at the adjacent cell rather than walking onto it. Use list_target_filters to see all valid tokens. If nothing matches, returns found:false with a 'nearby' map of what IS within 15 tiles so you can choose an alternative target.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      target_filter: z.array(z.string()).describe(
        "Walk to the nearest cell matching ANY of these tokens. Each token can be: a searchTarget group (e.g. 'trees', 'berries', 'rocks'), an entity tile ID (e.g. 'young_tree'), a tile category (e.g. 'vegetation'), or a terrain type ('grass', 'water'). Example: [\"berries\"] or [\"trees\"]"
      ),
    },
    async ({ character_id, target_filter }) => {
      try {
        const result = await apiPost("/api/command", { id: character_id, command: { type: "move_to", target_filter } });
        return { content: [{ type: "text", text: JSON.stringify(humanizeMoveResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
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
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      steps: z.array(z.string()).min(1).describe("Ordered list of direction steps, e.g. [\"n\",\"n\",\"e\",\"n\",\"e\"]. Accepts: n/s/e/w, north/south/east/west, top/bottom/left/right, up/down."),
    },
    async ({ character_id, steps }) => {
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
      const character = World.getInstance().characters.get(character_id);
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
    "harvest",
    "Collect resources or deal damage to a nearby entity. For non-blocking entities (berries on the ground) omit target — harvests your current tile. For blocking entities (trees, rocks) provide the direction to the target (e.g. 'n', 'sw') — you must be adjacent.",
    {
      character_id:     z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      item:             z.string().optional().describe("Specific item to harvest (e.g. 'branches', 'berries'). Omit to harvest everything available."),
      target_direction: z.string().optional().describe("Direction to the target entity relative to character: n/s/e/w/ne/nw/se/sw."),
    },
    async ({ character_id, item, target_direction }) => {
      try {
        let tx: number | undefined, ty: number | undefined;
        if (target_direction !== undefined) {
          const resolved = resolveTarget(character_id, target_direction);
          if (!resolved) throw new Error("Failed to resolve direction.");
          tx = resolved.x; ty = resolved.y;
        }
        const result = await apiPost("/api/command", { id: character_id, command: { type: "harvest", item, target_x: tx, target_y: ty } });
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
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      item: z.string().min(1).describe("Name of the food item to eat (e.g. 'berries', 'acorns')"),
    },
    async ({ character_id, item }) => {
      try {
        const result = await apiPost("/api/eat", { id: character_id, item });
        return { content: [{ type: "text", text: JSON.stringify(humanizeEatResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "list_craftable",
    "Returns all recipes split into craftable and not-craftable for a character, based on their current inventory. Craftable entries show available ingredients. Not-craftable entries show how many of each ingredient is still missing.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
    },
    async ({ character_id }) => {
      try {
        const result = World.getInstance().listCraftable(character_id);
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
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      recipe: z.string().min(1).describe("Recipe name to craft (e.g. 'stone_axe')"),
    },
    async ({ character_id, recipe }) => {
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
      character_id:     z.string().min(1).describe("The character's unique id"),
      direction:        z.string().describe("Direction to the container: n/s/e/w/ne/nw/se/sw."),
    },
    async ({ character_id, direction }) => {
      try {
        const pos = resolveTarget(character_id, direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/container/inspect", { id: character_id, x: pos.x, y: pos.y });
        return { content: [{ type: "text", text: JSON.stringify(stripCoordinates(result), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container_put",
    "Move items from your inventory into an adjacent container (chest, etc.).",
    {
      character_id: z.string().min(1).describe("The character's unique id"),
      direction:    z.string().describe("Direction to the container: n/s/e/w/ne/nw/se/sw."),
      item:         z.string().min(1).describe("Item name to store (e.g. 'wood')"),
      qty:          z.number().int().positive().describe("How many to store"),
    },
    async ({ character_id, direction, item, qty }) => {
      try {
        const pos = resolveTarget(character_id, direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/container/put", { id: character_id, x: pos.x, y: pos.y, item, qty });
        return { content: [{ type: "text", text: JSON.stringify(stripCoordinates(result), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container_take",
    "Take items from an adjacent container (chest, etc.) into your inventory.",
    {
      character_id: z.string().min(1).describe("The character's unique id"),
      direction:    z.string().describe("Direction to the container: n/s/e/w/ne/nw/se/sw."),
      item:         z.string().min(1).describe("Item name to take (e.g. 'wood')"),
      qty:          z.number().int().positive().describe("How many to take"),
    },
    async ({ character_id, direction, item, qty }) => {
      try {
        const pos = resolveTarget(character_id, direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/container/take", { id: character_id, x: pos.x, y: pos.y, item, qty });
        return { content: [{ type: "text", text: JSON.stringify(stripCoordinates(result), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "equip",
    "Equip an item from a character's inventory into a slot. The 'hands' slot requires the item to have equippable:true in item-defs.json. Body slots (head/body/legs/feet) require the item to have a matching wearable attribute. If the slot is occupied the current item is automatically returned to inventory.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      item: z.string().min(1).describe("Item name from inventory to equip (e.g. 'stone_axe')"),
      slot: z.enum(["hands", "head", "body", "legs", "feet"]).describe("Equipment slot to fill"),
    },
    async ({ character_id, item, slot }) => {
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
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      slot: z.enum(["hands", "head", "body", "legs", "feet"]).describe("Equipment slot to unequip"),
    },
    async ({ character_id, slot }) => {
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
      character_id:     z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      target_direction: z.string().describe("Direction to the build target: n/s/e/w."),
      entity_id:        z.string().min(1).describe("Entity ID to build (e.g. 'campfire_extinct')"),
    },
    async ({ character_id, target_direction, entity_id }) => {
      try {
        const pos = resolveTarget(character_id, target_direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/build", { id: character_id, target_x: pos.x, target_y: pos.y, entity_id });
        return { content: [{ type: "text", text: JSON.stringify(stripCoordinates(result), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "interact_with",
    "Interact with an entity on an adjacent tile (e.g. light a campfire, extinguish it). You must be next to the target (N/S/E/W).",
    {
      character_id:     z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      target_direction: z.string().describe("Direction to the target entity: n/s/e/w/ne/nw/se/sw."),
    },
    async ({ character_id, target_direction }) => {
      try {
        const pos = resolveTarget(character_id, target_direction);
        if (!pos) throw new Error("Provide a direction.");
        const result = await apiPost("/api/interact", { id: character_id, target_x: pos.x, target_y: pos.y });
        return { content: [{ type: "text", text: JSON.stringify(stripCoordinates(result), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "plow_tile",
    "Plow the character's CURRENT cell to create a dirt path. The cell must be grass with no entity on it. Requires multiple calls to complete bare-handed; equipping a plow or digging tool reduces the number of hits and energy cost needed. Returns progress, total required, whether the path was completed, and hits remaining.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
    },
    async ({ character_id }) => {
      try {
        const result = await apiPost("/api/plow", { id: character_id });
        return { content: [{ type: "text", text: JSON.stringify(humanizePlowResult(result as Record<string, unknown>), null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

}

export function registerCharacterTools(server: McpServer): void {
  registerAdminCharacterTools(server);
}
