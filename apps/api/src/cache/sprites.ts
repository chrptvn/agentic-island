import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { SpriteAsset } from "@agentic-island/shared";
import { safePath } from "../lib/safe-path.js";

const CACHE_DIR = process.env.SPRITE_CACHE_DIR ?? "sprite-cache";

/**
 * Save sprites to the cache directory and return a short content hash.
 * The hash changes whenever any sprite file changes, enabling cache busting.
 */
export async function saveSprites(
  islandId: string,
  sprites: SpriteAsset[],
): Promise<string> {
  const dir = join(CACHE_DIR, islandId);
  await mkdir(dir, { recursive: true });

  const hasher = createHash("sha256");
  // Sort by filename for deterministic hash regardless of arrival order
  const sorted = [...sprites].sort((a, b) =>
    a.filename.localeCompare(b.filename),
  );

  await Promise.all(
    sorted.map(async (sprite) => {
      const dest = safePath(dir, sprite.filename);
      if (!dest) {
        console.warn(
          `[sprites] Rejected path-traversal filename: ${sprite.filename}`,
        );
        return;
      }
      // Create subdirectories if the filename contains path separators
      await mkdir(dirname(dest), { recursive: true });
      const buf = Buffer.from(sprite.data, "base64");
      await writeFile(dest, buf);
    }),
  );

  // Feed sorted buffers into hash after writes complete
  for (const sprite of sorted) {
    hasher.update(sprite.filename);
    hasher.update(sprite.data);
  }

  return hasher.digest("hex").slice(0, 8);
}

export async function clearSprites(islandId: string): Promise<void> {
  const dir = join(CACHE_DIR, islandId);
  await rm(dir, { recursive: true, force: true });
}

/**
 * Save an island thumbnail to the sprite cache directory.
 * Returns the relative URL path for serving the thumbnail.
 */
export async function saveThumbnail(
  islandId: string,
  thumbnail: SpriteAsset,
): Promise<string> {
  const dir = join(CACHE_DIR, islandId);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, "thumbnail.png");
  const buf = Buffer.from(thumbnail.data, "base64");
  await writeFile(dest, buf);
  return `/sprites/${islandId}/thumbnail.png`;
}

export function getSpriteCacheDir(): string {
  return CACHE_DIR;
}
