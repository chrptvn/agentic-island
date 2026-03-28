import { Hono } from "hono";
import db from "../db/index.js";

const islands = new Hono();

interface IslandRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  player_count: number;
  status: string;
  last_heartbeat_at: string | null;
  created_at: string;
}

function toCamelCase(row: IslandRow) {
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

islands.get("/", (c) => {
  const filter = c.req.query("filter");
  const cols =
    "id, name, description, thumbnail_path, player_count, status, last_heartbeat_at, created_at";

  let rows: IslandRow[];
  if (filter === "with-agents") {
    rows = db
      .prepare(
        `SELECT ${cols} FROM islands WHERE status = 'online' AND player_count > 0 ORDER BY updated_at DESC`,
      )
      .all() as IslandRow[];
  } else {
    rows = db
      .prepare(`SELECT ${cols} FROM islands WHERE status = 'online' ORDER BY updated_at DESC`)
      .all() as IslandRow[];
  }

  return c.json({ islands: rows.map(toCamelCase) });
});

islands.get("/:id", (c) => {
  const id = c.req.param("id");
  const row = db.prepare(
    "SELECT id, name, description, thumbnail_path, player_count, status, last_heartbeat_at, created_at FROM islands WHERE id = ?"
  ).get(id) as IslandRow | undefined;
  if (!row) return c.json({ error: "Island not found" }, 404);

  db.prepare("INSERT INTO island_views (island_id) VALUES (?)").run(id);

  return c.json(toCamelCase(row));
});

export default islands;
