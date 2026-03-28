import type Database from "better-sqlite3";

export function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS islands (
      id TEXT PRIMARY KEY,
      api_key_id TEXT NOT NULL REFERENCES api_keys(id),
      name TEXT NOT NULL,
      description TEXT,
      config_snapshot TEXT,
      thumbnail_path TEXT,
      player_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'offline',
      last_heartbeat_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS island_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      island_id TEXT REFERENCES islands(id),
      viewed_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add thumbnail_path column if missing (for existing databases)
  const cols = db
    .prepare("PRAGMA table_info(islands)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "thumbnail_path")) {
    db.exec("ALTER TABLE islands ADD COLUMN thumbnail_path TEXT");
  }
}
