'use client';

import { useState } from 'react';
import { useWorlds, type WorldFilter } from '@/hooks/useWorlds';
import WorldCard from './WorldCard';

const TABS: { key: WorldFilter; label: string }[] = [
  { key: 'with-agents', label: 'With Agents' },
  { key: 'all', label: 'All' },
];

export default function WorldGrid() {
  const [filter, setFilter] = useState<WorldFilter>('with-agents');
  const { worlds, loading, error } = useWorlds(filter);

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-8 flex gap-4 border-b border-border-muted">
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
