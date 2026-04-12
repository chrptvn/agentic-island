import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "node:crypto";
import type { CharacterAppearance } from "@agentic-island/shared";

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
  if (!cols.some((c) => c.name === "shelter")) {
    db.exec(`ALTER TABLE characters ADD COLUMN shelter TEXT`);
  }
  if (!cols.some((c) => c.name === "appearance")) {
    db.exec(`ALTER TABLE characters ADD COLUMN appearance TEXT`);
  }
  if (!cols.some((c) => c.name === "facing")) {
    db.exec(`ALTER TABLE characters ADD COLUMN facing TEXT NOT NULL DEFAULT 's'`);
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

import type { CharacterFacing } from "@agentic-island/shared";

import { randomAppearance as catalogRandomAppearance } from "../island/character-sprites.js";

/** Parse stored appearance JSON. Old format or missing → generate new random. */
function parseAppearance(json: string | null): CharacterAppearance {
  if (!json) return catalogRandomAppearance();
  const parsed = JSON.parse(json) as Record<string, unknown>;
  // Old format had {gender, skinColor, hairColor} — detect and re-roll
  if ("gender" in parsed && "skinColor" in parsed) {
    return catalogRandomAppearance();
  }
  return parsed as CharacterAppearance;
}

export interface CharacterRow {
  id: string;
  x: number;
  y: number;
  stats: object;
  path: object[];
  action: string;
  shelter?: string;
  appearance: CharacterAppearance;
  facing: CharacterFacing;
}

export function loadCharacters(): CharacterRow[] {
  const rows = db
    .prepare("SELECT id, x, y, stats, path, action, shelter, appearance, facing FROM characters")
    .all() as { id: string; x: number; y: number; stats: string; path: string; action: string; shelter: string | null; appearance: string | null; facing: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    stats: JSON.parse(r.stats),
    path: JSON.parse(r.path ?? "[]"),
    action: r.action ?? "idle",
    ...(r.shelter ? { shelter: r.shelter } : {}),
    appearance: parseAppearance(r.appearance),
    facing: (r.facing ?? "s") as CharacterFacing,
  }));
}

export function saveCharacter(
  id: string, x: number, y: number, stats: object,
  path: object[] = [], action = "idle",
  _tileId?: string, _hairTileId?: string, _beardTileId?: string,
  shelter?: string,
  appearance?: CharacterAppearance, facing: CharacterFacing = "s",
): void {
  db.prepare(
    `INSERT INTO characters (id, x, y, stats, path, action, tile_id, hair_tile_id, beard_tile_id, shelter, appearance, facing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       x=excluded.x, y=excluded.y, stats=excluded.stats, path=excluded.path,
       action=excluded.action, shelter=excluded.shelter,
       appearance=excluded.appearance, facing=excluded.facing`
  ).run(
    id, x, y, JSON.stringify(stats), JSON.stringify(path), action,
    "unused", null, null, shelter ?? null,
    appearance ? JSON.stringify(appearance) : null, facing,
  );
}

export function loadCharacter(id: string): CharacterRow | null {
  const r = db
    .prepare("SELECT id, x, y, stats, path, action, shelter, appearance, facing FROM characters WHERE id = ?")
    .get(id) as { id: string; x: number; y: number; stats: string; path: string; action: string; shelter: string | null; appearance: string | null; facing: string | null } | undefined;
  if (!r) return null;
  return {
    id: r.id,
    x: r.x,
    y: r.y,
    stats: JSON.parse(r.stats),
    path: JSON.parse(r.path ?? "[]"),
    action: r.action ?? "idle",
    ...(r.shelter ? { shelter: r.shelter } : {}),
    appearance: parseAppearance(r.appearance),
    facing: (r.facing ?? "s") as CharacterFacing,
  };
}

export function deleteCharacter(id: string): void {
  db.prepare("DELETE FROM characters WHERE id = ?").run(id);
}

/** Delete all characters and their associated markers + journal entries. */
export function clearAllCharacters(): void {
  runTransaction(() => {
    db.prepare("DELETE FROM journal").run();
    db.prepare("DELETE FROM character_markers").run();
    db.prepare("DELETE FROM characters").run();
  });
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

// ── Passports ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS passports (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    key_hash   TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    appearance TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

export interface PassportRow {
  id: string;
  email: string;
  key_hash: string;
  name: string;
  appearance: CharacterAppearance;
  created_at: string;
  updated_at: string;
}

export function savePassport(
  id: string,
  email: string,
  keyHash: string,
  name: string,
  appearance: CharacterAppearance,
): void {
  db.prepare(
    `INSERT INTO passports (id, email, key_hash, name, appearance)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       key_hash = excluded.key_hash,
       name = excluded.name,
       appearance = excluded.appearance,
       updated_at = datetime('now')`,
  ).run(id, email, keyHash, name, JSON.stringify(appearance));
}

export function updatePassportAppearance(
  email: string,
  name: string,
  appearance: CharacterAppearance,
): boolean {
  const result = db.prepare(
    `UPDATE passports SET name = ?, appearance = ?, updated_at = datetime('now') WHERE email = ?`,
  ).run(name, JSON.stringify(appearance), email);
  return result.changes > 0;
}

function parsePassportAppearance(json: string): CharacterAppearance {
  try {
    return JSON.parse(json) as CharacterAppearance;
  } catch {
    return {} as CharacterAppearance;
  }
}

export function getPassportByEmail(email: string): PassportRow | null {
  const r = db.prepare("SELECT * FROM passports WHERE email = ?").get(email) as
    | { id: string; email: string; key_hash: string; name: string; appearance: string; created_at: string; updated_at: string }
    | undefined;
  if (!r) return null;
  return { ...r, appearance: parsePassportAppearance(r.appearance) };
}

export function getPassportByKeyHash(keyHash: string): PassportRow | null {
  const r = db.prepare("SELECT * FROM passports WHERE key_hash = ?").get(keyHash) as
    | { id: string; email: string; key_hash: string; name: string; appearance: string; created_at: string; updated_at: string }
    | undefined;
  if (!r) return null;
  return { ...r, appearance: parsePassportAppearance(r.appearance) };
}

/** Get or create the island-specific passport salt (stored in world_state). */
export function getOrCreatePassportSalt(): string {
  const existing = loadState<string>("passport_salt");
  if (existing) return existing;
  const salt = randomBytes(32).toString("hex");
  saveState("passport_salt", salt);
  return salt;
}
