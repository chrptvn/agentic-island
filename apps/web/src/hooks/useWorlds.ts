'use client';

import { useState, useEffect } from 'react';
import type { IslandMeta } from '@agentic-island/shared';

export type IslandFilter = 'with-agents' | 'all';

export function useIslands(filter: IslandFilter = 'all') {
  const [worlds, setWorlds] = useState<IslandMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url =
      filter === 'with-agents'
        ? '/api/islands?filter=with-agents'
        : '/api/islands';
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setWorlds(data.islands ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter]);

  return { worlds, loading, error };
}
