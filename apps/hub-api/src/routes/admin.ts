import { Hono } from "hono";
import { randomUUID, createHash } from "node:crypto";
import db from "../db/index.js";
import { adminAuth } from "../middleware/admin-auth.js";

const admin = new Hono();

admin.use("*", adminAuth());

// --- Keys ---

admin.get("/keys", (c) => {
  const rows = db
    .prepare(
      "SELECT id, label, created_at, last_seen_at FROM api_keys ORDER BY created_at DESC",
    )
    .all();
  return c.json({ keys: rows });
});

admin.post("/keys", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const label = (body as { label?: string }).label ?? null;
  const id = randomUUID();
  const rawKey = `ai_${randomUUID().replace(/-/g, "")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  db.prepare("INSERT INTO api_keys (id, key_hash, label) VALUES (?, ?, ?)").run(
    id,
    keyHash,
    label,
  );

  return c.json({ id, key: rawKey, label, createdAt: new Date().toISOString() }, 201);
});

admin.delete("/keys/:id", (c) => {
  const id = c.req.param("id");
  const key = db.prepare("SELECT id FROM api_keys WHERE id = ?").get(id);
  if (!key) return c.json({ error: "Key not found" }, 404);

  db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  return c.json({ success: true });
});

// --- Worlds ---

admin.get("/worlds", (c) => {
  const rows = db
    .prepare("SELECT * FROM worlds ORDER BY updated_at DESC")
    .all();
  return c.json({ worlds: rows });
});

admin.get("/worlds/:id", (c) => {
  const id = c.req.param("id");
  const row = db.prepare("SELECT * FROM worlds WHERE id = ?").get(id);
  if (!row) return c.json({ error: "World not found" }, 404);
  return c.json(row);
});

admin.delete("/worlds/:id", (c) => {
  const id = c.req.param("id");
  const world = db.prepare("SELECT id FROM worlds WHERE id = ?").get(id);
  if (!world) return c.json({ error: "World not found" }, 404);

  db.prepare("DELETE FROM world_views WHERE world_id = ?").run(id);
  db.prepare("DELETE FROM worlds WHERE id = ?").run(id);
  return c.json({ success: true });
});

export default admin;
