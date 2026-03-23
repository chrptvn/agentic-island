'use client';

import { useState, useEffect } from 'react';
import type { WorldMeta } from '@agentic-island/shared';

export function useWorlds(status?: 'online' | 'offline') {
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = status ? `/api/worlds?status=${status}` : '/api/worlds';
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setWorlds(data.worlds ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status]);

  return { worlds, loading, error };
}
