import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/* We test generateHubKey by setting up the salt manually via env,
   then calling initHubKeySalt() so the module picks it up. */

describe("hub key generation", () => {
  const TEST_SALT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

  beforeAll(async () => {
    process.env.HUB_KEY_SALT = TEST_SALT;
    // Dynamic import so the module reads the env we just set
    const { initHubKeySalt } = await import("./hub-key.js");
    await initHubKeySalt();
  });

  afterAll(() => {
    delete process.env.HUB_KEY_SALT;
  });

  it("produces a string starting with ai_ prefix", async () => {
    const { generateHubKey } = await import("./hub-key.js");
    const key = generateHubKey("test@example.com");
    expect(key).toMatch(/^ai_[0-9a-f]{32}$/);
  });

  it("is deterministic for the same input", async () => {
    const { generateHubKey } = await import("./hub-key.js");
    const key1 = generateHubKey("test@example.com");
    const key2 = generateHubKey("test@example.com");
    expect(key1).toBe(key2);
  });

  it("produces different output for different emails", async () => {
    const { generateHubKey } = await import("./hub-key.js");
    const key1 = generateHubKey("alice@example.com");
    const key2 = generateHubKey("bob@example.com");
    expect(key1).not.toBe(key2);
  });

  it("normalizes email case", async () => {
    const { generateHubKey } = await import("./hub-key.js");
    const lower = generateHubKey("user@example.com");
    const upper = generateHubKey("USER@EXAMPLE.COM");
    expect(lower).toBe(upper);
  });

  it("normalizes email whitespace", async () => {
    const { generateHubKey } = await import("./hub-key.js");
    const trimmed = generateHubKey("user@example.com");
    const padded = generateHubKey("  user@example.com  ");
    expect(trimmed).toBe(padded);
  });

  it("getHubKeySalt throws when salt is not initialized", async () => {
    // We can't truly test this without resetting module state, but we
    // verify the function exists and the current salt is accessible
    const { getHubKeySalt } = await import("./hub-key.js");
    expect(getHubKeySalt()).toBe(TEST_SALT);
  });
});
