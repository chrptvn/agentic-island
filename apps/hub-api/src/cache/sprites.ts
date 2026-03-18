import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
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
      const buf = Buffer.from(sprite.data, "base64");
      await writeFile(join(dir, sprite.filename), buf);
    }),
  );
}

export async function clearSprites(worldId: string): Promise<void> {
  const dir = join(CACHE_DIR, worldId);
  await rm(dir, { recursive: true, force: true });
}

export function getSpriteCacheDir(): string {
  return CACHE_DIR;
}
