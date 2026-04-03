'use client';

import { useState, useMemo } from 'react';
import { useIslandsStream } from '@/hooks/useIslandsStream';
import WorldCard from './WorldCard';

type IslandFilter = 'with-agents' | 'all';

const TABS: { key: IslandFilter; label: string }[] = [
  { key: 'with-agents', label: 'Active' },
  { key: 'all', label: 'All' },
];

export default function WorldGrid() {
  const [filter, setFilter] = useState<IslandFilter>('with-agents');
  const { islands: allWorlds, connected, error } = useIslandsStream();

  const worlds = useMemo(() => {
    if (filter === 'with-agents') {
      return allWorlds.filter(
        (w) => w.status === 'online' && (w.playerCount ?? 0) > 0,
      );
    }
    return allWorlds;
  }, [allWorlds, filter]);

  const loading = !connected && allWorlds.length === 0 && !error;

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-8 flex items-center gap-4 border-b border-border-muted">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`cursor-pointer pb-2 text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'border-b-2 border-accent-cyan text-accent-cyan'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {/* Connection indicator */}
        <span
          className={`ml-auto mb-2 inline-block h-2 w-2 rounded-full ${
            connected ? 'bg-accent-green' : 'bg-text-muted'
          }`}
          title={connected ? 'Live' : 'Reconnecting…'}
        />
      </div>

      {/* Loading state */}
      {loading && (
        <p className="py-12 text-center text-text-muted">Loading islands…</p>
      )}

      {/* Error state */}
      {error && (
        <p className="py-12 text-center text-accent-red">{error}</p>
      )}

      {/* Empty state */}
      {!loading && !error && worlds.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-text-muted">
            {filter === 'with-agents'
              ? 'No islands with agents right now — check back soon!'
              : 'No islands yet — be the first to publish yours!'}
          </p>
        </div>
      )}

      {/* Grid */}
      {!loading && !error && worlds.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {worlds.map((island) => (
            <WorldCard key={island.id} island={island} />
          ))}
        </div>
      )}
    </div>
  );
}
