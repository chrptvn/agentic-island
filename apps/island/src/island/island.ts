import { EventEmitter } from "events";
import { watch } from "fs";
import { IslandMap, type MapOptions, type MapSize, MAP_SIZE_PRESETS } from "./map.js";
import {
  loadState, saveState,
  loadOverrides, saveOverride, saveOverridesBatch, clearTileOverride, clearOverrides, loadOverridesVersion,
  loadEntityStats, saveEntityStat, deleteEntityStat, saveEntityStatsBatch, clearEntityStats,
  loadCharacters, saveCharacter, deleteCharacter, loadCharacter, runTransaction,
} from "../persistence/db.js";
import { TILE_BY_ID, reloadTiles, CONFIG_PATH_TILES, TILE_SHEET, TILE_SIZE, TILE_GAP, SHEET_OVERRIDES } from "./tile-registry.js";
import { buildIslandLayer1, buildVegetationLayer, isPathTileId, isWalkableGround, autotilePathCell } from "./autotile.js";
import type { EntityStats } from "./entity-registry.js";
import { HARVEST_DEFS, BUILD_DEFS, INTERACT_DEFS, DECAY_DEFS, REPAIR_DEFS, BLOCKING_IDS, ENTITY_DEFAULTS, ENTITY_DEF_BY_ID, ITEM_IDS, GROWTH_DEFS, getResources, applyRandomStats, reloadEntities, CONFIG_PATH_ENTITIES } from "./entity-registry.js";
import { type CharacterStats, type CharacterInstance, type Point, type EquipmentSlot, getDefaultCharacterStats, defaultEquipment } from "./character-registry.js";
import { findPath } from "./pathfinder.js";
import { resolveTargetFilter } from "./goal-executor.js";
import { RECIPES, reloadRecipes, CONFIG_PATH_RECIPES } from "./craft-registry.js";
import { isEquippable, isWearable, hasCapability, getCapabilityLevel, getEatDef, reloadItemDefs, CONFIG_PATH_ITEMS } from "./item-registry.js";
import { getIslandConfig, reloadIslandConfig, CONFIG_PATH_ISLAND } from "./island-config.js";
import { generateThumbnail } from "./thumbnail.js";

const MAP_STATE_KEY = "map_config";

const TERRAIN_TYPES = new Set(["grass", "water"]);

/** Returns true if the given tile ID is an inventory item that cannot be placed on the map. */
function isItemTile(tileId: string): boolean {
  // Check entity registry (has item:true flag)
  if (ITEM_IDS.has(tileId)) return true;
  // Check tile registry (category === "item")
  const tileDef = TILE_BY_ID.get(tileId);
  return tileDef?.category === "item";
}

export class Island extends EventEmitter {
  private static instance: Island;

  map: IslandMap;
  private overrides: Map<string, string[]> = new Map();
  private overridesVersion: number = 0;
  entityStats: Map<string, EntityStats> = new Map();
  characters: Map<string, CharacterInstance> = new Map();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private regrowTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private growthTimers:  Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pathProgress:  Map<string, number> = new Map();
  private grassGrid: boolean[][] = [];

  private constructor() {
    super();
    const saved = loadState<MapOptions>(MAP_STATE_KEY);
    if (!saved) {
      const envSize = process.env.ISLAND_SIZE as MapSize | undefined;
      const size = envSize && MAP_SIZE_PRESETS[envSize] ? envSize : undefined;
      this.map = new IslandMap(size ? { size } : undefined);
    } else {
      this.map = new IslandMap(saved);
    }
    this.overrides = loadOverrides();
    this.overridesVersion = loadOverridesVersion();
    this.entityStats = loadEntityStats() as Map<string, EntityStats>;

    for (const c of loadCharacters()) {
      const loadedStats: CharacterStats = { ...getDefaultCharacterStats(), ...(c.stats as Partial<CharacterStats>) };
      // backwards-compat: existing DB rows won't have equipment field
      if (!loadedStats.equipment) loadedStats.equipment = defaultEquipment();
      this.characters.set(c.id, {
        id: c.id, x: c.x, y: c.y,
        tileId: c.tileId,
        hairTileId: c.hairTileId,
        beardTileId: c.beardTileId,
        stats: loadedStats,
        path: c.path as Point[],
        action: c.action,
        ...(c.shelter ? { shelter: c.shelter } : {}),
      });
    }

    if (!saved) {
      saveState(MAP_STATE_KEY, this.mapConfig());
      this.applyIslandOverrides();
    }

    // Re-arm growth timers for any sprouts that survived a server restart
    this._rearmGrowthTimers();
    // Re-arm regrow timers for entities in the empty (no-fruit) state after a restart
    this._rearmRegrowTimers();

    this.startGameTick();
  }

  static getInstance(): Island {
    if (!Island.instance) {
      Island.instance = new Island();
    }
    return Island.instance;
  }

  /** Returns the map JSON with overrides, entity stats, and characters applied. */
  toJSON() {
    const base = this.map.toJSON(this.overrides);
    const entities: Record<string, EntityStats> = {};
    for (const [key, stats] of this.entityStats) {
      entities[key] = stats;
    }
    const characters: Record<string, Omit<CharacterInstance, "id">> = {};
    for (const [id, c] of this.characters) {
      const s = c.stats;
      const roundedStats = {
        ...s,
        health: Math.floor(s.health),
        hunger: Math.floor(s.hunger),
        energy: Math.floor(s.energy),
      };
      const now = Date.now();
      const speech = (c.speech && c.speech.expiresAt > now) ? c.speech.text : undefined;
      characters[id] = { x: c.x, y: c.y, tileId: c.tileId, hairTileId: c.hairTileId, beardTileId: c.beardTileId, stats: roundedStats, path: c.path, action: c.action, ...(speech ? { speech: { text: speech, expiresAt: c.speech!.expiresAt } } : {}) };
    }
    return { ...base, entities, characters };
  }

  // ── Hub-connector getters ──────────────────────────────────────────────────

  getMap() {
    const json = this.map.toJSON(this.overrides);
    return {
      width: json.width,
      height: json.height,
      seed: json.seed,
      terrain: json.grid,
    };
  }

  getTileRegistry(): Record<string, object> {
    const registry: Record<string, object> = {};
    for (const [id, def] of TILE_BY_ID) {
      const sheet = def.sheet ?? TILE_SHEET;
      const sheetOverride = SHEET_OVERRIDES[sheet] ?? {};
      const tileSize = sheetOverride.tileSize ?? TILE_SIZE;
      const gap = sheetOverride.tileGap ?? TILE_GAP;
      registry[id] = {
        id: def.id,
        col: def.col,
        row: def.row,
        sheet,
        tileSize,
        gap,
        category: def.category,
        layer: def.layer,
        frames: def.frames?.length,
        fps: def.fps,
      };
    }
    return registry;
  }

  getEntities(): Array<{ x: number; y: number; tileId: string; stats: EntityStats; inventory?: { item: string; qty: number }[]; occupants?: string[] }> {
    const result: Array<{ x: number; y: number; tileId: string; stats: EntityStats; inventory?: { item: string; qty: number }[]; occupants?: string[] }> = [];

    // Build a map of tent base positions → occupant character IDs
    const tentOccupants = new Map<string, string[]>();
    for (const [, c] of this.characters) {
      if (c.shelter) {
        const list = tentOccupants.get(c.shelter) ?? [];
        list.push(c.id);
        tentOccupants.set(c.shelter, list);
      }
    }

    for (const [key, stats] of this.entityStats) {
      const [x, y] = key.split(",").map(Number);
      const layers = this.overrides.get(key);
      // Entity base tiles are on layer 3 (index 3 in the overrides array)
      const tileId = layers?.[3];
      if (tileId && tileId !== "") {
        const inv = (stats as unknown as { inventory?: { item: string; qty: number }[] }).inventory;
        const occupants = tentOccupants.get(key);
        result.push({ x, y, tileId, stats, ...(inv ? { inventory: inv } : {}), ...(occupants ? { occupants } : {}) });

        // For quad entities, also emit EntityInstance entries for the 3 extra tiles
        const def = ENTITY_DEF_BY_ID.get(tileId);
        if (def?.tileType === "quad") {
          const extras: Array<{ dx: number; dy: number; tid: string | undefined }> = [
            { dx: 0, dy: -1, tid: def.topTileId },
            { dx: 1, dy: 0, tid: def.rightTileId },
            { dx: 1, dy: -1, tid: def.topRightTileId },
          ];
          for (const { dx, dy, tid } of extras) {
            if (tid) {
              result.push({ x: x + dx, y: y + dy, tileId: tid, stats, ...(occupants ? { occupants } : {}) });
            }
          }
        }
      }
    }
    return result;
  }

  getCharacters(): Array<object> {
    const result: Array<object> = [];
    const now = Date.now();
    for (const [, c] of this.characters) {
      const speech = (c.speech && c.speech.expiresAt > now) ? { text: c.speech.text, expiresAt: c.speech.expiresAt } : undefined;
      result.push({
        id: c.id,
        x: c.x,
        y: c.y,
        tileId: c.tileId,
        ...(c.hairTileId ? { hairTileId: c.hairTileId } : {}),
        ...(c.beardTileId ? { beardTileId: c.beardTileId } : {}),
        stats: {
          health: Math.floor(c.stats.health),
          hunger: Math.floor(c.stats.hunger),
          energy: Math.floor(c.stats.energy),
          maxHealth: c.stats.maxHealth,
          maxHunger: c.stats.maxHunger,
          maxEnergy: c.stats.maxEnergy,
        },
        inventory: c.stats.inventory ?? [],
        equipment: c.stats.equipment ?? {},
        goal: c.stats.goal ?? "",
        ...(speech ? { speech } : {}),
        ...(c.shelter ? { shelter: c.shelter } : {}),
      });
    }
    return result;
  }

  /** Look up a character by ID. Returns position and basic info, or null if not found. */
  getCharacter(id: string): { id: string; x: number; y: number } | null {
    const c = this.characters.get(id);
    return c ? { id: c.id, x: c.x, y: c.y } : null;
  }

  getOverrides(): Array<{ x: number; y: number; layer: number; tileId: string }> {
    const result: Array<{ x: number; y: number; layer: number; tileId: string }> = [];
    for (const [key, layers] of this.overrides) {
      const [x, y] = key.split(",").map(Number);
      for (let layer = 0; layer < layers.length; layer++) {
        const tileId = layers[layer];
        if (tileId && tileId !== "") {
          result.push({ x, y, layer, tileId });
        }
      }
    }
    return result;
  }

  /**
   * Returns a snapshot of the character's surroundings within `radius` tiles.
   * Includes terrain type, path tiles, and entity IDs for nearby cells.
   * Nearby cells use relative direction + steps instead of absolute coordinates.
   */
  getSurroundings(characterId: string, radius = 3): object | null {
    const character = this.characters.get(characterId);
    if (!character) return null;
    const { x, y } = character;

    function compassDir(dx: number, dy: number): string {
      const adx = Math.abs(dx), ady = Math.abs(dy);
      // Pure cardinals
      if (dx === 0) return dy < 0 ? "n" : "s";
      if (dy === 0) return dx > 0 ? "e" : "w";
      // Diagonals — if one axis dominates by 2x, use cardinal; else diagonal
      if (adx >= ady * 2) return dx > 0 ? "e" : "w";
      if (ady >= adx * 2) return dy < 0 ? "n" : "s";
      return `${dy < 0 ? "n" : "s"}${dx > 0 ? "e" : "w"}`;
    }

    const nearby: Array<{ direction: string; steps: number; dx: number; dy: number; terrain: string; entity?: string; path?: true; character?: string }> = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const cx = x + dx, cy = y + dy;
        // Bounds check — map.getTile returns null for out-of-bounds
        if (!this.map.getTile(cx, cy)) continue;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        // Terrain is tracked via layer-1 overrides ("grass" tile = walkable land)
        const l1 = this.getLayer(cx, cy, 1);
        const terrain = l1 === "grass" ? "grass" : "water";
        const cell: (typeof nearby)[0] = { direction: compassDir(dx, dy), steps, dx, dy, terrain };
        const entity = this.getLayer(cx, cy, 3);
        if (entity) cell.entity = entity;
        if (this.getLayer(cx, cy, 2)) cell.path = true;
        const charHere = [...this.characters.values()].find(c => c !== character && c.x === cx && c.y === cy);
        if (charHere) cell.character = charHere.id;
        nearby.push(cell);
      }
    }

    // Terrain for current cell
    const standingL1 = this.getLayer(x, y, 1);
    const standingTerrain = standingL1 === "grass" ? "grass" : "water";
    return {
      character: characterId,
      position: { x, y },
      standing: {
        terrain: standingTerrain,
        ...(this.getLayer(x, y, 3) ? { entity: this.getLayer(x, y, 3) } : {}),
        ...(this.getLayer(x, y, 2) ? { path: true } : {}),
      },
      stats:      character.stats,
      action:     character.action,
      pathLength: character.path.length,
      nearby,
    };
  }

  /** Reload map and overrides from DB if another process changed them. */
  syncFromDb(): boolean {
    const saved = loadState<MapOptions>(MAP_STATE_KEY);
    const dbOverridesVersion = loadOverridesVersion();
    const seedChanged = saved && saved.seed !== this.map.seed;
    const overridesChanged = dbOverridesVersion !== this.overridesVersion;

    if (seedChanged || overridesChanged) {
      if (seedChanged) this.map = new IslandMap(saved!);
      this.overrides = loadOverrides();
      this.overridesVersion = dbOverridesVersion;
      this.entityStats = loadEntityStats() as Map<string, EntityStats>;
      this.emit("map:updated", this.map);
      return true;
    }
    return false;
  }

  regenerateMap(options?: MapOptions): IslandMap {
    this.map = new IslandMap(options);
    clearOverrides();
    clearEntityStats();
    this.overrides.clear();
    this.entityStats.clear();
    this.applyIslandOverrides();
    this.overridesVersion = loadOverridesVersion();
    saveState(MAP_STATE_KEY, this.mapConfig());
    this.emit("map:updated", this.map);
    return this.map;
  }

  /** Compute and persist the grass-island layer-1 tiles + vegetation layer 2/3. */
  private applyIslandOverrides(): void {
    const { overrides: islandTiles, grassGrid } = buildIslandLayer1(this.map.width, this.map.height, this.map.seed);
    this.grassGrid = grassGrid;

    const { tileOverrides: vegTiles, entityStats: vegStats } =
      buildVegetationLayer(this.map.width, this.map.height, this.map.seed, grassGrid);

    const allTiles = [...islandTiles, ...vegTiles];
    saveOverridesBatch(allTiles);
    saveEntityStatsBatch(vegStats);

    for (const { x, y, layer, tileId } of allTiles) {
      const key = `${x},${y}`;
      const layers = this.overrides.get(key) ?? [];
      while (layers.length <= layer) layers.push("");
      layers[layer] = tileId;
      this.overrides.set(key, layers);
    }
    for (const { x, y, stats } of vegStats) {
      this.entityStats.set(`${x},${y}`, stats);
    }
    this.overridesVersion = loadOverridesVersion();
  }

  /**
   * Generate a base64-encoded PNG thumbnail of the current world map.
   * If the grassGrid is not cached (e.g. loaded from DB), it is regenerated
   * deterministically from the map seed.
   */
  getThumbnailBase64(): string {
    if (this.grassGrid.length === 0) {
      const { grassGrid } = buildIslandLayer1(this.map.width, this.map.height, this.map.seed);
      this.grassGrid = grassGrid;
    }
    return generateThumbnail(this.grassGrid, this.overrides, this.map.width, this.map.height);
  }

  /** Place a specific tile at (x, y) on the given layer. */
  setTile(x: number, y: number, layer: number, tileId: string): void {
    if (layer === 0) {
      if (!TERRAIN_TYPES.has(tileId)) {
        throw new Error(`Unknown terrain type: "${tileId}". Valid terrain types: ${[...TERRAIN_TYPES].join(", ")}.`);
      }
    } else {
      if (!TILE_BY_ID.has(tileId)) {
        throw new Error(`Unknown tile id: "${tileId}". Use list_tiles to see available tiles.`);
      }
      if (isItemTile(tileId)) {
        throw new Error(`"${tileId}" is an inventory item and cannot be placed on the map. Items can only be stored in containers (e.g. chest, log_pile).`);
      }
    }
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) {
      throw new Error(`Position (${x}, ${y}) is outside map bounds (${this.map.width}×${this.map.height}).`);
    }
    if (layer < 0 || layer > 4) {
      throw new Error(`Layer must be 0–4. Layer 0 = terrain, 1 = ground cover, 2 = path, 3 = entity base, 4 = entity canopy.`);
    }
    saveOverride(x, y, layer, tileId);
    const key = `${x},${y}`;
    const layers = this.overrides.get(key) ?? [];
    while (layers.length <= layer) layers.push("");
    layers[layer] = tileId;
    this.overrides.set(key, layers);
    this.overridesVersion = loadOverridesVersion();
    this.emit("map:updated", this.map);
  }

  /** Place multiple tiles in a single DB transaction. Emits one update at the end. */
  setTiles(entries: { x: number; y: number; layer: number; tileId: string }[]): void {
    const valid = entries.map(({ x, y, layer, tileId }) => {
      if (layer === 0) {
        if (!TERRAIN_TYPES.has(tileId))
          throw new Error(`Unknown terrain type: "${tileId}". Valid terrain types: ${[...TERRAIN_TYPES].join(", ")}.`);
      } else {
        if (!TILE_BY_ID.has(tileId))
          throw new Error(`Unknown tile id: "${tileId}". Use list_tiles to see available tiles.`);
        if (isItemTile(tileId))
          throw new Error(`"${tileId}" is an inventory item and cannot be placed on the map. Items can only be stored in containers (e.g. chest, log_pile).`);
      }
      if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height)
        throw new Error(`Position (${x}, ${y}) is outside map bounds (${this.map.width}×${this.map.height}).`);
      if (layer < 0 || layer > 4)
        throw new Error(`Layer must be 0–4.`);
      return { x, y, layer, tileId };
    });

    saveOverridesBatch(valid);

    for (const { x, y, layer, tileId } of valid) {
      const key = `${x},${y}`;
      const layers = this.overrides.get(key) ?? [];
      while (layers.length <= layer) layers.push("");
      layers[layer] = tileId;
      this.overrides.set(key, layers);
    }

    this.overridesVersion = loadOverridesVersion();
    this.emit("map:updated", this.map);
  }

  /** Remove a tile override from a specific layer at (x, y). */
  clearTile(x: number, y: number, layer: number): void {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) {
      throw new Error(`Position (${x}, ${y}) is outside map bounds.`);
    }
    if (layer < 0 || layer > 4) {
      throw new Error(`Layer must be 0–4.`);
    }
    clearTileOverride(x, y, layer);
    const key = `${x},${y}`;
    const layers = this.overrides.get(key);
    if (layers && layers.length > layer) {
      layers[layer] = "";
      if (layers.every((l) => l === "")) this.overrides.delete(key);
    }
    this.overridesVersion = loadOverridesVersion();
    this.emit("map:updated", this.map);
  }

  /** Returns the tile ID at the given layer for (x, y), or empty string if unset. */
  private getLayer(x: number, y: number, layer: number): string {
    return this.overrides.get(`${x},${y}`)?.[layer] ?? "";
  }

  /** Scan within `radius` tiles of `origin` and return entity counts by tile ID (layer 3). */
  private scanNearby(origin: Point, radius = 15): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [key, layers] of this.overrides) {
      const entity = layers[3];
      if (!entity) continue;
      const [xs, ys] = key.split(",");
      const x = parseInt(xs, 10), y = parseInt(ys, 10);
      if (Math.abs(x - origin.x) <= radius && Math.abs(y - origin.y) <= radius) {
        counts[entity] = (counts[entity] ?? 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Place a dirt-path cell at (x, y) and re-autotile it plus all adjacent path cells.
   * The cell must be on walkable ground (grass or an existing path tile).
   * Uses setTiles() for an atomic batch update.
   */
  addPath(x: number, y: number): void {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) {
      throw new Error(`Position (${x}, ${y}) is outside map bounds.`);
    }
    // Walkability check uses layer 1 (grass / water-shore marker)
    const l1 = this.getLayer(x, y, 1);
    if (!isWalkableGround(l1)) {
      throw new Error(`Cannot place path at (${x}, ${y}): cell is not walkable ground.`);
    }

    // Path tiles live at layer 2.
    const pending = new Set<string>([`${x},${y}`]);
    const isPath = (cx: number, cy: number): boolean =>
      pending.has(`${cx},${cy}`) || isPathTileId(this.getLayer(cx, cy, 2));

    const toUpdate = new Set<string>([`${x},${y}`]);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < this.map.width && ny >= 0 && ny < this.map.height) {
        if (isPathTileId(this.getLayer(nx, ny, 2))) toUpdate.add(`${nx},${ny}`);
      }
    }

    const updates = [...toUpdate].map((key) => {
      const [cx, cy] = key.split(",").map(Number);
      return { x: cx, y: cy, layer: 2, tileId: autotilePathCell(cx, cy, isPath, this.map.width, this.map.height) };
    });
    this.setTiles(updates);
  }

  /**
   * Remove the dirt-path cell at (x, y) and re-autotile neighbours.
   * If the cell is not a path cell this is a no-op.
   */
  removePath(x: number, y: number): void {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) {
      throw new Error(`Position (${x}, ${y}) is outside map bounds.`);
    }
    if (!isPathTileId(this.getLayer(x, y, 2))) return; // nothing to remove

    const removed = new Set<string>([`${x},${y}`]);
    const isPath = (cx: number, cy: number): boolean =>
      !removed.has(`${cx},${cy}`) && isPathTileId(this.getLayer(cx, cy, 2));

    const toUpdate = new Set<string>();
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < this.map.width && ny >= 0 && ny < this.map.height) {
        if (isPathTileId(this.getLayer(nx, ny, 2))) toUpdate.add(`${nx},${ny}`);
      }
    }

    // Clear path tile at (x,y) then re-autotile neighbours — all in one batch + emit.
    const neighborUpdates = [...toUpdate].map((key) => {
      const [cx, cy] = key.split(",").map(Number);
      return { x: cx, y: cy, layer: 2, tileId: autotilePathCell(cx, cy, isPath, this.map.width, this.map.height) };
    });

    clearTileOverride(x, y, 2);
    const ovKey = `${x},${y}`;
    const ovLayers = this.overrides.get(ovKey);
    if (ovLayers && ovLayers.length > 2) {
      ovLayers[2] = "";
      if (ovLayers.every((l) => l === "")) this.overrides.delete(ovKey);
    }

    if (neighborUpdates.length > 0) {
      this.setTiles(neighborUpdates);
    } else {
      this.overridesVersion = loadOverridesVersion();
      this.emit("map:updated", this.map);
    }
  }

  /**
   * Plow the character's current cell to create a dirt path.
   * Requires multiple hits bare-handed; fewer hits with a plow or digging tool.
   * Returns progress info so the caller can report hits remaining.
   */
  plowCell(id: string): { progress: number; required: number; completed: boolean; hitsRemaining: number } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);

    const { x, y } = character;

    // Validate cell — grass is tracked via layer-1 overrides ("grass" tile ID), not map.tiles
    const l1 = this.getLayer(x, y, 1);
    if (l1 !== "grass") throw new Error(`Cannot plow here: cell (${x},${y}) is not grass terrain.`);
    if (isPathTileId(this.getLayer(x, y, 2))) throw new Error(`Cell (${x},${y}) is already a dirt path.`);
    if (this.getLayer(x, y, 3) !== "") throw new Error(`Cannot plow here: an entity is blocking cell (${x},${y}).`);

    // Tool bonus via plow capability
    const equipped = character.stats.equipment?.hands?.item ?? null;
    const plowLevel = equipped ? getCapabilityLevel(equipped, "plow") : 0;

    // Energy cost scales down with tool level (min 3)
    const cfg = getIslandConfig();
    const baseCost = cfg.energyCosts.plow;
    const cost = Math.max(3, baseCost - Math.floor(plowLevel * 5));
    this._checkEnergy(character, "plow");  // uses cfg.energyCosts.plow for threshold check
    character.stats.energy = Math.max(0, character.stats.energy - cost);

    // Progress per hit scales up with tool level
    const REQUIRED = 40;
    const damage = 10 + Math.floor(plowLevel * 30);
    const key = `${x},${y}`;
    const prev = this.pathProgress.get(key) ?? 0;
    const next = prev + damage;
    const completed = next >= REQUIRED;

    if (completed) {
      this.pathProgress.delete(key);
      this.addPath(x, y);
    } else {
      this.pathProgress.set(key, next);
    }

    const progress = completed ? REQUIRED : next;
    const hitsRemaining = completed ? 0 : Math.ceil((REQUIRED - progress) / damage);
    return { progress, required: REQUIRED, completed, hitsRemaining };
  }

  /**
   * Spawn a character at (x, y).
   * Validates: in-bounds, grass terrain, no layer-2 entity, no duplicate id.
   * @param id  Unique character name (default: "hero")
   */
  getValidSpawnPositions(): { x: number; y: number }[] {
    const occupied = new Set(
      [...this.characters.values()].map(c => `${c.x},${c.y}`)
    );
    const result: { x: number; y: number }[] = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const key = `${x},${y}`;
        const layers = this.overrides.get(key);
        if (isWalkableGround(layers?.[1] ?? "") && !layers?.[3] && !occupied.has(key)) {
          result.push({ x, y });
        }
      }
    }
    return result;
  }

  spawnCharacter(x: number, y: number, id = "hero"): CharacterInstance {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) {
      throw new Error(`Position (${x}, ${y}) is outside map bounds (${this.map.width}×${this.map.height}).`);
    }
    // Grass is tracked via layer-1 overrides (tileId === "grass"), not in map.tiles
    const l1 = this.overrides.get(`${x},${y}`)?.[1] ?? "";
    if (!isWalkableGround(l1)) {
      throw new Error(`Cannot spawn at (${x}, ${y}): cell is not on grass or a path (land only).`);
    }
    const l3 = this.overrides.get(`${x},${y}`)?.[3];
    if (l3) {
      throw new Error(`Cannot spawn at (${x}, ${y}): entity "${l3}" is blocking.`);
    }
    if (this.characters.has(id)) {
      throw new Error(`A character named "${id}" already exists.`);
    }

    const stats: CharacterStats = { ...getDefaultCharacterStats(), equipment: defaultEquipment(), inventory: [{ item: "rocks", qty: 1 }] };
    const skinOptions = ["human", "human_dark", "human_darker"];
    const tileId = skinOptions[Math.floor(Math.random() * skinOptions.length)];

    // Random hair & beard
    const hairColors = ["brown", "orange", "blonde", "gray", "white"];
    const hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];
    const hairSubRow = Math.floor(Math.random() * 3); // 0, 1, or 2
    const hairStyle = Math.floor(Math.random() * 4) + 1; // 1-4
    const hairN = hairSubRow * 4 + hairStyle; // 1-12
    const hairTileId = `hair_${hairColor}_${hairN}`;
    // 50% chance of beard, but not with long hair (sub-row 1 = styles 5-8)
    let beardTileId: string | undefined;
    if (hairSubRow !== 1 && Math.random() < 0.5) {
      const beardStyle = Math.floor(Math.random() * 4) + 1;
      beardTileId = `beard_${hairColor}_${beardStyle}`;
    }

    const character: CharacterInstance = { id, x, y, tileId, hairTileId, beardTileId, stats, path: [], action: "idle" };

    this.characters.set(id, character);
    saveCharacter(id, x, y, stats, [], "idle", tileId, hairTileId, beardTileId);
    this.emit("map:updated", this.map);
    return character;
  }

  /**
   * Remove a character from the active world but keep their data in the DB
   * so they can reconnect later with the same state.
   */
  kick(id: string): void {
    if (!this.characters.has(id)) throw new Error(`No character named "${id}".`);
    this.characters.delete(id);
    this.emit("map:updated", this.map);
  }

  /**
   * Connect (or reconnect) a character to the world.
   * - If the character exists in the DB, restore their full state.
   *   If their saved position is occupied, relocate to the nearest spawnable tile.
   * - If the character is new, create them at a random spawnable position.
   * - If the character is already active in-memory, just return them.
   */
  connect(username: string): { character: CharacterInstance; reconnected: boolean } {
    const id = username;
    // Already active — just return
    const existing = this.characters.get(id);
    if (existing) return { character: existing, reconnected: true };

    // Try to restore from DB
    const saved = loadCharacter(id);
    if (saved) {
      const stats: CharacterStats = { ...getDefaultCharacterStats(), ...(saved.stats as Partial<CharacterStats>) };
      if (!stats.equipment) stats.equipment = defaultEquipment();

      // Check if saved position is still spawnable
      let { x, y } = saved;
      if (!this._isSpawnable(x, y)) {
        const alt = this.findNearestSpawnable(x, y);
        if (!alt) throw new Error("No valid spawn positions available.");
        x = alt.x;
        y = alt.y;
      }

      const character: CharacterInstance = {
        id, x, y,
        tileId: saved.tileId,
        hairTileId: saved.hairTileId,
        beardTileId: saved.beardTileId,
        stats,
        path: [],
        action: "idle",
        ...(saved.shelter ? { shelter: saved.shelter } : {}),
      };

      this.characters.set(id, character);
      saveCharacter(id, x, y, stats, [], "idle", saved.tileId, saved.hairTileId, saved.beardTileId);
      this.emit("map:updated", this.map);
      return { character, reconnected: true };
    }

    // New character — spawn at random position
    const positions = this.getValidSpawnPositions();
    if (positions.length === 0) throw new Error("No valid spawn positions available.");
    const pos = positions[Math.floor(Math.random() * positions.length)];
    return { character: this.spawnCharacter(pos.x, pos.y, id), reconnected: false };
  }

  /** Check if a tile is available for spawning (walkable, no entity, no character). */
  private _isSpawnable(x: number, y: number): boolean {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) return false;
    const key = `${x},${y}`;
    const layers = this.overrides.get(key);
    if (!isWalkableGround(layers?.[1] ?? "")) return false;
    if (layers?.[3]) return false;
    // Check for other characters at this position
    for (const c of this.characters.values()) {
      if (c.x === x && c.y === y) return false;
    }
    return true;
  }

  /** BFS from (startX, startY) to find the nearest spawnable tile. */
  findNearestSpawnable(startX: number, startY: number): Point | null {
    const visited = new Set<string>();
    const queue: Point[] = [{ x: startX, y: startY }];
    visited.add(`${startX},${startY}`);

    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    ];

    while (queue.length > 0) {
      const pos = queue.shift()!;
      if (this._isSpawnable(pos.x, pos.y)) return pos;

      for (const d of dirs) {
        const nx = pos.x + d.dx;
        const ny = pos.y + d.dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (nx < 0 || nx >= this.map.width || ny < 0 || ny >= this.map.height) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }

    return null;
  }

  /**
   * Harvest or chop the entity at the character's current position.
   *
   * - If the entity's harvest def has `damage`: deal that much damage to entity health.
   *   When health reaches 0, apply `onDeath` (drops + optional entity spawn). No resources
   *   are drained on partial hits.
   * - Otherwise: legacy one-shot behavior — drain all resources immediately.
   *
   * If the entity requires a capability (e.g. "chop"), the character must have an item
   * with that capability equipped in the `hands` slot.
   */
  /** Throw if the character has insufficient energy for an action; deduct cost on success. */
  private _checkEnergy(character: CharacterInstance, action: "harvest" | "build" | "interact" | "craft" | "eat" | "moveStep" | "plow"): void {
    const cost = getIslandConfig().energyCosts[action];
    if (cost > 0 && character.stats.energy < cost) {
      throw new Error(`Not enough energy to ${action} (have ${Math.floor(character.stats.energy)}, need ${cost}). Rest or eat to recover.`);
    }
    character.stats.energy = Math.max(0, character.stats.energy - cost);
  }

  harvest(id: string, item?: string, targetX?: number, targetY?: number): { harvested: Record<string, number>; entity: { tileId: string; health?: number; maxHealth?: number; destroyed: boolean } } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);
    this._checkEnergy(character, "harvest");

    // Determine which cell to harvest from
    let key: string;
    if (targetX !== undefined && targetY !== undefined) {
      // Explicit target — must be adjacent (cardinal)
      this._assertAdjacent(character.x, character.y, targetX, targetY);
      key = `${targetX},${targetY}`;
    } else {
      // Default — harvest the entity at the character's own cell
      key = `${character.x},${character.y}`;
    }

    const tileId = this.overrides.get(key)?.[3] ?? "";
    const def = HARVEST_DEFS[tileId];
    if (!def) {
      // Fallback: if the entity is a container, treat harvest as "take items from it"
      if (ENTITY_DEF_BY_ID.get(tileId)?.container) {
        if (BLOCKING_IDS.has(tileId) && (targetX === undefined || targetY === undefined)) {
          throw new Error(`"${tileId}" is a solid entity — provide target_x/target_y to harvest from an adjacent tile.`);
        }
        return this._harvestFromContainer(character, key, tileId, item);
      }
      const pos = targetX !== undefined ? `(${targetX},${targetY})` : `(${character.x},${character.y})`;
      throw new Error(`No harvestable entity at ${pos}.`);
    }

    // Blocking entities must always be targeted explicitly (character can't stand on them)
    if (BLOCKING_IDS.has(tileId) && (targetX === undefined || targetY === undefined)) {
      throw new Error(`"${tileId}" is a solid entity — provide target_x/target_y to harvest from an adjacent tile.`);
    }

    // ── Tool capability check (damage mode only — chopping trees etc.) ──────────
    // Drain-mode entities with harvestYield use tool level as a yield multiplier
    // instead of a hard block (anyone can try; better tools give more resources).
    if (def.damage !== undefined && item === undefined) {
      if (def.requires && def.requires.length > 0) {
        const equippedItem = character.stats.equipment?.hands?.item ?? null;
        const satisfied = equippedItem && def.requires.some(cap => hasCapability(equippedItem, cap));
        if (!satisfied) {
          const needed = def.requires.join(" or ");
          throw new Error(`Cannot harvest "${tileId}": requires a tool with [${needed}] capability.`);
        }
      }
    }

    // ── Health-damage mode (trees, destructible entities) ────────────────────
    if (def.damage !== undefined) {
      const currentStats = this.entityStats.get(key) ?? { ...ENTITY_DEFAULTS[tileId] };
      const currentHealth = (currentStats as EntityStats).health ?? 0;
      // Route to drain if: caller requested a specific item, OR entity is already dead (health=0)
      if (item !== undefined || currentHealth <= 0) {
        return this._harvestByDrain(character, key, tileId, def, item);
      }
      return this._harvestByDamage(character, key, tileId, def);
    }

    // ── Drain mode (berries, rock, etc.) ────────────────────────────────────
    return this._harvestByDrain(character, key, tileId, def, item);
  }

  /** Pick up items from a container entity via harvest command. */
  private _harvestFromContainer(
    character: CharacterInstance,
    key: string,
    tileId: string,
    item?: string,
  ): { harvested: Record<string, number>; entity: { tileId: string; destroyed: boolean } } {
    const [entityX, entityY] = key.split(",").map(Number);
    const raw = (this.entityStats.get(key) ?? {}) as { inventory?: { item: string; qty: number }[] };
    const inv: { item: string; qty: number }[] = raw.inventory ?? [];

    if (inv.length === 0) throw new Error(`Container at (${entityX},${entityY}) is empty.`);

    // Collect specific item or everything
    const slots = item ? inv.filter(s => s.item === item) : [...inv];
    if (item && slots.length === 0) throw new Error(`No "${item}" in container at (${entityX},${entityY}).`);

    const harvested: Record<string, number> = {};
    const charInv = character.stats.inventory as { item: string; qty: number }[];
    for (const slot of slots) {
      const existing = charInv.find(s => s.item === slot.item);
      if (existing) existing.qty += slot.qty;
      else charInv.push({ item: slot.item, qty: slot.qty });
      harvested[slot.item] = (harvested[slot.item] ?? 0) + slot.qty;
    }

    // Remove taken items from container inventory
    if (item) {
      const idx = inv.findIndex(s => s.item === item);
      if (idx !== -1) inv.splice(idx, 1);
    } else {
      inv.length = 0;
    }
    raw.inventory = inv;

    const destroyed = inv.length === 0;
    if (destroyed) {
      this.entityStats.delete(key);
      deleteEntityStat(entityX, entityY);
      const overrideLayers = this.overrides.get(key) ?? [];
      overrideLayers[3] = "";
      this.overrides.set(key, overrideLayers);
      clearTileOverride(entityX, entityY, 3);
    } else {
      this.entityStats.set(key, raw as EntityStats);
      saveEntityStat(entityX, entityY, raw);
    }

    saveCharacter(character.id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    this.emit("map:updated", this.map);
    return { harvested, entity: { tileId, destroyed } };
  }

  private _harvestByDamage(
    character: CharacterInstance,
    key: string,
    tileId: string,
    def: typeof HARVEST_DEFS[string],
  ): { harvested: Record<string, number>; entity: { tileId: string; health: number; maxHealth: number; destroyed: boolean } } {
    const [entityX, entityY] = key.split(",").map(Number);
    const stats = (this.entityStats.get(key) ?? { ...ENTITY_DEFAULTS[tileId] }) as EntityStats;
    const maxHealth = stats.maxHealth ?? (ENTITY_DEFAULTS[tileId]?.maxHealth ?? 0);
    const newHealth = (stats.health ?? 0) - def.damage!;
    const harvested: Record<string, number> = {};

    // Apply dropPerHit: yield resources directly to character inventory on every hit
    let updatedStats: EntityStats = { ...stats, health: Math.max(newHealth, 0) };
    if (def.dropPerHit) {
      const inv = character.stats.inventory as { item: string; qty: number }[];
      for (const [res, amt] of Object.entries(def.dropPerHit)) {
        const existing = inv.find(i => i.item === res);
        if (existing) existing.qty += amt;
        else inv.push({ item: res, qty: amt });
        harvested[res] = (harvested[res] ?? 0) + amt;
      }
    }

    if (newHealth <= 0) {
      // ── Entity death ──────────────────────────────────────────────────────

      if (def.onDeath?.keepForPickup) {
        // Entity stays alive (health=0) so player can harvest pending resources.
        // Only removed when all resources are drained (handled in _harvestByDrain).
        this.entityStats.set(key, updatedStats);
        saveEntityStat(entityX, entityY, updatedStats);
        saveCharacter(character.id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
        this.emit("map:updated", this.map);
        return { harvested, entity: { tileId, health: 0, maxHealth, destroyed: false } };
      }

      // Split drops: accepted items go into spawned container, rest go to char
      const spawnId = def.onDeath?.spawnEntity;
      const spawnDef = spawnId ? ENTITY_DEF_BY_ID.get(spawnId) : undefined;
      const containerAccepted = new Set(spawnDef?.container ? (spawnDef.acceptedItems ?? []) : []);

      const containerDrops: Record<string, number> = {};
      if (def.onDeath?.drops) {
        const inv = character.stats.inventory as { item: string; qty: number }[];
        for (const [res, amt] of Object.entries(def.onDeath.drops)) {
          if (containerAccepted.has(res)) {
            containerDrops[res] = (containerDrops[res] ?? 0) + amt;
          } else {
            const existing = inv.find(i => i.item === res);
            if (existing) existing.qty += amt;
            else inv.push({ item: res, qty: amt });
            harvested[res] = (harvested[res] ?? 0) + amt;
          }
        }
      }

      // Remove entity stats and tile override
      this.entityStats.delete(key);
      deleteEntityStat(entityX, entityY);
      const overrideLayers = this.overrides.get(key) ?? [];
      overrideLayers[3] = "";
      this.overrides.set(key, overrideLayers);
      clearTileOverride(entityX, entityY, 3);

      // Remove canopy layer for two-tile entities
      if (def.fullTop) {
        const topKey = `${entityX},${entityY - 1}`;
        const topLayers = this.overrides.get(topKey) ?? [];
        topLayers[4] = "";
        this.overrides.set(topKey, topLayers);
        clearTileOverride(entityX, entityY - 1, 4);
      }

      // Spawn replacement entity (e.g. log_pile) — pre-fill container with container drops
      if (def.onDeath?.spawnEntity) {
        const spawnStats: Record<string, unknown> = { ...ENTITY_DEFAULTS[spawnId!] };
        if (Object.keys(containerDrops).length > 0) {
          spawnStats.inventory = Object.entries(containerDrops).map(([item, qty]) => ({ item, qty }));
        }
        overrideLayers[3] = spawnId!;
        this.overrides.set(key, overrideLayers);
        saveOverride(entityX, entityY, 3, spawnId!);
        this.entityStats.set(key, spawnStats as EntityStats);
        saveEntityStat(entityX, entityY, spawnStats);
      }

      saveCharacter(character.id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
      this.emit("map:updated", this.map);
      return { harvested, entity: { tileId, health: 0, maxHealth, destroyed: true } };
    } else {
      // ── Partial hit — update health (and any dropPerHit resources) ────────
      this.entityStats.set(key, updatedStats);
      saveEntityStat(entityX, entityY, updatedStats);

      saveCharacter(character.id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
      this.emit("map:updated", this.map);
      return { harvested, entity: { tileId, health: newHealth, maxHealth, destroyed: false } };
    }
  }

  private _harvestByDrain(
    character: CharacterInstance,
    key: string,
    tileId: string,
    def: typeof HARVEST_DEFS[string],
    item?: string,
  ): { harvested: Record<string, number>; entity: { tileId: string; destroyed: boolean } } {
    const [entityX, entityY] = key.split(",").map(Number);
    const stats = this.entityStats.get(key) ?? { ...ENTITY_DEFAULTS[tileId] };
    const allResources = getResources(stats as EntityStats);

    // Filter to requested item if specified
    const resources: Record<string, number> = item
      ? (allResources[item] !== undefined
          ? { [item]: allResources[item] }
          : (() => { throw new Error(`No "${item}" available here.`); })())
      : allResources;

    if (Object.keys(resources).length === 0) throw new Error(`Nothing left to harvest here.`);

    // ── Apply harvestYield scaling if defined ─────────────────────────────────
    // Scale each resource by the tool's capability level. No tool → level 0 → minimum 1.
    const harvestYield = def.harvestYield;
    let actualResources: Record<string, number>;
    if (harvestYield !== undefined) {
      const equippedItem = character.stats.equipment?.hands?.item ?? null;
      const capKey = def.requires?.[0] ?? "mine";
      const toolLevel = equippedItem ? getCapabilityLevel(equippedItem, capKey) : 0;
      actualResources = {};
      for (const [res, available] of Object.entries(resources)) {
        const want = Math.max(1, Math.round(harvestYield * toolLevel || 1));
        actualResources[res] = Math.min(available, want);
      }
    } else {
      actualResources = resources;
    }

    // Add resources to character inventory
    const inv = character.stats.inventory as { item: string; qty: number }[];
    for (const [res, amt] of Object.entries(actualResources)) {
      const existing = inv.find(i => i.item === res);
      if (existing) existing.qty += amt;
      else inv.push({ item: res, qty: amt });
    }

    // Deplete harvested resources in entity stats
    const newStats: EntityStats = { ...(stats as EntityStats) };
    for (const [res, amt] of Object.entries(actualResources)) {
      (newStats as unknown as Record<string, number>)[res] =
        Math.max(0, ((newStats as unknown as Record<string, number>)[res] ?? 0) - amt);
    }
    saveCharacter(character.id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);

    // Only trigger visual swap / disappear if ALL resources are now depleted
    const remaining = getResources(newStats);
    const fullyDepleted = Object.keys(remaining).length === 0;
    // For damage-mode entities (e.g. rock with keepForPickup): only destroy if health is also 0
    const healthRemaining = def.damage !== undefined ? ((newStats as Record<string, number>).health ?? 0) : 0;
    const readyToDestroy = fullyDepleted && healthRemaining <= 0;

    if (def.emptyBase && readyToDestroy) {
      // Swap to empty tile variant
      this.entityStats.set(key, newStats);
      saveEntityStat(entityX, entityY, newStats);

      const overrideLayers = this.overrides.get(key) ?? [];
      overrideLayers[3] = def.emptyBase;
      this.overrides.set(key, overrideLayers);
      saveOverride(entityX, entityY, 3, def.emptyBase);

      if (def.emptyTop) {
        const topKey = `${entityX},${entityY - 1}`;
        const topLayers = this.overrides.get(topKey) ?? [];
        topLayers[4] = def.emptyTop;
        this.overrides.set(topKey, topLayers);
        saveOverride(entityX, entityY - 1, 4, def.emptyTop);
      }
    } else if (!def.regrowMs && readyToDestroy) {
      // Disappear permanently — remove tile and entity stats
      this.entityStats.delete(key);
      deleteEntityStat(entityX, entityY);

      const overrideLayers = this.overrides.get(key) ?? [];
      overrideLayers[3] = "";
      this.overrides.set(key, overrideLayers);
      clearTileOverride(entityX, entityY, 3);
    } else {
      // Partial harvest or entity still has health — persist updated stats
      this.entityStats.set(key, newStats);
      saveEntityStat(entityX, entityY, newStats);
    }

    // Schedule regrow if applicable (reset timer on each harvest)
    if (def.regrowMs) {
      const existingTimer = this.regrowTimers.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        this.regrowEntity(entityX, entityY, tileId, def);
      }, def.regrowMs);
      if (timer.unref) timer.unref();
      this.regrowTimers.set(key, timer);
    }

    this.emit("map:updated", this.map);
    // destroyed = fully depleted AND no health remaining (and no regrow/emptyBase)
    const destroyed = readyToDestroy && !def.regrowMs && !def.emptyBase;
    return { harvested: actualResources, entity: { tileId, destroyed } };
  }


  // ── Helper: check cardinal adjacency ────────────────────────────────────────
  private _assertAdjacent(cx: number, cy: number, tx: number, ty: number): void {
    if (Math.abs(cx - tx) + Math.abs(cy - ty) !== 1) {
      throw new Error(
        `Must be in an adjacent cardinal tile (up/down/left/right) to the target at (${tx}, ${ty}). ` +
        `Currently at (${cx}, ${cy}).`
      );
    }
  }

  // ── Helper: consume items from inventory (assumes amounts already checked) ──
  private _consumeItems(inv: { item: string; qty: number }[], costs: Record<string, number>): void {
    for (const [item, required] of Object.entries(costs)) {
      if (required === 0) continue;
      const slot = inv.find(i => i.item === item)!;
      slot.qty -= required;
      if (slot.qty <= 0) inv.splice(inv.indexOf(slot), 1);
    }
  }

  /**
   * Build a structure at (targetX, targetY) from an adjacent cell.
   * Consumes required items from the character's inventory.
   */
  build(id: string, targetX: number, targetY: number, entityId: string): { built: string; consumed: Record<string, number> } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);
    this._checkEnergy(character, "build");

    this._assertAdjacent(character.x, character.y, targetX, targetY);

    const def = BUILD_DEFS[entityId];
    if (!def) throw new Error(`"${entityId}" is not a buildable entity.`);

    if (targetX < 0 || targetX >= this.map.width || targetY < 0 || targetY >= this.map.height) {
      throw new Error(`Target (${targetX}, ${targetY}) is outside map bounds.`);
    }

    const targetKey = `${targetX},${targetY}`;
    const existing = this.overrides.get(targetKey)?.[3] ?? "";
    if (existing) {
      throw new Error(`Cannot build at (${targetX}, ${targetY}): cell is occupied by "${existing}".`);
    }

    // For quad entities, also check the 3 extra positions
    const entityDef = ENTITY_DEF_BY_ID.get(entityId);
    const quadPositions: Array<{ x: number; y: number; tileId: string }> = [];
    if (entityDef?.tileType === "quad") {
      const extras = [
        { dx: 0, dy: -1, tid: entityDef.topTileId },
        { dx: 1, dy: 0, tid: entityDef.rightTileId },
        { dx: 1, dy: -1, tid: entityDef.topRightTileId },
      ];
      for (const { dx, dy, tid } of extras) {
        if (!tid) continue;
        const ex = targetX + dx, ey = targetY + dy;
        if (ex < 0 || ex >= this.map.width || ey < 0 || ey >= this.map.height) {
          throw new Error(`Quad entity extends outside map bounds at (${ex}, ${ey}).`);
        }
        const eKey = `${ex},${ey}`;
        const eTile = this.overrides.get(eKey)?.[3] ?? "";
        if (eTile) {
          throw new Error(`Cannot build quad entity: cell (${ex}, ${ey}) is occupied by "${eTile}".`);
        }
        quadPositions.push({ x: ex, y: ey, tileId: tid });
      }
    }

    const inv = character.stats.inventory as { item: string; qty: number }[];
    for (const [item, required] of Object.entries(def.costs)) {
      const available = inv.find(i => i.item === item)?.qty ?? 0;
      if (available < required) {
        throw new Error(`Not enough ${item}: need ${required}, have ${available}.`);
      }
    }

    this._consumeItems(inv, def.costs);

    // Place base tile and initialise entity stats
    const layers = this.overrides.get(targetKey) ?? [];
    while (layers.length <= 3) layers.push("");
    layers[3] = entityId;
    this.overrides.set(targetKey, layers);

    // Place extra tiles for quad entities
    for (const qp of quadPositions) {
      const qKey = `${qp.x},${qp.y}`;
      const qLayers = this.overrides.get(qKey) ?? [];
      while (qLayers.length <= 3) qLayers.push("");
      qLayers[3] = qp.tileId;
      this.overrides.set(qKey, qLayers);
    }

    const initStats: Record<string, unknown> = { ...(ENTITY_DEFAULTS[entityId] ?? {}) };
    // Pre-fill container inventory with the consumed build costs
    if (entityDef?.container) {
      initStats.inventory = Object.entries(def.costs).map(([item, qty]) => ({ item, qty }));
    }
    // Pre-fill fuel-based health from build costs (e.g. wood spent building a campfire)
    const repairDef = REPAIR_DEFS[entityId];
    if (repairDef && def.costs[repairDef.fuelItem] && "health" in initStats) {
      const fuelSpent = def.costs[repairDef.fuelItem] as number;
      (initStats as Record<string, number>).health = Math.min(
        (initStats as Record<string, number>).maxHealth ?? 0,
        fuelSpent * repairDef.healthPerFuel,
      );
    }
    if (Object.keys(initStats).length > 0) {
      this.entityStats.set(targetKey, initStats as EntityStats);
    }

    // Flush tile override + entity stats + character in one atomic transaction
    runTransaction(() => {
      saveOverride(targetX, targetY, 3, entityId);
      for (const qp of quadPositions) {
        saveOverride(qp.x, qp.y, 3, qp.tileId);
      }
      if (Object.keys(initStats).length > 0) {
        saveEntityStat(targetX, targetY, initStats as EntityStats);
      }
      saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    });
    this.overridesVersion = loadOverridesVersion();
    this.emit("map:updated", this.map);
    return { built: entityId, consumed: def.costs };
  }

  // ── Tent enter/exit ────────────────────────────────────────────────────────

  /** Set of entity IDs that are tent base tiles (door tiles a character can enter). */
  private static readonly TENT_IDS = new Set(
    Array.from(ENTITY_DEF_BY_ID.values())
      .filter(d => d.tileType === "quad")
      .map(d => d.id),
  );

  /**
   * Enter a tent at (targetX, targetY). Character must be adjacent to the tent's door (base) tile.
   * The character disappears from the map and begins resting inside.
   */
  enterTent(id: string, targetX: number, targetY: number): { entered: string } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);
    if (character.shelter) throw new Error(`${id} is already inside a tent.`);

    this._assertAdjacent(character.x, character.y, targetX, targetY);

    const targetKey = `${targetX},${targetY}`;
    const tileId = this.overrides.get(targetKey)?.[3] ?? "";
    if (!Island.TENT_IDS.has(tileId)) {
      throw new Error(`No tent at (${targetX}, ${targetY}). Found: "${tileId || "empty"}".`);
    }

    character.shelter = targetKey;
    character.path = [];
    character.action = "resting";

    runTransaction(() => {
      saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    });
    this.emit("map:updated", this.map);
    return { entered: tileId };
  }

  /**
   * Exit the tent the character is currently inside. Places the character on an
   * adjacent walkable tile next to the tent door.
   */
  exitTent(id: string): { x: number; y: number } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);
    if (!character.shelter) throw new Error(`${id} is not inside a tent.`);

    const [baseX, baseY] = character.shelter.split(",").map(Number);

    // Find a walkable adjacent tile to place the character (prefer south, then others)
    const exits: Array<[number, number]> = [
      [baseX, baseY + 1],   // south (in front of door)
      [baseX - 1, baseY],   // west
      [baseX - 1, baseY + 1], // southwest
      [baseX + 1, baseY + 1], // southeast
      [baseX, baseY - 1],   // north (unlikely — above tent)
    ];

    let exitPos: { x: number; y: number } | null = null;
    for (const [ex, ey] of exits) {
      if (ex < 0 || ex >= this.map.width || ey < 0 || ey >= this.map.height) continue;
      const eKey = `${ex},${ey}`;
      const eLayers = this.overrides.get(eKey);
      const l1 = eLayers?.[1] ?? "";
      const l3 = eLayers?.[3] ?? "";
      if (isWalkableGround(l1) && !l3) {
        exitPos = { x: ex, y: ey };
        break;
      }
    }

    if (!exitPos) {
      // Fallback: place at the base position itself (on the tent)
      exitPos = { x: baseX, y: baseY };
    }

    character.x = exitPos.x;
    character.y = exitPos.y;
    character.shelter = undefined;
    character.path = [];
    character.action = "idle";

    runTransaction(() => {
      saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    });
    this.emit("map:updated", this.map);
    return exitPos;
  }

  /**
   * Interact with an entity at (targetX, targetY) from an adjacent cell.
   * Consumes required items and replaces the entity tile with the configured result.
   */
  interact(id: string, targetX: number, targetY: number): { result: string; consumed: Record<string, number> } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);
    this._checkEnergy(character, "interact");

    this._assertAdjacent(character.x, character.y, targetX, targetY);

    const targetKey = `${targetX},${targetY}`;
    const tileId = this.overrides.get(targetKey)?.[3] ?? "";
    if (!tileId) throw new Error(`No entity at (${targetX}, ${targetY}) to interact with.`);

    const def = INTERACT_DEFS[tileId];
    if (!def) throw new Error(`"${tileId}" at (${targetX}, ${targetY}) has no interaction defined.`);

    // Check minimum health requirement (e.g. can't light campfire if fuel < 20)
    if (def.minHealth !== undefined) {
      const entityStats = this.entityStats.get(targetKey);
      const currentHealth = (entityStats as Record<string, number> | undefined)?.health ?? 0;
      if (currentHealth < def.minHealth) {
        throw new Error(`Not enough fuel to interact: need ${def.minHealth} health, entity has ${Math.floor(currentHealth)}. Feed it more fuel first.`);
      }
    }

    const inv = character.stats.inventory as { item: string; qty: number }[];
    for (const [item, required] of Object.entries(def.costs)) {
      if (required === 0) continue;
      const available = inv.find(i => i.item === item)?.qty ?? 0;
      if (available < required) {
        throw new Error(`Not enough ${item}: need ${required}, have ${available}.`);
      }
    }

    this._consumeItems(inv, def.costs);

    // Capture current health before replacing (for preserveHealth)
    const oldHealth = def.preserveHealth
      ? ((this.entityStats.get(targetKey) as Record<string, number> | undefined)?.health ?? 0)
      : null;

    // Replace the entity tile
    saveOverride(targetX, targetY, 3, def.result);
    const layers = this.overrides.get(targetKey) ?? [];
    while (layers.length <= 3) layers.push("");
    layers[3] = def.result;
    this.overrides.set(targetKey, layers);

    // Re-init entity stats for the new entity (if any)
    this.entityStats.delete(targetKey);
    deleteEntityStat(targetX, targetY);
    const initStats = { ...(ENTITY_DEFAULTS[def.result] ?? {}) };
    // Carry over health from the old entity if requested
    if (oldHealth !== null && "health" in initStats) {
      (initStats as Record<string, number>).health = Math.min(
        (initStats as Record<string, number>).maxHealth ?? oldHealth,
        oldHealth,
      );
    }
    if (Object.keys(initStats).length > 0) {
      this.entityStats.set(targetKey, initStats as EntityStats);
      saveEntityStat(targetX, targetY, initStats as EntityStats);
    }

    saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    this.overridesVersion = loadOverridesVersion();
    this.emit("map:updated", this.map);
    return { result: def.result, consumed: def.costs };
  }

  /**
   * Feed fuel items from a character's inventory into a decaying entity to restore its health.
   * The entity must have a `decay.fuelItem` defined. Character must be adjacent.
   */
  feedEntity(charId: string, x: number, y: number, qty: number): { fed: number; health: number; maxHealth: number } {
    const character = this.characters.get(charId);
    if (!character) throw new Error(`No character named "${charId}".`);

    this._assertAdjacent(character.x, character.y, x, y);

    const key = `${x},${y}`;
    const tileId = this.overrides.get(key)?.[3];
    if (!tileId) throw new Error(`No entity at (${x}, ${y}) to feed.`);

    const decay = DECAY_DEFS[tileId];
    const repair = REPAIR_DEFS[tileId];
    const fuelDef = decay ?? repair;
    if (!fuelDef) throw new Error(`"${tileId}" at (${x}, ${y}) does not accept fuel.`);

    const inv = character.stats.inventory as { item: string; qty: number }[];
    const slot = inv.find(i => i.item === fuelDef.fuelItem);
    const available = slot?.qty ?? 0;
    if (available <= 0) throw new Error(`No "${fuelDef.fuelItem}" in inventory.`);

    const amount = Math.min(qty, available);
    let stats = this.entityStats.get(key);
    if (!stats) {
      // Repair entities may not have stats yet if they were never initialised (health=0 not stored)
      stats = { ...ENTITY_DEFAULTS[tileId] };
      this.entityStats.set(key, stats);
    }

    const healthGain = amount * fuelDef.healthPerFuel;
    stats.health = Math.min(stats.maxHealth, stats.health + healthGain);

    // Consume items from character inventory
    slot!.qty -= amount;
    if (slot!.qty <= 0) inv.splice(inv.indexOf(slot!), 1);

    saveEntityStat(x, y, stats);
    saveCharacter(charId, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    this.emit("map:updated", this.map);

    return { fed: amount, health: stats.health, maxHealth: stats.maxHealth };
  }

  /**
   * Craft an item from a recipe, consuming ingredients from the character's inventory.
   */
  craft(id: string, recipeName: string): { crafted: Record<string, number> } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);
    this._checkEnergy(character, "craft");

    const recipe = RECIPES[recipeName];
    if (!recipe) throw new Error(`Unknown recipe "${recipeName}". Available: ${Object.keys(RECIPES).join(", ")}.`);

    const inv = character.stats.inventory as { item: string; qty: number }[];

    // Check all ingredients are available
    for (const [ingredient, required] of Object.entries(recipe.ingredients)) {
      const slot = inv.find(i => i.item === ingredient);
      const available = slot?.qty ?? 0;
      if (available < required) {
        throw new Error(`Not enough ${ingredient}: need ${required}, have ${available}.`);
      }
    }

    // Deduct ingredients
    for (const [ingredient, required] of Object.entries(recipe.ingredients)) {
      const slot = inv.find(i => i.item === ingredient)!;
      slot.qty -= required;
      if (slot.qty <= 0) inv.splice(inv.indexOf(slot), 1);
    }

    // Add output items
    for (const [outputItem, qty] of Object.entries(recipe.output)) {
      const existing = inv.find(i => i.item === outputItem);
      if (existing) existing.qty += qty;
      else inv.push({ item: outputItem, qty });
    }

    saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    return { crafted: recipe.output };
  }

  /** Consume one food item from inventory to restore hunger. */
  eat(id: string, item: string): { eaten: string; hungerRestored: number; stats: { hunger: number; maxHunger: number } } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);

    const eatDef = getEatDef(item);
    if (!eatDef) throw new Error(`"${item}" is not edible.`);

    const inv = character.stats.inventory as { item: string; qty: number }[];
    const slot = inv.find((s) => s.item === item);
    if (!slot || slot.qty < 1) throw new Error(`"${item}" not found in inventory.`);

    const before = character.stats.hunger;
    character.stats.hunger = Math.min(character.stats.maxHunger, character.stats.hunger + eatDef.hunger);
    const restored = character.stats.hunger - before;

    // Consume one item
    slot.qty -= 1;
    if (slot.qty <= 0) inv.splice(inv.indexOf(slot), 1);

    saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    return { eaten: item, hungerRestored: restored, stats: { hunger: character.stats.hunger, maxHunger: character.stats.maxHunger } };
  }

  // ── Container helpers ────────────────────────────────────────────────────────

  private _assertContainer(x: number, y: number): { health: number; maxHealth: number; inventory: { item: string; qty: number }[] } {
    const key = `${x},${y}`;
    const tileId = this.overrides.get(key)?.[3];
    if (!tileId) throw new Error(`No entity at (${x}, ${y}).`);
    if (!ENTITY_DEF_BY_ID.get(tileId)?.container) {
      throw new Error(`The entity at (${x}, ${y}) ("${tileId}") is not a container.`);
    }
    type ContainerStats = { health: number; maxHealth: number; inventory: { item: string; qty: number }[] };
    const raw = this.entityStats.get(key) as ContainerStats | undefined;
    if (!raw) {
      // Initialise empty container stats
      const defaults = ENTITY_DEFAULTS[tileId] ?? { health: 0, maxHealth: 0 };
      const fresh: ContainerStats = { health: defaults.health ?? 0, maxHealth: defaults.maxHealth ?? 0, inventory: [] };
      this.entityStats.set(key, fresh as unknown as EntityStats);
      saveEntityStat(x, y, fresh);
      return fresh;
    }
    if (!raw.inventory) raw.inventory = [];
    return raw;
  }

  /** View the contents of a container at (x, y). Character must be adjacent. */
  containerInspect(charId: string, x: number, y: number): { contents: { item: string; qty: number }[] } {
    const character = this.characters.get(charId);
    if (!character) throw new Error(`No character named "${charId}".`);
    this._assertAdjacent(character.x, character.y, x, y);
    const stats = this._assertContainer(x, y);
    return { contents: stats.inventory };
  }

  /** Move qty of item from character inventory into the container at (x, y). Character must be adjacent. */
  containerPut(charId: string, x: number, y: number, item: string, qty: number): { transferred: number; contents: { item: string; qty: number }[] } {
    const character = this.characters.get(charId);
    if (!character) throw new Error(`No character named "${charId}".`);
    this._assertAdjacent(character.x, character.y, x, y);
    const stats = this._assertContainer(x, y);

    // Retrieve entity def for filter + capacity checks
    const tileId = this.overrides.get(`${x},${y}`)?.[3]!;
    const def = ENTITY_DEF_BY_ID.get(tileId)!;

    if (def.acceptedItems && def.acceptedItems.length > 0 && !def.acceptedItems.includes(item)) {
      throw new Error(`This container only accepts: ${def.acceptedItems.join(", ")}. "${item}" is not allowed.`);
    }
    if (def.rejectedItems && def.rejectedItems.includes(item)) {
      throw new Error(`This container does not accept "${item}". Use a more suitable container.`);
    }
    if (def.maxItems !== undefined) {
      const currentTotal = stats.inventory.reduce((sum, s) => sum + s.qty, 0);
      if (currentTotal >= def.maxItems) {
        throw new Error(`Container is full (${currentTotal}/${def.maxItems} items).`);
      }
      // Clamp qty to remaining capacity
      qty = Math.min(qty, def.maxItems - currentTotal);
    }

    const charInv = character.stats.inventory as { item: string; qty: number }[];
    const charSlot = charInv.find(s => s.item === item);
    if (!charSlot || charSlot.qty <= 0) throw new Error(`No "${item}" in inventory.`);
    const amount = Math.min(qty, charSlot.qty);

    // Deduct from character
    charSlot.qty -= amount;
    if (charSlot.qty <= 0) charInv.splice(charInv.indexOf(charSlot), 1);

    // Add to container
    const contSlot = stats.inventory.find(s => s.item === item);
    if (contSlot) contSlot.qty += amount;
    else stats.inventory.push({ item, qty: amount });

    saveCharacter(charId, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    saveEntityStat(x, y, stats);
    this.emit("map:updated", this.map);
    return { transferred: amount, contents: stats.inventory };
  }

  /** Move qty of item from the container at (x, y) into character inventory. Character must be adjacent. */
  containerTake(charId: string, x: number, y: number, item: string, qty: number): { transferred: number; contents: { item: string; qty: number }[] } {
    const character = this.characters.get(charId);
    if (!character) throw new Error(`No character named "${charId}".`);
    this._assertAdjacent(character.x, character.y, x, y);
    const stats = this._assertContainer(x, y);

    const contSlot = stats.inventory.find(s => s.item === item);
    if (!contSlot || contSlot.qty <= 0) throw new Error(`No "${item}" in container at (${x}, ${y}).`);
    const amount = Math.min(qty, contSlot.qty);

    // Deduct from container
    contSlot.qty -= amount;
    if (contSlot.qty <= 0) stats.inventory.splice(stats.inventory.indexOf(contSlot), 1);

    // Add to character
    const charInv = character.stats.inventory as { item: string; qty: number }[];
    const charSlot = charInv.find(s => s.item === item);
    if (charSlot) charSlot.qty += amount;
    else charInv.push({ item, qty: amount });

    saveCharacter(charId, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);

    // Auto-remove container tile when all items have been taken
    if (stats.inventory.length === 0) {
      const key = `${x},${y}`;
      const layers = this.overrides.get(key) ?? [];
      layers[3] = "";
      this.overrides.set(key, layers);
      clearTileOverride(x, y, 3);
      this.entityStats.delete(key);
      deleteEntityStat(x, y);
    } else {
      saveEntityStat(x, y, stats);
    }

    this.emit("map:updated", this.map);
    return { transferred: amount, contents: stats.inventory };
  }

  /**
   * Returns all recipes split into craftable (enough ingredients) and not-craftable,
   * annotated with the character's current inventory quantities.
   */
  listCraftable(id: string): {
    craftable: Array<{
      recipe: string;
      description: string;
      output: Record<string, number>;
      ingredients: Record<string, { required: number; available: number }>;
    }>;
    notCraftable: Array<{
      recipe: string;
      description: string;
      output: Record<string, number>;
      ingredients: Record<string, { required: number; available: number; missing: number }>;
    }>;
  } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);

    const inv = character.stats.inventory as { item: string; qty: number }[];
    const getQty = (item: string) => inv.find((s) => s.item === item)?.qty ?? 0;

    const craftable = [];
    const notCraftable = [];

    for (const [recipeName, recipe] of Object.entries(RECIPES)) {
      let canCraft = true;
      const ingredients: Record<string, { required: number; available: number; missing?: number }> = {};

      for (const [ingredient, required] of Object.entries(recipe.ingredients)) {
        const available = getQty(ingredient);
        const missing = Math.max(0, required - available);
        ingredients[ingredient] = { required, available, ...(missing > 0 ? { missing } : {}) };
        if (missing > 0) canCraft = false;
      }

      if (canCraft) {
        craftable.push({ recipe: recipeName, description: recipe.description, output: recipe.output, ingredients: ingredients as Record<string, { required: number; available: number }> });
      } else {
        notCraftable.push({ recipe: recipeName, description: recipe.description, output: recipe.output, ingredients: ingredients as Record<string, { required: number; available: number; missing: number }> });
      }
    }

    return { craftable, notCraftable };
  }

  /**
   * Equip an item from a character's inventory into a slot.
   * - `hands`: item must have `equippable: true` in item-defs.json
   * - Other slots: item must have `wearable: "<slot>"` in item-defs.json
   * If the slot is already occupied the existing item is returned to inventory first.
   */
  equip(id: string, item: string, slot: EquipmentSlot): { equipped: { item: string; qty: number }; swapped: { item: string; qty: number } | null } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character with id "${id}".`);

    if (slot === "hands") {
      if (!isEquippable(item)) throw new Error(`"${item}" cannot be equipped (equippable: false in item-defs.json).`);
    } else {
      if (!isWearable(item, slot)) throw new Error(`"${item}" cannot be worn in slot "${slot}" (check wearable field in item-defs.json).`);
    }

    const inv = character.stats.inventory as { item: string; qty: number }[];
    const invSlot = inv.find(i => i.item === item);
    if (!invSlot || invSlot.qty < 1) throw new Error(`No "${item}" in inventory.`);

    const eq = character.stats.equipment;
    const swapped = eq[slot] ? { ...eq[slot]! } : null;

    // Return previously-equipped item to inventory
    if (swapped) {
      const existing = inv.find(i => i.item === swapped.item);
      if (existing) existing.qty += swapped.qty;
      else inv.push({ ...swapped });
    }

    // Remove one from inventory
    invSlot.qty -= 1;
    if (invSlot.qty <= 0) inv.splice(inv.indexOf(invSlot), 1);

    // Place in slot
    eq[slot] = { item, qty: 1 };

    saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    this.emit("map:updated", this.map);
    return { equipped: { item, qty: 1 }, swapped };
  }

  /**
   * Unequip a slot — returns the item to the character's inventory.
   */
  unequip(id: string, slot: EquipmentSlot): { item: string; qty: number } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character with id "${id}".`);

    const eq = character.stats.equipment;
    const slotItem = eq[slot];
    if (!slotItem) throw new Error(`Slot "${slot}" is empty.`);

    // Return to inventory
    const inv = character.stats.inventory as { item: string; qty: number }[];
    const existing = inv.find(i => i.item === slotItem.item);
    if (existing) existing.qty += slotItem.qty;
    else inv.push({ ...slotItem });

    eq[slot] = null;

    saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    this.emit("map:updated", this.map);
    return slotItem;
  }

  private regrowEntity(x: number, y: number, tileId: string, def: typeof HARVEST_DEFS[string]): void {
    const key = `${x},${y}`;
    this.regrowTimers.delete(key);

    // Restore ALL resource fields from defaults
    const current = this.entityStats.get(key);
    if (!current && def.emptyBase) return; // was swapped to empty, but stats gone — skip

    const defaults = ENTITY_DEFAULTS[tileId];
    if (!defaults) return;
    const newStats: EntityStats = { ...(current ?? defaults) };
    for (const [k, v] of Object.entries(defaults)) {
      if (typeof v === "number") (newStats as unknown as Record<string, number>)[k] = v;
    }
    this.entityStats.set(key, newStats);
    saveEntityStat(x, y, newStats);

    // Restore full tiles
    const overrideLayers = this.overrides.get(key) ?? [];
    overrideLayers[3] = def.fullBase;
    this.overrides.set(key, overrideLayers);
    saveOverride(x, y, 3, def.fullBase);

    if (def.fullTop) {
      const topKey = `${x},${y - 1}`;
      const topLayers = this.overrides.get(topKey) ?? [];
      topLayers[4] = def.fullTop;
      this.overrides.set(topKey, topLayers);
      saveOverride(x, y - 1, 4, def.fullTop);
    }

    this.emit("map:updated", this.map);
  }

  /**
   * Send a structured command to a character.
   * - `move_to`: directly pathfind to the given coordinates OR find nearest cell matching target_filter
   */
  sendCommand(id: string, cmd: { move_to?: { x?: number; y?: number; target_filter?: string[] } }): { character: CharacterInstance; entityPos: Point | null; notFound?: { searched: string[]; nearby: Record<string, number> } } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);

    let target: Point | null = null;
    let entityPos: Point | null = null;
    let newAction = "idle";

    if (cmd.move_to) {
      if (cmd.move_to.target_filter) {
        target = resolveTargetFilter(
          cmd.move_to.target_filter,
          { x: character.x, y: character.y },
          this.overrides,
          this.map,
        );
        newAction = target ? "searching" : "idle";
        if (!target) {
          const nearby = this.scanNearby({ x: character.x, y: character.y });
          return { character, entityPos: null, notFound: { searched: cmd.move_to.target_filter, nearby } };
        }
      } else if (cmd.move_to.x !== undefined && cmd.move_to.y !== undefined) {
        target = { x: cmd.move_to.x, y: cmd.move_to.y };
        newAction = "moving";
      }
    }

    if (target) {
      entityPos = { x: target.x, y: target.y };

      // If the target cell has a blocking entity OR a two-tile canopy (layer 4),
      // redirect to the nearest walkable adjacent cell
      const targetOverrides = this.overrides.get(`${target.x},${target.y}`);
      const targetL3 = targetOverrides?.[3] ?? "";
      const targetL4 = targetOverrides?.[4] ?? "";
      if ((targetL3 && BLOCKING_IDS.has(targetL3)) || targetL4) {
        const adj = this._nearestAdjacentWalkable(target, { x: character.x, y: character.y });
        if (!adj) {
          throw new Error(`No accessible adjacent cell next to (${target.x},${target.y}).`);
        }
        target = adj;
      }

      const path = findPath(
        { x: character.x, y: character.y },
        target,
        this.overrides,
        this.map.width,
        this.map.height,
        BLOCKING_IDS,
      );

      if (!path) {
        throw new Error(`No path found from (${character.x},${character.y}) to (${target.x},${target.y}).`);
      }

      if (path.length > 0) {
        character.path = path;
        character.action = newAction;
      }
      // path.length === 0 means already at the destination — success, no movement needed
    }

    saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    this.emit("map:updated", this.map);
    return { character, entityPos };
  }

  /** Find the nearest walkable cardinal neighbour of `target`, preferring cells closer to `origin`. */
  private _nearestAdjacentWalkable(target: Point, origin: Point): Point | null {
    const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    let best: Point | null = null;
    let bestDist = Infinity;

    for (const d of dirs) {
      const nb: Point = { x: target.x + d.x, y: target.y + d.y };
      if (nb.x < 0 || nb.x >= this.map.width || nb.y < 0 || nb.y >= this.map.height) continue;
      const key = `${nb.x},${nb.y}`;
      const layers = this.overrides.get(key);
      if (!layers || layers[1] !== "grass") continue;
      const l3 = layers[3] ?? "";
      const l4 = layers[4] ?? "";
      if (l3 || l4) continue; // skip occupied cells (entity at layer 3 or canopy at layer 4)
      const dist = Math.abs(nb.x - origin.x) + Math.abs(nb.y - origin.y);
      if (dist < bestDist) { bestDist = dist; best = nb; }
    }

    return best;
  }


  /** Make a character say something; the text appears in the UI for 8 seconds. */
  say(id: string, text: string): void {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);
    const MAX_CHARS = 280;
    if (text.length > MAX_CHARS) throw new Error(`Text too long: ${text.length} chars (max ${MAX_CHARS}).`);
    character.speech = { text: text.trim(), expiresAt: Date.now() + 8000 };
    this.emit("map:updated", this.map);
  }

  /**
   * Plant a seed at the character's current cell.
   * Consumes 1 unit of seedItem from inventory and places a sprout that grows over time.
   */
  plant(id: string, seedItem: string): { planted: string } {
    const character = this.characters.get(id);
    if (!character) throw new Error(`No character named "${id}".`);

    // Map seed → first sprout stage
    const SEED_TO_SPROUT: Record<string, string> = {
      acorns:  "oak_sprout",
      berries: "berry_sprout",
      cotton_seed: "cotton_sprout",
      flower_blue_seed: "flower_blue_sprout",
      flower_red_seed: "flower_red_sprout",
      flower_purple_seed: "flower_purple_sprout",
      flower_white_seed: "flower_white_sprout",
    };
    const sproutId = SEED_TO_SPROUT[seedItem];
    if (!sproutId) throw new Error(`"${seedItem}" is not a plantable seed. Valid seeds: ${Object.keys(SEED_TO_SPROUT).join(", ")}.`);

    const inv = character.stats.inventory as { item: string; qty: number }[];
    const slot = inv.find(i => i.item === seedItem);
    if (!slot || slot.qty < 1) throw new Error(`No "${seedItem}" in inventory.`);

    const key = `${character.x},${character.y}`;
    const existing = this.overrides.get(key)?.[3] ?? "";
    if (existing) throw new Error(`Cannot plant here: cell (${character.x},${character.y}) is already occupied by "${existing}".`);

    // Consume 1 seed
    slot.qty -= 1;
    if (slot.qty <= 0) inv.splice(inv.indexOf(slot), 1);

    // Place sprout
    const layers = this.overrides.get(key) ?? [];
    while (layers.length <= 3) layers.push("");
    layers[3] = sproutId;
    this.overrides.set(key, layers);

    const plantedAt = Date.now();
    const sproutStats = { plantedAt } as unknown as EntityStats;
    this.entityStats.set(key, sproutStats);

    runTransaction(() => {
      saveOverride(character.x, character.y, 3, sproutId);
      saveEntityStat(character.x, character.y, sproutStats);
      saveCharacter(id, character.x, character.y, character.stats, character.path, character.action, character.tileId, character.hairTileId, character.beardTileId, character.shelter);
    });
    this.overridesVersion = loadOverridesVersion();

    // Schedule growth
    this._scheduleGrowth(character.x, character.y, sproutId, plantedAt);

    this.emit("map:updated", this.map);
    return { planted: sproutId };
  }

  /** Schedule a growth timer for a sprout at (x, y). */
  private _scheduleGrowth(x: number, y: number, tileId: string, plantedAt: number): void {
    const def = GROWTH_DEFS[tileId];
    if (!def) return;

    const key = `${x},${y}`;
    const existing = this.growthTimers.get(key);
    if (existing) clearTimeout(existing);

    const elapsed = Date.now() - plantedAt;
    const remaining = Math.max(0, def.growthMs - elapsed);

    const timer = setTimeout(() => {
      this.growEntity(x, y, tileId);
    }, remaining);
    this.growthTimers.set(key, timer);
  }

  /** Advance a sprout at (x, y) to its next growth stage. */
  private growEntity(x: number, y: number, tileId: string): void {
    const key = `${x},${y}`;
    this.growthTimers.delete(key);

    const def = GROWTH_DEFS[tileId];
    if (!def) return;

    // Verify the tile is still there (could have been removed by the player)
    const currentTile = this.overrides.get(key)?.[3];
    if (currentTile !== tileId) return;

    const nextId = def.nextStage;
    const layers = this.overrides.get(key) ?? [];
    while (layers.length <= 3) layers.push("");

    // If the mature stage is a two-tile tree, place canopy too
    const entityDef = ENTITY_DEF_BY_ID.get(nextId);
    const topId = entityDef?.topTileId;

    // Set stats for the new entity
    this.entityStats.delete(key);
    deleteEntityStat(x, y);
    const initStats = { ...(ENTITY_DEFAULTS[nextId] ?? {}) } as Record<string, unknown>;
    applyRandomStats(nextId, initStats);
    const nextGrowth = GROWTH_DEFS[nextId];
    if (nextGrowth) {
      // Still a sprout — keep plantedAt for next stage
      initStats.plantedAt = Date.now();
    }

    // If the mature entity has regrowable fruits, start in the empty (no-fruit) state
    // so fruits appear naturally after the regrow delay — same as after harvesting.
    const harvestDef = !nextGrowth ? HARVEST_DEFS[nextId] : undefined;
    const startEmpty = !!(harvestDef?.emptyBase && harvestDef?.regrowMs);
    if (startEmpty) {
      layers[3] = harvestDef!.emptyBase!;
      // Zero out harvestable resources (berries, acorns, etc.) — leave health intact
      for (const k of Object.keys(initStats)) {
        if (k !== "health" && !k.startsWith("max") && typeof initStats[k] === "number") {
          initStats[k] = 0;
        }
      }
    } else {
      layers[3] = nextId;
    }
    this.overrides.set(key, layers);

    runTransaction(() => {
      saveOverride(x, y, 3, layers[3]);
      if (topId) saveOverride(x, y - 1, 4, topId);
      if (Object.keys(initStats).length > 0) saveEntityStat(x, y, initStats as EntityStats);
      else deleteEntityStat(x, y);
    });

    if (Object.keys(initStats).length > 0) {
      this.entityStats.set(key, initStats as EntityStats);
    }

    // Place canopy in-memory
    if (topId) {
      const topKey = `${x},${y - 1}`;
      const topLayers = this.overrides.get(topKey) ?? [];
      while (topLayers.length <= 3) topLayers.push("");
      topLayers[4] = topId;
      this.overrides.set(topKey, topLayers);
    }

    this.overridesVersion = loadOverridesVersion();
    this.emit("map:updated", this.map);

    // Schedule next stage if still growing
    if (nextGrowth) {
      const plantedAt = initStats.plantedAt as number;
      this._scheduleGrowth(x, y, nextId, plantedAt);
    }

    // Schedule fruit regrow for entities that started empty
    if (startEmpty) {
      const existingTimer = this.regrowTimers.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        this.regrowEntity(x, y, nextId, harvestDef!);
      }, harvestDef!.regrowMs!);
      if ((timer as NodeJS.Timeout).unref) (timer as NodeJS.Timeout).unref();
      this.regrowTimers.set(key, timer);
    }
  }

  /** Re-arm growth timers for sprouts that persisted across a server restart. */
  private _rearmGrowthTimers(): void {
    for (const [key, stats] of this.entityStats) {
      const layers = this.overrides.get(key);
      const tileId = layers?.[3];
      if (!tileId) continue;
      const def = GROWTH_DEFS[tileId];
      if (!def) continue;
      const plantedAt = (stats as unknown as Record<string, number>).plantedAt ?? Date.now();
      const [xs, ys] = key.split(",");
      this._scheduleGrowth(parseInt(xs, 10), parseInt(ys, 10), tileId, plantedAt);
    }
  }

  /** Re-arm regrow timers for harvested/empty entities that persisted across a server restart. */
  private _rearmRegrowTimers(): void {
    // Build reverse map: emptyBase tile ID → { fullTileId, harvestDef }
    const emptyToFull = new Map<string, { fullId: string; def: typeof HARVEST_DEFS[string] }>();
    for (const [fullId, def] of Object.entries(HARVEST_DEFS)) {
      if (def?.emptyBase) emptyToFull.set(def.emptyBase, { fullId, def });
    }

    for (const [key, layers] of this.overrides) {
      const tileId = layers[3];
      if (!tileId) continue;
      const entry = emptyToFull.get(tileId);
      if (!entry) continue;
      const [xs, ys] = key.split(",");
      const x = parseInt(xs, 10);
      const y = parseInt(ys, 10);
      const existingTimer = this.regrowTimers.get(key);
      if (existingTimer) continue; // already scheduled (e.g. from growEntity during startup)
      const timer = setTimeout(() => {
        this.regrowEntity(x, y, entry.fullId, entry.def);
      }, entry.def.regrowMs!);
      if ((timer as NodeJS.Timeout).unref) (timer as NodeJS.Timeout).unref();
      this.regrowTimers.set(key, timer);
    }
  }

  /** Advance all characters with pending paths by one step. Called every 500ms. */
  private tick(): void {
    let anyChanged = false;
    const cfg = getIslandConfig();
    const TICK_S = cfg.tickMs / 1000;

    const hungerDrain  = cfg.hungerDrainPerSecond * TICK_S;
    const healthDrain  = cfg.healthDrainPerSecond  * TICK_S;
    const passiveRegen = cfg.energyRegenPassive    * TICK_S;
    const moveStepCost       = cfg.energyCosts.moveStep;
    const moveStepOnPathCost = cfg.energyCosts.moveStepOnPath;

    // Collect characters whose state changed so we can flush them in one transaction.
    const changedCharacters: CharacterInstance[] = [];
    const deadCharacters: CharacterInstance[] = [];

    for (const character of this.characters.values()) {
      let changed = false;
      const s = character.stats;

      // ── Hunger drain ────────────────────────────────────────────────────────
      if (s.hunger > 0) {
        s.hunger = Math.max(0, s.hunger - hungerDrain);
        changed = true;
      }

      // ── Sheltered in tent: boosted regen, skip fire/movement ─────────────
      if (character.shelter) {
        // Health drain from starvation still applies
        if (s.hunger === 0 && s.health > 0) {
          s.health = Math.max(0, s.health - healthDrain);
          changed = true;
        }
        if (s.health <= 0) {
          deadCharacters.push(character);
          anyChanged = true;
          continue;
        }
        // Boosted energy regen (same rate as campfire aura)
        const tentRegenRate = 5 * TICK_S;
        if (s.energy < s.maxEnergy) {
          s.energy = Math.min(s.maxEnergy, s.energy + tentRegenRate);
          changed = true;
        }
        // Health regen when fed
        if (s.hunger > 0 && s.health < s.maxHealth) {
          s.health = Math.min(s.maxHealth, s.health + cfg.healthRegenPassive * TICK_S);
          changed = true;
        }
        if (changed) changedCharacters.push(character);
        continue; // skip fire damage, movement, etc.
      }

      // ── Fire damage when standing on a hazardous tile ────────────────────────
      if (s.health > 0) {
        const standKey = `${character.x},${character.y}`;
        const standTileId = this.overrides.get(standKey)?.[3];
        if (standTileId) {
          const dmgPerSec = ENTITY_DEF_BY_ID.get(standTileId)?.fireDamage ?? 0;
          if (dmgPerSec > 0) {
            s.health = Math.max(0, s.health - dmgPerSec * TICK_S);
            changed = true;
          }
        }
      }

      // ── Health drain when starving ───────────────────────────────────────────
      if (s.hunger === 0 && s.health > 0) {
        s.health = Math.max(0, s.health - healthDrain);
        changed = true;
      }

      // ── Character death → skull ─────────────────────────────────────────────
      if (s.health <= 0) {
        deadCharacters.push(character);
        anyChanged = true;
        continue;
      }

      // ── Health regen when fed and standing still ──────────────────────────────
      if (s.hunger > 0 && s.health > 0 && s.health < s.maxHealth && character.path.length === 0) {
        s.health = Math.min(s.maxHealth, s.health + cfg.healthRegenPassive * TICK_S);
        changed = true;
      }

      // ── Energy regen (passive, or boosted by adjacent entity aura) ───────────
      if (s.health > 0 && s.energy < s.maxEnergy) {
        // Check 8 adjacent tiles for the highest energyRegen aura
        let bestAura = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const adjKey = `${character.x + dx},${character.y + dy}`;
            const adjLayers = this.overrides.get(adjKey);
            const tileId = adjLayers?.[3];
            if (tileId) {
              const aura = ENTITY_DEF_BY_ID.get(tileId)?.energyRegen ?? 0;
              if (aura > bestAura) bestAura = aura;
            }
          }
        }
        const regenRate = bestAura > 0 ? bestAura * TICK_S : passiveRegen;
        s.energy = Math.min(s.maxEnergy, s.energy + regenRate);
        changed = true;
      }

      // ── Movement step ────────────────────────────────────────────────────────
      if (character.path.length > 0) {
        if (s.energy < moveStepCost) {
          // Out of energy — stop moving
          character.path = [];
          character.action = "idle";
          changed = true;
        } else {
          const next = character.path.shift()!;
          character.x = next.x;
          character.y = next.y;
          const onPath = isPathTileId(this.getLayer(next.x, next.y, 2));
          s.energy = Math.max(0, s.energy - (onPath ? moveStepOnPathCost : moveStepCost));
          if (character.path.length === 0) character.action = "idle";
          changed = true;
        }
      }

      // ── Speech expiry ────────────────────────────────────────────────────────
      if (character.speech && Date.now() >= character.speech.expiresAt) {
        delete character.speech;
        changed = true;
      }

      if (changed) {
        anyChanged = true;
        changedCharacters.push(character);
      }
    }

    // ── Entity decay ─────────────────────────────────────────────────────────
    // Collect all DB mutations so they can be flushed in one transaction below.
    const decayedEntities: { x: number; y: number; stats: EntityStats }[] = [];
    type OverrideWrite   = { x: number; y: number; layer: number; tileId: string };
    type OverrideClear   = { x: number; y: number; layer: number };
    type StatWrite       = { x: number; y: number; stats: EntityStats };
    type StatDelete      = { x: number; y: number };
    const overrideWrites: OverrideWrite[] = [];
    const overrideClears: OverrideClear[] = [];
    const statWrites: StatWrite[] = [];
    const statDeletes: StatDelete[] = [];

    for (const [key, stats] of this.entityStats) {
      const layers = this.overrides.get(key);
      const tileId = layers?.[3];
      if (!tileId) continue;
      const decay = DECAY_DEFS[tileId];
      if (!decay) continue;

      const drain = decay.ratePerSecond * TICK_S;
      stats.health = Math.max(0, stats.health - drain);

      if (stats.health <= 0) {
        const [x, y] = key.split(",").map(Number);
        if (decay.onEmpty) {
          layers[3] = decay.onEmpty;
          this.overrides.set(key, layers);
          overrideWrites.push({ x, y, layer: 3, tileId: decay.onEmpty });
          this.entityStats.delete(key);
          statDeletes.push({ x, y });
          const initStats = { ...(ENTITY_DEFAULTS[decay.onEmpty] ?? {}) };
          if (Object.keys(initStats).length > 0) {
            this.entityStats.set(key, initStats as EntityStats);
            statWrites.push({ x, y, stats: initStats as EntityStats });
          }
        } else {
          layers[3] = "";
          this.overrides.set(key, layers);
          overrideClears.push({ x, y, layer: 3 });
          this.entityStats.delete(key);
          statDeletes.push({ x, y });
        }
        anyChanged = true;
      } else {
        const [x, y] = key.split(",").map(Number);
        decayedEntities.push({ x, y, stats });
      }
    }

    // ── Process character deaths → spawn skull containers ────────────────────
    for (const deadChar of deadCharacters) {
      const deathKey = `${deadChar.x},${deadChar.y}`;

      // Combine inventory + equipped items into the skull's container inventory
      const containerInv: { item: string; qty: number }[] = [
        ...(deadChar.stats.inventory as { item: string; qty: number }[]),
      ];
      for (const eq of Object.values(deadChar.stats.equipment)) {
        if (eq) containerInv.push({ item: eq.item, qty: eq.qty });
      }

      // Place skull entity on the map (layer 3)
      const layers = this.overrides.get(deathKey) ?? [];
      while (layers.length <= 3) layers.push("");
      layers[3] = "skull";
      this.overrides.set(deathKey, layers);
      overrideWrites.push({ x: deadChar.x, y: deadChar.y, layer: 3, tileId: "skull" });

      // Set skull entity stats (container inventory)
      const skullStats = { inventory: containerInv } as unknown as EntityStats;
      this.entityStats.set(deathKey, skullStats);
      statWrites.push({ x: deadChar.x, y: deadChar.y, stats: skullStats });

      // Remove character from memory
      this.characters.delete(deadChar.id);
    }

    // ── Flush all DB writes in a single transaction ───────────────────────────
    if (changedCharacters.length > 0 || deadCharacters.length > 0 ||
        overrideWrites.length > 0 || overrideClears.length > 0 ||
        statWrites.length > 0 || statDeletes.length > 0 || decayedEntities.length > 0) {
      runTransaction(() => {
        for (const c of changedCharacters) {
          saveCharacter(c.id, c.x, c.y, c.stats, c.path, c.action, c.tileId, c.hairTileId, c.beardTileId, c.shelter);
        }
        for (const deadChar of deadCharacters) deleteCharacter(deadChar.id);
        for (const { x, y, layer, tileId } of overrideWrites) saveOverride(x, y, layer, tileId);
        for (const { x, y, layer } of overrideClears)          clearTileOverride(x, y, layer);
        for (const { x, y }        of statDeletes)             deleteEntityStat(x, y);
        for (const { x, y, stats } of statWrites)              saveEntityStat(x, y, stats);
        if (decayedEntities.length > 0) saveEntityStatsBatch(decayedEntities);
      });
    }

    if (anyChanged) {
      this.emit("map:updated", this.map);
    }
  }

  private startGameTick(): void {
    const cfg = getIslandConfig();
    this.tickTimer = setInterval(() => this.tick(), cfg.tickMs);
    // Don't let the interval prevent process exit
    if (this.tickTimer.unref) this.tickTimer.unref();
  }

  /** Watch config/*.json files and hot-reload the relevant registry on change. */
  watchConfigs(): void {
    const configs: Array<{ path: () => string; reload: () => void; name: string }> = [
      { path: CONFIG_PATH_TILES,    reload: reloadTiles,        name: "tileset.json"   },
      { path: CONFIG_PATH_ENTITIES, reload: reloadEntities,     name: "entities.json"  },
      { path: CONFIG_PATH_RECIPES,  reload: reloadRecipes,      name: "recipes.json"   },
      { path: CONFIG_PATH_ITEMS,    reload: reloadItemDefs,     name: "item-defs.json" },
      { path: () => CONFIG_PATH_ISLAND, reload: reloadIslandConfig, name: "world.json"   },
    ];

    for (const { path, reload, name } of configs) {
      let debounce: ReturnType<typeof setTimeout> | null = null;
      watch(path(), () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          try {
            reload();
            process.stderr.write(`[config] Hot-reloaded ${name}\n`);
            this.emit("map:updated", this.map);
          } catch (err) {
            process.stderr.write(`[config] Failed to reload ${name}: ${(err as Error).message}\n`);
          }
        }, 100);
      });
    }
    process.stderr.write("[config] Watching config/*.json for changes\n");
  }

  private mapConfig(): MapOptions {
    return {
      size: this.map.size,
      width: this.map.width,
      height: this.map.height,
      seed: this.map.seed,
    };
  }
}

