import { Hono } from "hono";
import { randomUUID, createHash } from "node:crypto";
import db from "../db/index.js";

const keys = new Hono();

keys.post("/", async (c) => {
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

export default keys;
