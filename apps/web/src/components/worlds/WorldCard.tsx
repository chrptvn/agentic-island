import Link from 'next/link';
import type { IslandMeta } from '@agentic-island/shared';
import Card from '@/components/ui/Card';

type IslandCardProps = {
  island: IslandMeta;
};

export default function WorldCard({ island }: IslandCardProps) {
  const agentCount = island.playerCount ?? 0;

  return (
    <Link href={`/worlds/${island.id}`} className="block">
      <Card hover className="overflow-hidden !p-0">
        {island.thumbnailUrl ? (
          <div className="w-full aspect-[5/3] bg-[#1e40af]">
            <img
              src={island.thumbnailUrl}
              alt={`${island.name} map preview`}
              className="w-full h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        ) : (
          <div className="w-full aspect-[5/3] bg-gradient-to-br from-[#1e40af] to-[#22c55e]/30" />
        )}

        <div className="p-4">
          <h3 className="text-lg font-bold text-text-heading">{island.name}</h3>

          {island.description && (
            <p className="mt-1 text-sm text-text-muted line-clamp-2">
              {island.description}
            </p>
          )}

          <div className="mt-3 text-sm">
            <span className="text-text-muted">
              🤖 {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
