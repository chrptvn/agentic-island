import { createHash, randomBytes } from "node:crypto";
import { readFile, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

let passportSalt: string | undefined;

/**
 * Initialize the passport salt. If PASSPORT_SALT is not set in the environment,
 * generate a cryptographically random salt and persist it to the API's .env file
 * so subsequent restarts use the same value.
 */
export async function initPassportSalt(): Promise<void> {
  if (process.env.PASSPORT_SALT) {
    passportSalt = process.env.PASSPORT_SALT;
    return;
  }

  // Generate a random 32-byte hex salt
  const generated = randomBytes(32).toString("hex");
  passportSalt = generated;

  // Persist to .env so it survives restarts
  const envPath = join(import.meta.dirname, "../../.env");
  try {
    let content = "";
    try {
      content = await readFile(envPath, "utf-8");
    } catch {
      // .env doesn't exist yet — we'll create it
    }

    const line = `PASSPORT_SALT=${generated}`;
    if (content && !content.endsWith("\n")) {
      await appendFile(envPath, `\n${line}\n`);
    } else if (content) {
      await appendFile(envPath, `${line}\n`);
    } else {
      await writeFile(envPath, `${line}\n`);
    }

    // Also set it in the current process env
    process.env.PASSPORT_SALT = generated;

    console.log(
      "[passport] Generated new PASSPORT_SALT and saved to .env",
    );
  } catch (err) {
    console.warn(
      "[passport] Could not persist PASSPORT_SALT to .env — using ephemeral salt for this session:",
      err,
    );
  }
}

export function getPassportSalt(): string {
  if (!passportSalt) {
    throw new Error(
      "Passport salt not initialized. Call initPassportSalt() at startup.",
    );
  }
  return passportSalt;
}

export function generatePassportKey(email: string): string {
  const salt = getPassportSalt();
  const normalized = email.toLowerCase().trim();
  const hash = createHash("sha256")
    .update(normalized + salt)
    .digest("hex");
  return `ai_${hash.substring(0, 32)}`;
}
