import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { MAX_SPRITE_UPLOAD_BYTES } from "@agentic-island/shared";
import type { SpriteAsset } from "@agentic-island/shared";

export type SpritePayload = SpriteAsset;

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif"]);

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

/**
 * Recursively scan a directory for image files and package them as base64 payloads.
 */
export async function packageSprites(
  spriteDir: string,
  /** Optional path prefix prepended to all filenames. */
  prefix = "",
): Promise<SpritePayload[]> {
  const relPaths = await collectImageFiles(spriteDir, spriteDir);
  const payloads: SpritePayload[] = [];

  for (const relativePath of relPaths) {
    const filePath = join(spriteDir, relativePath);
    const ext = extname(filePath).toLowerCase();
    const mime = MIME_MAP[ext];
    if (!mime) {
      console.warn(
        `[sprite-uploader] Skipping unsupported file: ${filePath}`,
      );
      continue;
    }

    const buf = await readFile(filePath);
    payloads.push({
      filename: prefix ? `${prefix}${relativePath}` : relativePath,
      mimeType: mime,
      data: buf.toString("base64"),
    });
  }

  return payloads;
}

/**
 * Package specific files by absolute path into SpritePayload objects.
 */
export async function packageSpriteFiles(
  filePaths: string[],
): Promise<SpritePayload[]> {
  const payloads: SpritePayload[] = [];

  for (const filePath of filePaths) {
    const ext = extname(filePath).toLowerCase();
    const mime = MIME_MAP[ext];
    if (!mime) {
      console.warn(
        `[sprite-uploader] Skipping unsupported file: ${filePath}`,
      );
      continue;
    }

    const buf = await readFile(filePath);
    payloads.push({
      filename: filePath.split("/").pop() ?? filePath,
      mimeType: mime,
      data: buf.toString("base64"),
    });
  }

  return payloads;
}

/**
 * Check whether the total base64 payload is within the upload limit.
 */
export function validatePayloadSize(
  sprites: SpritePayload[],
): { valid: boolean; totalBytes: number; maxBytes: number } {
  const totalBytes = sprites.reduce((sum, s) => sum + Buffer.byteLength(s.data, "utf8"), 0);
  const valid = totalBytes <= MAX_SPRITE_UPLOAD_BYTES;

  if (!valid) {
    console.warn(
      `[sprite-uploader] Payload too large: ${(totalBytes / 1024 / 1024).toFixed(2)} MB ` +
        `(max ${(MAX_SPRITE_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB)`,
    );
  }

  return { valid, totalBytes, maxBytes: MAX_SPRITE_UPLOAD_BYTES };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectImageFiles(
  dir: string,
  baseDir: string,
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectImageFiles(fullPath, baseDir)));
    } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      // Return path relative to baseDir so subdirectory structure is preserved
      results.push(fullPath.slice(baseDir.length).replace(/^[/\\]/, ""));
    }
  }

  return results;
}
