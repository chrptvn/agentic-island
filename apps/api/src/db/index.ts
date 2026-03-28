import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { initDb } from "./schema.js";

const DB_PATH = process.env.HUB_DB_PATH ?? "hub.db";
const db: BetterSqlite3.Database = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
initDb(db);

export default db;
