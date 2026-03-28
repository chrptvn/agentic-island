import type { Context, Next } from "hono";
import { createHash } from "node:crypto";
import db from "../db/index.js";

/** Middleware that validates an API key from the Authorization header. */
export function validateApiKey() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json(
        { error: "Missing API key. Use Authorization: Bearer <key>" },
        401,
      );
    }

    const rawKey = authHeader.slice(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const row = db
      .prepare("SELECT id FROM api_keys WHERE key_hash = ?")
      .get(keyHash);

    if (!row) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Store key info in context for downstream handlers
    c.set("apiKeyId", (row as { id: string }).id);
    await next();
  };
}
