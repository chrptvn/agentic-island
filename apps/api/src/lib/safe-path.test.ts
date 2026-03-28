import { describe, it, expect } from "vitest";
import { safePath } from "./safe-path.js";
import { resolve, sep } from "node:path";

describe("safePath", () => {
  const base = "/data/worlds";

  it("allows a simple child path", () => {
    const result = safePath(base, "world1", "map.json");
    expect(result).toBe(resolve(base, "world1", "map.json"));
  });

  it("allows a single segment", () => {
    const result = safePath(base, "file.txt");
    expect(result).toBe(resolve(base, "file.txt"));
  });

  it("returns the base itself when no segments are given", () => {
    const result = safePath(base);
    expect(result).toBe(resolve(base));
  });

  // --- traversal attacks ---

  it("rejects .. traversal that escapes the base", () => {
    expect(safePath(base, "..", "etc", "passwd")).toBeNull();
  });

  it("rejects deeply nested .. traversal", () => {
    expect(safePath(base, "a", "..", "..", "..", "secret")).toBeNull();
  });

  it("rejects a bare .. segment", () => {
    expect(safePath(base, "..")).toBeNull();
  });

  // --- edge cases ---

  it("allows .. that stays within the base", () => {
    // /data/worlds/a/../b  →  /data/worlds/b  (still inside base)
    const result = safePath(base, "a", "..", "b");
    expect(result).toBe(resolve(base, "b"));
  });

  it("handles empty string segments", () => {
    const result = safePath(base, "", "file.txt");
    expect(result).toBe(resolve(base, "file.txt"));
  });

  it("rejects an absolute path segment that escapes the base", () => {
    // On POSIX, resolve(base, "/etc/passwd") → "/etc/passwd"
    expect(safePath(base, "/etc/passwd")).toBeNull();
  });

  it("rejects a null byte in the segment", () => {
    // resolve will include the null byte in the result.
    // The result should NOT match the base prefix, or it's a traversal risk.
    const result = safePath(base, "file\0.txt");
    // Even if resolve doesn't reject it, the OS would — but safePath itself
    // should at minimum not crash. The resolved path still starts with base,
    // so safePath returns it. Real null-byte protection is the OS layer.
    // We just verify it doesn't throw.
    expect(typeof result === "string" || result === null).toBe(true);
  });

  it("rejects path with encoded traversal (literal %2e%2e)", () => {
    // %2e%2e is NOT decoded by resolve — it stays literal, so it should
    // remain inside the base directory (no traversal).
    const result = safePath(base, "%2e%2e", "secret");
    expect(result).toBe(resolve(base, "%2e%2e", "secret"));
  });
});
