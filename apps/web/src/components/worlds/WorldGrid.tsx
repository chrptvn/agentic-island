'use client';

import { useState } from 'react';
import { useWorlds } from '@/hooks/useWorlds';
import Button from '@/components/ui/Button';
import WorldCard from './WorldCard';

type Filter = 'online' | 'all';

export default function WorldGrid() {
  const [filter, setFilter] = useState<Filter>('online');
  const { worlds, loading, error } = useWorlds(
    filter === 'online' ? 'online' : undefined,
  );

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-8 flex gap-4 border-b border-border-muted">
        {(['online', 'all'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`cursor-pointer pb-2 text-sm font-medium transition-colors ${
              filter === tab
                ? 'border-b-2 border-accent-cyan text-accent-cyan'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab === 'online' ? 'Online' : 'All'}
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
            No worlds online right now — be the first to share yours!
          </p>
          <Button href="/passport" variant="primary" size="sm" className="mt-4">
            Get a Passport
          </Button>
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
