import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "../..", "agentic-island.db");

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS world_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tile_overrides (
    x       INTEGER NOT NULL,
    y       INTEGER NOT NULL,
    layer   INTEGER NOT NULL DEFAULT 0,
    tile_id TEXT    NOT NULL,
    PRIMARY KEY (x, y, layer)
  );
  CREATE TABLE IF NOT EXISTS entity_stats (
    x     INTEGER NOT NULL,
    y     INTEGER NOT NULL,
    stats TEXT    NOT NULL,
    PRIMARY KEY (x, y)
  );
  CREATE TABLE IF NOT EXISTS characters (
    id     TEXT    PRIMARY KEY,
    x      INTEGER NOT NULL,
    y      INTEGER NOT NULL,
    stats  TEXT    NOT NULL,
    path   TEXT    NOT NULL DEFAULT '[]',
    action TEXT    NOT NULL DEFAULT 'idle'
  );
  CREATE TABLE IF NOT EXISTS journal (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT    NOT NULL,
    content      TEXT    NOT NULL,
    created_at   TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_journal_character_id ON journal (character_id);
`);

// ── Migration: add layer column if table was created without it ───────────────
{
  const cols = db.prepare("PRAGMA table_info(tile_overrides)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "layer")) {
    db.exec(`ALTER TABLE tile_overrides RENAME TO tile_overrides_v1`);
    db.exec(`
      CREATE TABLE tile_overrides (
        x       INTEGER NOT NULL,
        y       INTEGER NOT NULL,
        layer   INTEGER NOT NULL DEFAULT 0,
        tile_id TEXT    NOT NULL,
        PRIMARY KEY (x, y, layer)
      )
    `);
    db.exec(`INSERT INTO tile_overrides (x, y, layer, tile_id) SELECT x, y, 0, tile_id FROM tile_overrides_v1`);
    db.exec(`DROP TABLE tile_overrides_v1`);
  }
}

// ── Migration: path → layer 2, entities → layer 3/4 ─────────────────────────
{
  const hasMigration = db
    .prepare("SELECT 1 FROM world_state WHERE key = 'migration_path_layer2'")
    .get();
  if (!hasMigration) {
    db.transaction(() => {
      // Canopy layer 3 → 4
      db.exec(`
        INSERT OR REPLACE INTO tile_overrides (x, y, layer, tile_id)
          SELECT x, y, 4, tile_id FROM tile_overrides WHERE layer = 3;
        DELETE FROM tile_overrides WHERE layer = 3;
      `);
      // Entity layer 2 → 3
      db.exec(`
        INSERT OR REPLACE INTO tile_overrides (x, y, layer, tile_id)
          SELECT x, y, 3, tile_id FROM tile_overrides WHERE layer = 2;
        DELETE FROM tile_overrides WHERE layer = 2;
      `);
      // Path tiles layer 1 → 2
      db.exec(`
        INSERT OR REPLACE INTO tile_overrides (x, y, layer, tile_id)
          SELECT x, y, 2, tile_id FROM tile_overrides WHERE layer = 1 AND substr(tile_id, 1, 5) = 'path_';
        DELETE FROM tile_overrides WHERE layer = 1 AND substr(tile_id, 1, 5) = 'path_';
      `);
      // Restore layer-1 "grass" for cells that lost it when path replaced it
      db.exec(`
        INSERT OR IGNORE INTO tile_overrides (x, y, layer, tile_id)
          SELECT x, y, 1, 'grass' FROM tile_overrides WHERE layer = 2 AND substr(tile_id, 1, 5) = 'path_';
      `);
    })();
    db.prepare(
      "INSERT OR REPLACE INTO world_state (key, value) VALUES ('migration_path_layer2', '1')"
    ).run();
  }
}
{
  const cols = db.prepare("PRAGMA table_info(characters)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "path")) {
    db.exec(`ALTER TABLE characters ADD COLUMN path TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!cols.some((c) => c.name === "action")) {
    db.exec(`ALTER TABLE characters ADD COLUMN action TEXT NOT NULL DEFAULT 'idle'`);
  }
  if (!cols.some((c) => c.name === "tile_id")) {
    db.exec(`ALTER TABLE characters ADD COLUMN tile_id TEXT NOT NULL DEFAULT 'human'`);
  }
  if (!cols.some((c) => c.name === "hair_tile_id")) {
    db.exec(`ALTER TABLE characters ADD COLUMN hair_tile_id TEXT`);
  }
  if (!cols.some((c) => c.name === "beard_tile_id")) {
    db.exec(`ALTER TABLE characters ADD COLUMN beard_tile_id TEXT`);
  }
}


export function runTransaction(fn: () => void): void {
  db.transaction(fn)();
}

export function loadState<T>(key: string): T | null {
  const row = db.prepare("SELECT value FROM world_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function saveState(key: string, value: unknown): void {
  db.prepare(
    "INSERT INTO world_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

// ── Tile overrides ────────────────────────────────────────────────────────────

/**
 * Returns a map from "x,y" → string[] where the array index is the layer.
 * Empty string means no override for that layer.
 */
export function loadOverrides(): Map<string, string[]> {
  const rows = db
    .prepare("SELECT x, y, layer, tile_id FROM tile_overrides ORDER BY layer")
    .all() as { x: number; y: number; layer: number; tile_id: string }[];

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const key = `${r.x},${r.y}`;
    const layers = map.get(key) ?? [];
    while (layers.length <= r.layer) layers.push("");
    layers[r.layer] = r.tile_id;
    map.set(key, layers);
  }
  return map;
}

export function saveOverride(x: number, y: number, layer: number, tileId: string): void {
  db.prepare(
    "INSERT INTO tile_overrides (x, y, layer, tile_id) VALUES (?, ?, ?, ?) ON CONFLICT(x,y,layer) DO UPDATE SET tile_id = excluded.tile_id"
  ).run(x, y, layer, tileId);
  incrementOverridesVersion();
}

export function saveOverridesBatch(
  entries: { x: number; y: number; layer: number; tileId: string }[]
): void {
  const stmt = db.prepare(
    "INSERT INTO tile_overrides (x, y, layer, tile_id) VALUES (?, ?, ?, ?) ON CONFLICT(x,y,layer) DO UPDATE SET tile_id = excluded.tile_id"
  );
  db.transaction(() => {
    for (const { x, y, layer, tileId } of entries) {
      stmt.run(x, y, layer, tileId);
    }
  })();
  incrementOverridesVersion();
}

export function clearTileOverride(x: number, y: number, layer: number): void {
  db.prepare("DELETE FROM tile_overrides WHERE x = ? AND y = ? AND layer = ?").run(x, y, layer);
  incrementOverridesVersion();
}

export function clearOverrides(): void {
  db.prepare("DELETE FROM tile_overrides").run();
  incrementOverridesVersion();
}

export function loadOverridesVersion(): number {
  return (loadState<number>("overrides_version")) ?? 0;
}

function incrementOverridesVersion(): void {
  saveState("overrides_version", loadOverridesVersion() + 1);
}

// ── Entity stats ──────────────────────────────────────────────────────────────

export function loadEntityStats(): Map<string, object> {
  const rows = db
    .prepare("SELECT x, y, stats FROM entity_stats")
    .all() as { x: number; y: number; stats: string }[];

  const map = new Map<string, object>();
  for (const r of rows) {
    map.set(`${r.x},${r.y}`, JSON.parse(r.stats));
  }
  return map;
}

export function saveEntityStat(x: number, y: number, stats: object): void {
  db.prepare(
    "INSERT INTO entity_stats (x, y, stats) VALUES (?, ?, ?) ON CONFLICT(x,y) DO UPDATE SET stats = excluded.stats"
  ).run(x, y, JSON.stringify(stats));
}

export function deleteEntityStat(x: number, y: number): void {
  db.prepare("DELETE FROM entity_stats WHERE x = ? AND y = ?").run(x, y);
}

export function saveEntityStatsBatch(
  entries: { x: number; y: number; stats: object }[]
): void {
  const stmt = db.prepare(
    "INSERT INTO entity_stats (x, y, stats) VALUES (?, ?, ?) ON CONFLICT(x,y) DO UPDATE SET stats = excluded.stats"
  );
  db.transaction(() => {
    for (const { x, y, stats } of entries) {
      stmt.run(x, y, JSON.stringify(stats));
    }
  })();
}

export function clearEntityStats(): void {
  db.prepare("DELETE FROM entity_stats").run();
}

// ── Characters ────────────────────────────────────────────────────────────────

export function loadCharacters(): { id: string; x: number; y: number; stats: object; path: object[]; action: string; tileId: string; hairTileId?: string; beardTileId?: string }[] {
  const rows = db
    .prepare("SELECT id, x, y, stats, path, action, tile_id, hair_tile_id, beard_tile_id FROM characters")
    .all() as { id: string; x: number; y: number; stats: string; path: string; action: string; tile_id: string; hair_tile_id: string | null; beard_tile_id: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    stats: JSON.parse(r.stats),
    path: JSON.parse(r.path ?? "[]"),
    action: r.action ?? "idle",
    tileId: r.tile_id ?? "human",
    ...(r.hair_tile_id ? { hairTileId: r.hair_tile_id } : {}),
    ...(r.beard_tile_id ? { beardTileId: r.beard_tile_id } : {}),
  }));
}

export function saveCharacter(id: string, x: number, y: number, stats: object, path: object[] = [], action = "idle", tileId = "human", hairTileId?: string, beardTileId?: string): void {
  db.prepare(
    "INSERT INTO characters (id, x, y, stats, path, action, tile_id, hair_tile_id, beard_tile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET x=excluded.x, y=excluded.y, stats=excluded.stats, path=excluded.path, action=excluded.action, tile_id=excluded.tile_id, hair_tile_id=excluded.hair_tile_id, beard_tile_id=excluded.beard_tile_id"
  ).run(id, x, y, JSON.stringify(stats), JSON.stringify(path), action, tileId, hairTileId ?? null, beardTileId ?? null);
}

export function deleteCharacter(id: string): void {
  db.prepare("DELETE FROM characters WHERE id = ?").run(id);
}

// ── Character markers ─────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS character_markers (
    character_id TEXT    NOT NULL,
    x            INTEGER NOT NULL,
    y            INTEGER NOT NULL,
    description  TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    PRIMARY KEY (character_id, x, y)
  );
`);

// Migration: drop old name-based schema if it exists
{
  const cols = db.prepare("PRAGMA table_info(character_markers)").all() as { name: string }[];
  if (cols.some((c) => c.name === "name")) {
    db.exec(`DROP TABLE character_markers`);
    db.exec(`
      CREATE TABLE character_markers (
        character_id TEXT    NOT NULL,
        x            INTEGER NOT NULL,
        y            INTEGER NOT NULL,
        description  TEXT    NOT NULL,
        created_at   TEXT    NOT NULL,
        PRIMARY KEY (character_id, x, y)
      );
    `);
  }
}

export interface CharacterMarker {
  character_id: string;
  x: number;
  y: number;
  description: string;
  created_at: string;
}

export function upsertMarker(characterId: string, x: number, y: number, description: string): CharacterMarker {
  const created_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO character_markers (character_id, x, y, description, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(character_id, x, y) DO UPDATE SET description = excluded.description, created_at = excluded.created_at`
  ).run(characterId, x, y, description, created_at);
  return { character_id: characterId, x, y, description, created_at };
}

export function listMarkers(characterId: string): CharacterMarker[] {
  return db
    .prepare("SELECT character_id, x, y, description, created_at FROM character_markers WHERE character_id = ? ORDER BY created_at ASC")
    .all(characterId) as CharacterMarker[];
}

export function deleteMarkerByLocation(characterId: string, x: number, y: number): boolean {
  const result = db
    .prepare("DELETE FROM character_markers WHERE character_id = ? AND x = ? AND y = ?")
    .run(characterId, x, y);
  return result.changes > 0;
}

// ── Journal ───────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: number;
  character_id: string;
  content: string;
  created_at: string;
}

export function writeJournalEntry(characterId: string, content: string): JournalEntry {
  const created_at = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO journal (character_id, content, created_at) VALUES (?, ?, ?)")
    .run(characterId, content, created_at);
  return { id: result.lastInsertRowid as number, character_id: characterId, content, created_at };
}

export function readJournalEntries(characterId: string): JournalEntry[] {
  return db
    .prepare("SELECT id, character_id, content, created_at FROM journal WHERE character_id = ? ORDER BY created_at ASC")
    .all(characterId) as JournalEntry[];
}
