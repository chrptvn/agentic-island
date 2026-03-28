import { createHash, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";

function constantTimeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function adminAuth() {
  return async (c: Context, next: Next) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return c.json({ error: "Admin access not configured (ADMIN_KEY not set)" }, 503);
    }

    const auth = c.req.header("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token || !constantTimeEqual(token, adminKey)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  };
}
