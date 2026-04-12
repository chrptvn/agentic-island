import type { IslandMeta } from '@agentic-island/shared';

// Hub API base URL for server-side calls
const HUB_API_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL || 'https://hub.agenticisland.ai';

// For client-side: use relative URLs (proxied by Next.js rewrites)
// For server-side: use absolute HUB_API_URL

export async function fetchIslands(
  status?: 'online' | 'offline',
): Promise<IslandMeta[]> {
  const url = status ? `/api/islands?status=${status}` : '/api/islands';
  const baseUrl = typeof window === 'undefined' ? HUB_API_URL : '';
  const res = await fetch(`${baseUrl}${url}`, { next: { revalidate: 30 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.islands ?? [];
}

export async function claimHubKey(
  email: string,
): Promise<{ sent: boolean; maskedEmail: string; smtpConfigured: boolean } | null> {
  const res = await fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchSmtpStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch('/api/health/smtp');
    if (!res.ok) return { configured: true };
    return res.json();
  } catch {
    return { configured: true };
  }
}
