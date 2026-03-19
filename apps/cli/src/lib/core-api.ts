export interface CoreConfig {
  coreUrl: string;
}

export function resolveCoreConfig(opts: { coreUrl?: string }): CoreConfig {
  const coreUrl = opts.coreUrl ?? process.env.CORE_URL ?? "http://localhost:3000";
  return { coreUrl: coreUrl.replace(/\/$/, "") };
}

export async function coreRequest<T>(
  config: CoreConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${config.coreUrl}${path}`;
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
