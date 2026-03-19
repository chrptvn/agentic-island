export interface ApiConfig {
  hubUrl: string;
  adminKey: string;
}

export function resolveConfig(opts: { hubUrl?: string; adminKey?: string }): ApiConfig {
  const hubUrl = opts.hubUrl ?? process.env.HUB_URL ?? "http://localhost:4000";
  const adminKey = opts.adminKey ?? process.env.ADMIN_KEY ?? "";

  if (!adminKey) {
    console.error("Error: ADMIN_KEY is required. Set it via --admin-key flag or ADMIN_KEY env var.");
    process.exit(1);
  }

  return { hubUrl: hubUrl.replace(/\/$/, ""), adminKey };
}

export async function apiRequest<T>(
  config: ApiConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${config.hubUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.adminKey}`,
    },
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
