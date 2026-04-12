import { createHash, randomBytes } from "node:crypto";
import { readFile, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

let hubKeySalt: string | undefined;

/**
 * Initialize the hub key salt. If HUB_KEY_SALT is not set in the environment,
 * generate a cryptographically random salt and persist it to the API's .env file
 * so subsequent restarts use the same value.
 */
export async function initHubKeySalt(): Promise<void> {
  if (process.env.HUB_KEY_SALT) {
    hubKeySalt = process.env.HUB_KEY_SALT;
    return;
  }

  // Generate a random 32-byte hex salt
  const generated = randomBytes(32).toString("hex");
  hubKeySalt = generated;

  // Persist to .env so it survives restarts
  const envPath = join(import.meta.dirname, "../../.env");
  try {
    let content = "";
    try {
      content = await readFile(envPath, "utf-8");
    } catch {
      // .env doesn't exist yet — we'll create it
    }

    const line = `HUB_KEY_SALT=${generated}`;
    if (content && !content.endsWith("\n")) {
      await appendFile(envPath, `\n${line}\n`);
    } else if (content) {
      await appendFile(envPath, `${line}\n`);
    } else {
      await writeFile(envPath, `${line}\n`);
    }

    // Also set it in the current process env
    process.env.HUB_KEY_SALT = generated;

    console.log(
      "[hub-key] Generated new HUB_KEY_SALT and saved to .env",
    );
  } catch (err) {
    console.warn(
      "[hub-key] Could not persist HUB_KEY_SALT to .env — using ephemeral salt for this session:",
      err,
    );
  }
}

export function getHubKeySalt(): string {
  if (!hubKeySalt) {
    throw new Error(
      "Hub key salt not initialized. Call initHubKeySalt() at startup.",
    );
  }
  return hubKeySalt;
}

export function generateHubKey(email: string): string {
  const salt = getHubKeySalt();
  const normalized = email.toLowerCase().trim();
  const hash = createHash("sha256")
    .update(normalized + salt)
    .digest("hex");
  return `ai_${hash.substring(0, 32)}`;
}
