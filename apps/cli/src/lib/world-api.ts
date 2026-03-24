import { resolveUrl } from "./config.js";

export interface WorldApiConfig {
  worldUrl: string;
}

export function resolveWorldConfig(opts: { worldUrl?: string }): WorldApiConfig {
  return { worldUrl: resolveUrl(opts) };
}

export async function worldRequest<T>(
  config: WorldApiConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${config.worldUrl}${path}`;
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
