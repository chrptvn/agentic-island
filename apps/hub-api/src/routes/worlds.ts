import { Hono } from "hono";
import db from "../db/index.js";

const worlds = new Hono();

worlds.get("/", (c) => {
  const status = c.req.query("status");
  const cols =
    "id, name, description, player_count, status, last_heartbeat_at, created_at";
  const rows = status
    ? db
        .prepare(
          `SELECT ${cols} FROM worlds WHERE status = ? ORDER BY updated_at DESC`,
        )
        .all(status)
    : db.prepare(`SELECT ${cols} FROM worlds ORDER BY updated_at DESC`).all();

  return c.json({ worlds: rows });
});

worlds.get("/:id", (c) => {
  const id = c.req.param("id");
  const row = db.prepare("SELECT * FROM worlds WHERE id = ?").get(id);
  if (!row) return c.json({ error: "World not found" }, 404);

  db.prepare("INSERT INTO world_views (world_id) VALUES (?)").run(id);

  return c.json(row);
});

export default worlds;
