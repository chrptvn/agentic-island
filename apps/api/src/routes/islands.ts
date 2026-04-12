import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import db from "../db/index.js";

const islands = new Hono();

interface IslandRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  player_count: number;
  secured: number;
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
    secured: Boolean(row.secured),
    status: row.status,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
  };
}

islands.get("/", (c) => {
  const filter = c.req.query("filter");
  const cols =
    "id, name, description, thumbnail_path, player_count, secured, status, last_heartbeat_at, created_at";

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
    "SELECT id, name, description, thumbnail_path, player_count, secured, status, last_heartbeat_at, created_at FROM islands WHERE id = ?"
  ).get(id) as IslandRow | undefined;
  if (!row) return c.json({ error: "Island not found" }, 404);

  db.prepare("INSERT INTO island_views (island_id) VALUES (?)").run(id);

  return c.json(toCamelCase(row));
});

/**
 * Regenerate access key for a secured island.
 * Requires Authorization header with the island's hub key (API key).
 */
islands.post("/:id/regenerate-key", async (c) => {
  const id = c.req.param("id");
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization required — use Bearer token with your hub key" }, 401);
  }

  const hubKey = authHeader.slice(7);
  const hubKeyHash = createHash("sha256").update(hubKey).digest("hex");

  // Verify hub key and check island ownership
  const row = db.prepare(`
    SELECT i.id, i.secured, ak.id as api_key_id
    FROM islands i
    JOIN api_keys ak ON i.api_key_id = ak.id
    WHERE i.id = ? AND ak.key_hash = ?
  `).get(id, hubKeyHash) as { id: string; secured: number; api_key_id: string } | undefined;

  if (!row) {
    return c.json({ error: "Island not found or invalid hub key" }, 404);
  }

  if (!row.secured) {
    return c.json({ error: "Island is not secured — no access key needed" }, 400);
  }

  // Generate new access key
  const accessKey = `ik_${randomBytes(16).toString("hex")}`;
  const accessKeyHash = createHash("sha256").update(accessKey).digest("hex");

  db.prepare("UPDATE islands SET access_key_hash = ? WHERE id = ?").run(accessKeyHash, id);

  return c.json({ accessKey, message: "Access key regenerated successfully" });
});

export default islands;
