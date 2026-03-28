import type { Context, Next } from "hono";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export function rateLimit(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Clean up expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits) {
      if (val.resetAt <= now) hits.delete(key);
    }
  }, 60_000).unref();

  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("x-real-ip") ??
      "unknown";
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }

    entry.count++;
    if (entry.count > options.maxRequests) {
      return c.json({ error: "Too many requests" }, 429);
    }

    await next();
  };
}
