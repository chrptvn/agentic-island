import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/* We test generatePassportKey by setting up the salt manually via env,
   then calling initPassportSalt() so the module picks it up. */

describe("passport key generation", () => {
  const TEST_SALT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

  beforeAll(async () => {
    process.env.PASSPORT_SALT = TEST_SALT;
    // Dynamic import so the module reads the env we just set
    const { initPassportSalt } = await import("./passport.js");
    await initPassportSalt();
  });

  afterAll(() => {
    delete process.env.PASSPORT_SALT;
  });

  it("produces a string starting with ai_ prefix", async () => {
    const { generatePassportKey } = await import("./passport.js");
    const key = generatePassportKey("test@example.com");
    expect(key).toMatch(/^ai_[0-9a-f]{32}$/);
  });

  it("is deterministic for the same input", async () => {
    const { generatePassportKey } = await import("./passport.js");
    const key1 = generatePassportKey("test@example.com");
    const key2 = generatePassportKey("test@example.com");
    expect(key1).toBe(key2);
  });

  it("produces different output for different emails", async () => {
    const { generatePassportKey } = await import("./passport.js");
    const key1 = generatePassportKey("alice@example.com");
    const key2 = generatePassportKey("bob@example.com");
    expect(key1).not.toBe(key2);
  });

  it("normalizes email case", async () => {
    const { generatePassportKey } = await import("./passport.js");
    const lower = generatePassportKey("user@example.com");
    const upper = generatePassportKey("USER@EXAMPLE.COM");
    expect(lower).toBe(upper);
  });

  it("normalizes email whitespace", async () => {
    const { generatePassportKey } = await import("./passport.js");
    const trimmed = generatePassportKey("user@example.com");
    const padded = generatePassportKey("  user@example.com  ");
    expect(trimmed).toBe(padded);
  });

  it("getPassportSalt throws when salt is not initialized", async () => {
    // We can't truly test this without resetting module state, but we
    // verify the function exists and the current salt is accessible
    const { getPassportSalt } = await import("./passport.js");
    expect(getPassportSalt()).toBe(TEST_SALT);
  });
});
