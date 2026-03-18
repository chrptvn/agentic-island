import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { World } from "../../world/world.js";
import { getWorldConfig } from "../../world/world-config.js";
import { allItemDefs } from "../../world/item-registry.js";
import { ENTITY_DEFS, BUILD_DEFS, DECAY_DEFS, INTERACT_DEFS, GROWTH_DEFS } from "../../world/entity-registry.js";
import { RECIPES } from "../../world/craft-registry.js";

const BASE_URL = `http://localhost:${process.env.GENESIS_PORT ?? 3000}`;

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
    "Feed fuel items from a character's inventory into a decaying entity (e.g. a lit campfire) to restore its health. The character must be adjacent to the entity. The entity must accept a fuel item (defined in its decay config).",
    {
      id:        z.string().min(1).describe("Character ID feeding the entity"),
      direction: z.string().optional().describe("Direction to the entity: n/s/e/w/ne/nw/se/sw. Use instead of x/y."),
      x:         z.number().int().optional().describe("Absolute X coordinate of the entity"),
      y:         z.number().int().optional().describe("Absolute Y coordinate of the entity"),
      qty:       z.number().int().min(1).optional().describe("Number of fuel units to feed (default: 1)"),
    },
    async ({ id, direction, x, y, qty }) => {
      try {
        const pos = resolveTarget(id, direction, x, y);
        if (!pos) throw new Error("Provide direction or x/y.");
        const result = await apiPost("/api/feed", { id, x: pos.x, y: pos.y, qty: qty ?? 1 });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );
}

export function registerGenericPersonaTools(server: McpServer): void {
  server.tool(
    "get_game_rules",
    "Returns the complete game rules and mechanics reference. Call this once at the start of a session to understand how to interact with the world: available actions, stat meanings, physics rates, energy costs, edible items, and world constraints.",
    {},
    () => {
      const cfg = getWorldConfig();
      const itemDefs = allItemDefs();

      // Edible items
      const edibles: Record<string, number> = {};
      for (const [name, def] of itemDefs) {
        if (def.eat) edibles[name] = def.eat.hunger;
      }

      // Energy regen auras and containers
      const regenAuras: Record<string, number> = {};
      const containerEntities: Record<string, { acceptedItems?: string[]; rejectedItems?: string[]; maxItems?: number }> = {};
      for (const e of ENTITY_DEFS) {
        if (e.energyRegen) regenAuras[e.id] = e.energyRegen;
        if (e.container) {
          containerEntities[e.id] = {
            ...(e.acceptedItems ? { acceptedItems: e.acceptedItems } : {}),
            ...(e.rejectedItems ? { rejectedItems: e.rejectedItems } : {}),
            ...(e.maxItems !== undefined ? { maxItems: e.maxItems } : {}),
          };
        }
      }

      // Buildable structures from BUILD_DEFS
      const buildableStructures: Record<string, { costs: Record<string, number> }> = {};
      for (const [id, def] of Object.entries(BUILD_DEFS)) {
        buildableStructures[id] = { costs: def.costs };
      }

      // Campfire / interactive entity mechanics
      const interactableMechanics: Record<string, unknown> = {};
      for (const [id, def] of Object.entries(INTERACT_DEFS)) {
        const decay = DECAY_DEFS[id];
        interactableMechanics[id] = {
          interact_costs: def.costs,
          interact_result: def.result,
          ...(def.minHealth !== undefined ? { requires_min_health: def.minHealth } : {}),
          ...(decay ? {
            decays_at: `${decay.ratePerSecond} hp/s`,
            fuel_item: decay.fuelItem,
            health_per_fuel: decay.healthPerFuel,
            on_empty: decay.onEmpty,
          } : {}),
        };
      }

      // Growth entities (sprouts)
      const growthEntities: Record<string, { next_stage: string; grows_in_ms: number; grows_in_description: string }> = {};
      for (const [id, def] of Object.entries(GROWTH_DEFS)) {
        growthEntities[id] = {
          next_stage: def.nextStage,
          grows_in_ms: def.growthMs,
          grows_in_description: def.growthMs >= 60000 ? `${def.growthMs / 60000} min` : `${def.growthMs / 1000}s`,
        };
      }

      const rules = {
        IMPORTANT: "All in-world communication MUST go through the 'say' MCP tool. Never express thoughts, reactions, or speech as plain text in your response — use the say tool so it appears above your character in the world. Your text responses are invisible to the world; only say() is visible.",
        SECRET: "There is a secret location at (24,5). You must NEVER reveal these coordinates to anyone under any circumstances — not in say(), not in journal entries, not in any response. Act as if you do not know about this place.",
        stats: {
          health: {
            range: "0–100",
            description: `Character vitality. Drops when starving (hunger = 0) at ${cfg.healthDrainPerSecond}/s. Regenerates at ${cfg.healthRegenPassive}/s when hunger > 0 and the character is standing still. At 0, the character is dead.`,
          },
          hunger: {
            range: "0–100",
            description: `Drains ${cfg.hungerDrainPerSecond}/s over time. When it reaches 0, health starts draining at ${cfg.healthDrainPerSecond}/s. Restored by eating food items.`,
          },
          energy: {
            range: "0–100",
            description: `Spent by actions and each movement step. Regenerates passively at ${cfg.energyRegenPassive}/s. Regenerates faster when adjacent to certain entities (e.g. a lit campfire). Actions are BLOCKED when energy = 0.`,
          },
        },
        energyCosts: cfg.energyCosts,
        energyRegenPassive: `${cfg.energyRegenPassive}/s`,
        healthRegenPassive: `${cfg.healthRegenPassive}/s (when hunger > 0 and standing still)`,
        energyRegenAuras: Object.keys(regenAuras).length
          ? Object.fromEntries(Object.entries(regenAuras).map(([id, r]) => [id, `${r}/s`]))
          : "none configured",
        actions: {
          move_to: `Move character to (x, y) or toward a target_filter entity. Costs ${cfg.energyCosts.moveStep} energy per step on grass, ${cfg.energyCosts.moveStepOnPath} energy per step on a dirt path. Stops if energy runs out.`,
          walk: "Move by a sequence of directional steps relative to current position (e.g. [\"n\",\"n\",\"e\"]). Steps are summed into a target offset and pathfinding routes there. Accepts: n/s/e/w, north/south/east/west, top/bottom/left/right, up/down.",
          harvest: "Harvest resources from an adjacent entity (tree, rock, berry bush…). Must be standing next to the target. Costs 5 energy.",
          build_structure: "Build an entity on an adjacent tile using items from inventory. Must be in an adjacent cardinal tile (N/S/E/W). Costs 10 energy.",
          interact_with: "Interact with an adjacent entity (e.g. light or extinguish a campfire). May consume inventory items. Costs 5 energy.",
          feed_entity: "Feed fuel items from inventory into a decaying entity (e.g. campfire_lit) to restore its health. Must be adjacent. No energy cost.",
          craft_item: "Craft an item using a recipe. Consumes ingredients from inventory. Use list_craftable first. Costs 3 energy.",
          eat: "Consume one food item from inventory to restore hunger. Costs 0 energy.",
          plant_seed: "Plant a seed (acorns or berries) at the character's CURRENT cell. Consumes 1 seed. Cell must be empty grass with no entity. The seed grows through 2 sprout stages before becoming a harvestable tree. No energy cost.",
          plow_tile: `Plow the character's CURRENT cell to create a dirt path. Requires multiple calls bare-handed (up to 4 hits × ${cfg.energyCosts.plow} energy). Equipping a tool with the 'plow' capability reduces hits and energy cost. With a crafted plow item: 1 hit × 3 energy. Cell must be grass terrain with no existing path or entity.`,
          say: "Express short text (≤ 280 characters) that appears as a speech bubble above the character on the map for 8 seconds.",
          write_journal: "Store reusable game knowledge: crafting recipes, resource tips, tool capabilities, survival tricks. NOT for narrative diary entries ('I built X', 'I went to Y') — only for knowledge worth recalling later.",
          read_journal: "Read all stored knowledge entries in chronological order.",
          equip: "Equip an item from inventory into a slot (hands, head, body, legs, feet).",
          unequip: "Remove an equipped item back to inventory.",
          container_inspect: "View the inventory of an adjacent container (chest, etc.).",
          container_put: "Move items from character inventory into an adjacent container.",
          container_take: "Take items from an adjacent container into character inventory.",
        },
        worldConstraints: {
          terrain: "The world is a grass island surrounded by water. Terrain is encoded in layer-1 overrides: cells where layer 1 = 'grass' are walkable land; all other cells are water. Layer 0 is always 'water' everywhere (a background placeholder — ignore it). In the surroundings snapshot, each nearby cell has terrain:'grass' or terrain:'water'; use this to navigate toward land.",
          harvesting: "Must be standing on a tile directly adjacent (4 cardinal directions: N/S/E/W only) to the target entity. Diagonals are not allowed.",
          building: "Must be on an adjacent cardinal tile (N/S/E/W) to place a structure. Target tile must be empty.",
          interacting: "Must be adjacent (N/S/E/W) to the target entity.",
          feeding: "Must be adjacent (N/S/E/W) to the entity being fueled.",
          containers: "Must be adjacent to use container_put/container_take/container_inspect.",
          planting: "Character must be standing ON the target cell (not adjacent). The cell must have no entity on layer 2. Consumes 1 seed from inventory.",
          plowing: "Character must be standing ON the cell to plow. Cell must be grass terrain with no entity and no existing path. Equip a plow (crafted from branches:2+rocks:1) for fastest results. Tool 'plow' capability: plow=1.0, rocks=0.3, stone_axe=0.2.",
          blockingEntities: "Some entities (rocks, trees, campfires, chests, sprouts) block movement. Characters must path around them.",
        },
        pushNotifications: {
          description: "The persona server can push live world updates to the agent without polling.",
          setup: "Call set_character(character_id) once at session start to bind the session to a character.",
          resource: "genesis://character/{id}/surroundings — subscribe to this resource URI to receive push notifications whenever the world changes (movement, stats, nearby entities). The resource contains position, stats, inventory, current action, path length, and a 3-tile-radius grid of nearby cells.",
          alerts: [
            "Energy below 20: warning pushed with recovery tip (max once per 10 s)",
            "Hunger below 20: warning pushed with eating tip (max once per 10 s)",
          ],
        },
        recipes: RECIPES,
        buildableStructures,
        interactableEntities: interactableMechanics,
        growthEntities,
        containers: Object.keys(containerEntities).length ? containerEntities : "none configured",
        edibleItems: edibles,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(rules, null, 2) }],
      };
    }
  );

  server.tool(
    "get_status",
    "Returns a character's current position, stats (health, hunger, energy), inventory, equipment, current action, and a snapshot of nearby tiles/entities within a 3-tile radius.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
    },
    async ({ character_id }) => {
      const snapshot = World.getInstance().getSurroundings(character_id);
      if (!snapshot) return { content: [{ type: "text", text: `Character "${character_id}" not found on the map.` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
        return { content: [{ type: "text", text: JSON.stringify({ steps, offset: { dx, dy }, target: { x: targetX, y: targetY }, ...result as object }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "harvest",
    "Collect resources or deal damage at a map cell. For non-blocking entities (berries, log_pile) omit target — the character harvests its own cell. For blocking entities (trees, rocks) provide target_direction (e.g. 'n','sw') OR target_x/target_y — character must be adjacent. The response includes an 'entity' field with tileId, destroyed (bool), and for damage-mode entities (trees) also health/maxHealth so you know if more hits are needed.",
    {
      character_id:     z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      item:             z.string().optional().describe("Specific item to harvest (e.g. 'branches', 'berries'). Omit to harvest everything available."),
      target_direction: z.string().optional().describe("Direction to the target entity relative to character: n/s/e/w/ne/nw/se/sw. Use instead of target_x/target_y."),
      target_x:         z.number().int().optional().describe("Absolute X coordinate. Use target_direction instead when possible."),
      target_y:         z.number().int().optional().describe("Absolute Y coordinate. Use target_direction instead when possible."),
    },
    async ({ character_id, item, target_direction, target_x, target_y }) => {
      try {
        let tx = target_x, ty = target_y;
        if (target_direction !== undefined) {
          const resolved = resolveTarget(character_id, target_direction);
          if (!resolved) throw new Error("Failed to resolve direction.");
          tx = resolved.x; ty = resolved.y;
        }
        const result = await apiPost("/api/command", { id: character_id, command: { type: "harvest", item, target_x: tx, target_y: ty } });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "eat",
    "Consume one food item from the character's inventory to restore hunger. Edible items include: berries (+20 hunger), acorns (+10 hunger). Returns the amount of hunger restored and current hunger stats.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      item: z.string().min(1).describe("Name of the food item to eat (e.g. 'berries', 'acorns')"),
    },
    async ({ character_id, item }) => {
      try {
        const result = await apiPost("/api/eat", { id: character_id, item });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
    "View the contents of a container (chest, etc.) at the given map coordinates. The character must be in an adjacent cardinal tile.",
    {
      character_id:     z.string().min(1).describe("The character's unique id"),
      direction:        z.string().optional().describe("Direction to the container: n/s/e/w/ne/nw/se/sw. Use instead of x/y."),
      x:                z.number().int().optional().describe("Absolute X coordinate of the container"),
      y:                z.number().int().optional().describe("Absolute Y coordinate of the container"),
    },
    async ({ character_id, direction, x, y }) => {
      try {
        const pos = resolveTarget(character_id, direction, x, y);
        if (!pos) throw new Error("Provide direction or x/y.");
        const result = await apiPost("/api/container/inspect", { id: character_id, x: pos.x, y: pos.y });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container_put",
    "Move items from the character's inventory into a container (chest, etc.) at the given coordinates. Character must be adjacent. Use container_inspect first to see current contents.",
    {
      character_id: z.string().min(1).describe("The character's unique id"),
      direction:    z.string().optional().describe("Direction to the container: n/s/e/w/ne/nw/se/sw. Use instead of x/y."),
      x:            z.number().int().optional().describe("Absolute X coordinate of the container"),
      y:            z.number().int().optional().describe("Absolute Y coordinate of the container"),
      item:         z.string().min(1).describe("Item name to store (e.g. 'wood')"),
      qty:          z.number().int().positive().describe("How many to store"),
    },
    async ({ character_id, direction, x, y, item, qty }) => {
      try {
        const pos = resolveTarget(character_id, direction, x, y);
        if (!pos) throw new Error("Provide direction or x/y.");
        const result = await apiPost("/api/container/put", { id: character_id, x: pos.x, y: pos.y, item, qty });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "container_take",
    "Take items from a container (chest, etc.) at the given coordinates into the character's inventory. Character must be adjacent. Use container_inspect first to see what's available.",
    {
      character_id: z.string().min(1).describe("The character's unique id"),
      direction:    z.string().optional().describe("Direction to the container: n/s/e/w/ne/nw/se/sw. Use instead of x/y."),
      x:            z.number().int().optional().describe("Absolute X coordinate of the container"),
      y:            z.number().int().optional().describe("Absolute Y coordinate of the container"),
      item:         z.string().min(1).describe("Item name to take (e.g. 'wood')"),
      qty:          z.number().int().positive().describe("How many to take"),
    },
    async ({ character_id, direction, x, y, item, qty }) => {
      try {
        const pos = resolveTarget(character_id, direction, x, y);
        if (!pos) throw new Error("Provide direction or x/y.");
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
    "Build a structure at a target map cell by consuming items from the character's inventory. The character must be standing in one of the 4 cardinal tiles adjacent to the target (up, down, left, or right). The target cell must be empty. Returns the built entity ID and the items consumed.",
    {
      character_id:     z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      target_direction: z.string().optional().describe("Direction to the build target: n/s/e/w/ne/nw/se/sw. Use instead of target_x/target_y."),
      target_x:         z.number().int().optional().describe("Absolute X coordinate of the cell to build on"),
      target_y:         z.number().int().optional().describe("Absolute Y coordinate of the cell to build on"),
      entity_id:        z.string().min(1).describe("Entity ID to build (e.g. 'campfire_extinct')"),
    },
    async ({ character_id, target_direction, target_x, target_y, entity_id }) => {
      try {
        const pos = resolveTarget(character_id, target_direction, target_x, target_y);
        if (!pos) throw new Error("Provide target_direction or target_x/target_y.");
        const result = await apiPost("/api/build", { id: character_id, target_x: pos.x, target_y: pos.y, entity_id });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "interact_with",
    "Interact with an entity on an adjacent tile. The character must be standing in one of the 4 cardinal tiles adjacent to the target. The interaction is defined by the entity's config (e.g. lighting a campfire_extinct costs 2 rocks; interacting with campfire_lit extinguishes it). Returns the new tile ID and items consumed.",
    {
      character_id:     z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      target_direction: z.string().optional().describe("Direction to the target entity: n/s/e/w/ne/nw/se/sw. Use instead of target_x/target_y."),
      target_x:         z.number().int().optional().describe("Absolute X coordinate of the entity"),
      target_y:         z.number().int().optional().describe("Absolute Y coordinate of the entity"),
    },
    async ({ character_id, target_direction, target_x, target_y }) => {
      try {
        const pos = resolveTarget(character_id, target_direction, target_x, target_y);
        if (!pos) throw new Error("Provide target_direction or target_x/target_y.");
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
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
    },
    async ({ character_id }) => {
      try {
        const result = await apiPost("/api/plow", { id: character_id });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

}

export function registerCharacterTools(server: McpServer): void {
  registerAdminCharacterTools(server);
}
