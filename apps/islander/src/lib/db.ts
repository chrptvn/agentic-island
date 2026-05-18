import DatabaseConstructor, { type Database } from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { CONFIG_DIR } from "./config.js";
import { join } from "path";

const DB_PATH = join(CONFIG_DIR, "state.sql");

export type IslanderStatus = "running" | "stopped" | "error";

export interface IslanderRow {
  id: string;
  status: IslanderStatus;
  pid: number | null;
  last_activity: string | null;
}

export interface LogRow {
  id: number;
  islander_id: string;
  ts: string;
  role: string;
  content: string;
}

let _db: Database | null = null;

export function openDB(): Database {
  if (_db) return _db;
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  _db = new DatabaseConstructor(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS islanders (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'stopped',
      pid INTEGER,
      last_activity TEXT
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      islander_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL
    );
  `);
  return _db;
}

export function upsertIslander(id: string): void {
  const db = openDB();
  db.prepare(`INSERT OR IGNORE INTO islanders (id) VALUES (?)`).run(id);
}

export function updateStatus(id: string, status: IslanderStatus, pid?: number | null): void {
  const db = openDB();
  upsertIslander(id);
  db.prepare(`UPDATE islanders SET status = ?, pid = ?, last_activity = ? WHERE id = ?`).run(
    status,
    pid ?? null,
    new Date().toISOString(),
    id,
  );
}

export function getIslanderRow(id: string): IslanderRow | undefined {
  const db = openDB();
  return db.prepare(`SELECT * FROM islanders WHERE id = ?`).get(id) as IslanderRow | undefined;
}

export function getAllIslanderRows(): IslanderRow[] {
  const db = openDB();
  return db.prepare(`SELECT * FROM islanders ORDER BY id`).all() as IslanderRow[];
}

export function insertLog(islanderId: string, role: string, content: string): void {
  const db = openDB();
  db.prepare(`INSERT INTO logs (islander_id, ts, role, content) VALUES (?, ?, ?, ?)`).run(
    islanderId,
    new Date().toISOString(),
    role,
    content,
  );
}

export function getLogs(islanderId: string, limit = 20): LogRow[] {
  const db = openDB();
  return db
    .prepare(`SELECT * FROM logs WHERE islander_id = ? ORDER BY id DESC LIMIT ?`)
    .all(islanderId, limit) as LogRow[];
}

export function clearIslanderRows(id: string): void {
  const db = openDB();
  db.prepare(`DELETE FROM islanders WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM logs WHERE islander_id = ?`).run(id);
}
