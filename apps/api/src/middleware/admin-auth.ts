import type { Context, Next } from "hono";

export function adminAuth() {
  return async (c: Context, next: Next) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return c.json({ error: "Admin access not configured (ADMIN_KEY not set)" }, 503);
    }

    const auth = c.req.header("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token || token !== adminKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  };
}
