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
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      config_snapshot TEXT,
      thumbnail_path TEXT,
      player_count INTEGER DEFAULT 0,
      secured INTEGER DEFAULT 0,
      access_key_hash TEXT,
      status TEXT DEFAULT 'offline',
      last_heartbeat_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS island_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      island_id TEXT REFERENCES islands(id) ON DELETE CASCADE,
      viewed_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes for commonly queried columns
    CREATE INDEX IF NOT EXISTS idx_islands_api_key_id
      ON islands(api_key_id);

    CREATE INDEX IF NOT EXISTS idx_islands_status_updated_at
      ON islands(status, updated_at);

    CREATE INDEX IF NOT EXISTS idx_islands_updated_at
      ON islands(updated_at);

    CREATE INDEX IF NOT EXISTS idx_island_views_island_id
      ON island_views(island_id);
  `);

  // Migration: add thumbnail_path column if missing (for existing databases)
  const cols = db
    .prepare("PRAGMA table_info(islands)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "thumbnail_path")) {
    db.exec("ALTER TABLE islands ADD COLUMN thumbnail_path TEXT");
  }
  // Migration: add secured and access_key_hash columns if missing
  if (!cols.some((c) => c.name === "secured")) {
    db.exec("ALTER TABLE islands ADD COLUMN secured INTEGER DEFAULT 0");
  }
  if (!cols.some((c) => c.name === "access_key_hash")) {
    db.exec("ALTER TABLE islands ADD COLUMN access_key_hash TEXT");
  }
}
