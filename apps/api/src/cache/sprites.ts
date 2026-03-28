import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { SpriteAsset } from "@agentic-island/shared";

const CACHE_DIR = process.env.SPRITE_CACHE_DIR ?? "sprite-cache";

export async function saveSprites(
  worldId: string,
  sprites: SpriteAsset[],
): Promise<void> {
  const dir = join(CACHE_DIR, worldId);
  await mkdir(dir, { recursive: true });

  await Promise.all(
    sprites.map(async (sprite) => {
      const dest = join(dir, sprite.filename);
      // Create subdirectories if the filename contains path separators
      await mkdir(dirname(dest), { recursive: true });
      const buf = Buffer.from(sprite.data, "base64");
      await writeFile(dest, buf);
    }),
  );
}

export async function clearSprites(worldId: string): Promise<void> {
  const dir = join(CACHE_DIR, worldId);
  await rm(dir, { recursive: true, force: true });
}

/**
 * Save an island thumbnail to the sprite cache directory.
 * Returns the relative URL path for serving the thumbnail.
 */
export async function saveThumbnail(
  worldId: string,
  thumbnail: SpriteAsset,
): Promise<string> {
  const dir = join(CACHE_DIR, worldId);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, "thumbnail.png");
  const buf = Buffer.from(thumbnail.data, "base64");
  await writeFile(dest, buf);
  return `/sprites/${worldId}/thumbnail.png`;
}

export function getSpriteCacheDir(): string {
  return CACHE_DIR;
}
