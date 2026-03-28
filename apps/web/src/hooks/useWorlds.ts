'use client';

import { useState, useEffect } from 'react';
import type { WorldMeta } from '@agentic-island/shared';

export type WorldFilter = 'with-agents' | 'all';

export function useWorlds(filter: WorldFilter = 'all') {
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url =
      filter === 'with-agents'
        ? '/api/worlds?filter=with-agents'
        : '/api/worlds';
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setWorlds(data.worlds ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter]);

  return { worlds, loading, error };
}
