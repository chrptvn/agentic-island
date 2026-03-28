import { describe, it, expect } from "vitest";
import { isValidEmail } from "./validation.js";

describe("isValidEmail", () => {
  const validEmails = [
    "user@example.com",
    "alice.bob@domain.org",
    "name+tag@sub.domain.co",
    "x@y.io",
    "user123@test.museum",
  ];

  const invalidEmails = [
    "",
    "plaintext",
    "@missing-local.com",
    "missing-domain@",
    "missing@.dot-start",
    "spaces in@email.com",
    "user @example.com",
    "user@ example.com",
    "two@@signs.com",
    "no-tld@domain",
    "user@domain.",
  ];

  for (const email of validEmails) {
    it(`accepts valid email: ${email}`, () => {
      expect(isValidEmail(email)).toBe(true);
    });
  }

  for (const email of invalidEmails) {
    it(`rejects invalid email: "${email}"`, () => {
      expect(isValidEmail(email)).toBe(false);
    });
  }
});
