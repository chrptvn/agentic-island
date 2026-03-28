import { resolveUrl } from "./config.js";

export interface IslandApiConfig {
  islandUrl: string;
}

export function resolveIslandConfig(opts: { islandUrl?: string }): IslandApiConfig {
  return { islandUrl: resolveUrl(opts) };
}

export async function islandRequest<T>(
  config: IslandApiConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${config.islandUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = (err as { error?: string }).error ?? res.statusText;
    console.error(`Error ${res.status}: ${msg}`);
    process.exit(1);
  }

  return res.json() as Promise<T>;
}
