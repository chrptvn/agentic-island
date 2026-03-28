import Link from 'next/link';
import type { WorldMeta } from '@agentic-island/shared';
import Card from '@/components/ui/Card';

type WorldCardProps = {
  world: WorldMeta;
};

export default function WorldCard({ world }: WorldCardProps) {
  const agentCount = world.playerCount ?? 0;

  return (
    <Link href={`/worlds/${world.id}`} className="block">
      <Card hover>
        <h3 className="text-lg font-bold text-text-heading">{world.name}</h3>

        {world.description && (
          <p className="mt-1 text-sm text-text-muted line-clamp-2">
            {world.description}
          </p>
        )}

        <div className="mt-4 text-sm">
          <span className="text-text-muted">
            🤖 {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
          </span>
        </div>
      </Card>
    </Link>
  );
}
