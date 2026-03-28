import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { adminAuth } from "./admin-auth.js";

/* Minimal Hono-like context mock */
function createMockContext(headers: Record<string, string> = {}) {
  const jsonSpy = vi.fn((body: unknown, status?: number) => ({
    body,
    status,
  }));
  return {
    req: {
      header: (name: string) => headers[name],
    },
    json: jsonSpy,
    _jsonSpy: jsonSpy,
  } as any;
}

describe("adminAuth middleware", () => {
  const originalEnv = process.env.ADMIN_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_KEY = originalEnv;
    } else {
      delete process.env.ADMIN_KEY;
    }
  });

  it("returns 503 when ADMIN_KEY is not set", async () => {
    delete process.env.ADMIN_KEY;
    const middleware = adminAuth();
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx._jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("not configured") }),
      503,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is missing", async () => {
    process.env.ADMIN_KEY = "test-secret-key";
    const middleware = adminAuth();
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx._jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unauthorized" }),
      401,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is not Bearer scheme", async () => {
    process.env.ADMIN_KEY = "test-secret-key";
    const middleware = adminAuth();
    const ctx = createMockContext({ Authorization: "Basic dXNlcjpwYXNz" });
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx._jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unauthorized" }),
      401,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token is wrong", async () => {
    process.env.ADMIN_KEY = "test-secret-key";
    const middleware = adminAuth();
    const ctx = createMockContext({ Authorization: "Bearer wrong-key" });
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx._jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unauthorized" }),
      401,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for an empty Bearer token", async () => {
    process.env.ADMIN_KEY = "test-secret-key";
    const middleware = adminAuth();
    const ctx = createMockContext({ Authorization: "Bearer " });
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx._jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unauthorized" }),
      401,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when Bearer token matches ADMIN_KEY", async () => {
    process.env.ADMIN_KEY = "test-secret-key";
    const middleware = adminAuth();
    const ctx = createMockContext({
      Authorization: "Bearer test-secret-key",
    });
    const next = vi.fn();

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx._jsonSpy).not.toHaveBeenCalled();
  });
});
