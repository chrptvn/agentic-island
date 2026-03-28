import { Hono } from "hono";
import db from "../db/index.js";

const worlds = new Hono();

interface WorldRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  player_count: number;
  status: string;
  last_heartbeat_at: string | null;
  created_at: string;
}

function toCamelCase(row: WorldRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    thumbnailUrl: row.thumbnail_path ?? undefined,
    playerCount: row.player_count,
    status: row.status,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
  };
}

worlds.get("/", (c) => {
  const filter = c.req.query("filter");
  const cols =
    "id, name, description, thumbnail_path, player_count, status, last_heartbeat_at, created_at";

  let rows: WorldRow[];
  if (filter === "with-agents") {
    rows = db
      .prepare(
        `SELECT ${cols} FROM worlds WHERE status = 'online' AND player_count > 0 ORDER BY updated_at DESC`,
      )
      .all() as WorldRow[];
  } else {
    rows = db
      .prepare(`SELECT ${cols} FROM worlds ORDER BY updated_at DESC`)
      .all() as WorldRow[];
  }

  return c.json({ worlds: rows.map(toCamelCase) });
});

worlds.get("/:id", (c) => {
  const id = c.req.param("id");
  const row = db.prepare(
    "SELECT id, name, description, thumbnail_path, player_count, status, last_heartbeat_at, created_at FROM worlds WHERE id = ?"
  ).get(id) as WorldRow | undefined;
  if (!row) return c.json({ error: "World not found" }, 404);

  db.prepare("INSERT INTO world_views (world_id) VALUES (?)").run(id);

  return c.json(toCamelCase(row));
});

export default worlds;
