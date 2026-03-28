import { Hono } from "hono";
import { createHash, randomUUID } from "node:crypto";
import db from "../db/index.js";
import { adminAuth } from "../middleware/admin-auth.js";
import { generatePassportKey } from "../lib/passport.js";
import { isValidEmail } from "../lib/validation.js";

const admin = new Hono();

admin.use("*", adminAuth());

// --- Keys ---

admin.get("/keys", (c) => {
  const rows = db
    .prepare(
      "SELECT id, email, created_at, last_seen_at FROM api_keys ORDER BY created_at DESC",
    )
    .all();
  return c.json({ keys: rows });
});

admin.post("/keys", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = (body as { email?: string }).email;

  if (!email || typeof email !== "string" || !isValidEmail(email)) {
    return c.json({ error: "A valid email address is required." }, 400);
  }

  const normalized = email.toLowerCase().trim();
  const rawKey = generatePassportKey(normalized);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const existing = db
    .prepare("SELECT id FROM api_keys WHERE email = ?")
    .get(normalized) as { id: string } | undefined;

  if (existing) {
    return c.json({ id: existing.id, key: rawKey, email: normalized }, 200);
  }

  const id = randomUUID();
  db.prepare(
    "INSERT INTO api_keys (id, key_hash, email) VALUES (?, ?, ?)",
  ).run(id, keyHash, normalized);

  return c.json({ id, key: rawKey, email: normalized }, 201);
});

admin.delete("/keys/:id", (c) => {
  const id = c.req.param("id");
  const key = db.prepare("SELECT id FROM api_keys WHERE id = ?").get(id);
  if (!key) return c.json({ error: "Key not found" }, 404);

  const deleteKey = db.transaction(() => {
    // Clean up island_views for all islands owned by this key
    db.prepare(
      "DELETE FROM island_views WHERE island_id IN (SELECT id FROM islands WHERE api_key_id = ?)",
    ).run(id);
    db.prepare("DELETE FROM islands WHERE api_key_id = ?").run(id);
    db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  });
  deleteKey();

  return c.json({ success: true });
});

// --- Islands ---

admin.get("/islands", (c) => {
  const rows = db
    .prepare("SELECT * FROM islands ORDER BY updated_at DESC")
    .all();
  return c.json({ islands: rows });
});

admin.get("/islands/:id", (c) => {
  const id = c.req.param("id");
  const row = db.prepare("SELECT * FROM islands WHERE id = ?").get(id);
  if (!row) return c.json({ error: "Island not found" }, 404);
  return c.json(row);
});

admin.delete("/islands/:id", (c) => {
  const id = c.req.param("id");
  const island = db.prepare("SELECT id FROM islands WHERE id = ?").get(id);
  if (!island) return c.json({ error: "Island not found" }, 404);

  const deleteIsland = db.transaction(() => {
    db.prepare("DELETE FROM island_views WHERE island_id = ?").run(id);
    db.prepare("DELETE FROM islands WHERE id = ?").run(id);
  });
  deleteIsland();

  return c.json({ success: true });
});

export default admin;
