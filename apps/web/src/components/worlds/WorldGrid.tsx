'use client';

import { useState, useMemo } from 'react';
import { useWorldsStream } from '@/hooks/useWorldsStream';
import WorldCard from './WorldCard';

type WorldFilter = 'with-agents' | 'all';

const TABS: { key: WorldFilter; label: string }[] = [
  { key: 'with-agents', label: 'With Agents' },
  { key: 'all', label: 'All' },
];

export default function WorldGrid() {
  const [filter, setFilter] = useState<WorldFilter>('with-agents');
  const { worlds: allWorlds, connected, error } = useWorldsStream();

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
        <p className="py-12 text-center text-text-muted">Loading worlds…</p>
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
              ? 'No worlds with agents right now — check back soon!'
              : 'No worlds yet — be the first to share yours!'}
          </p>
        </div>
      )}

      {/* Grid */}
      {!loading && !error && worlds.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {worlds.map((world) => (
            <WorldCard key={world.id} world={world} />
          ))}
        </div>
      )}
    </div>
  );
}
