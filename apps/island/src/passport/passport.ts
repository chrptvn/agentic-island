import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CharacterAppearance, CharacterCatalog } from "@agentic-island/shared";
import {
  getOrCreatePassportSalt,
  getPassportByEmail,
  getPassportByKeyHash,
  savePassport,
  updatePassportAppearance,
  type PassportRow,
} from "../persistence/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "../../config/character-catalog.json");

let catalogCache: CharacterCatalog | null = null;

/** Load the character catalog from disk (cached after first read). */
export function getCharacterCatalog(): CharacterCatalog {
  if (!catalogCache) {
    catalogCache = JSON.parse(readFileSync(CATALOG_PATH, "utf-8")) as CharacterCatalog;
  }
  return catalogCache;
}

/** Generate a deterministic passport key from email + island salt. */
export function generatePassportKey(email: string): string {
  const salt = getOrCreatePassportSalt();
  const hash = createHash("sha256")
    .update(email.toLowerCase().trim() + salt)
    .digest("hex")
    .slice(0, 32);
  return `ip_${hash}`;
}

/** Hash a passport key for storage. */
export function hashPassportKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Mask an email for display (e.g. "u***@example.com"). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

export interface PassportCreateResult {
  success: true;
  rawKey: string;
  maskedEmail: string;
}

export interface PassportError {
  success: false;
  error: string;
}

/**
 * Create a passport for the given email.
 * If a passport already exists for this email, re-derive the key (deterministic)
 * and return it — effectively a "resend" operation.
 */
export function createPassport(
  email: string,
  name: string,
  appearance: CharacterAppearance,
): PassportCreateResult | PassportError {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { success: false, error: "Invalid email address" };
  }
  if (!name.trim()) {
    return { success: false, error: "Name is required" };
  }

  const existing = getPassportByEmail(normalizedEmail);
  const rawKey = generatePassportKey(normalizedEmail);
  const keyHash = hashPassportKey(rawKey);

  if (existing) {
    // Update name + appearance, re-derive same key
    updatePassportAppearance(normalizedEmail, name.trim(), appearance);
  } else {
    const id = randomUUID();
    savePassport(id, normalizedEmail, keyHash, name.trim(), appearance);
  }

  return {
    success: true,
    rawKey,
    maskedEmail: maskEmail(normalizedEmail),
  };
}

/**
 * Validate a passport key and return the passport data.
 * Returns null if the key is invalid.
 */
export function validatePassportKey(rawKey: string): PassportRow | null {
  if (!rawKey || !rawKey.startsWith("ip_")) return null;
  const keyHash = hashPassportKey(rawKey);
  return getPassportByKeyHash(keyHash);
}
