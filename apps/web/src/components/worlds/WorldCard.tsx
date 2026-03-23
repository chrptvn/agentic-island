import Link from 'next/link';
import type { WorldMeta } from '@agentic-island/shared';
import Card from '@/components/ui/Card';

type WorldCardProps = {
  world: WorldMeta;
};

export default function WorldCard({ world }: WorldCardProps) {
  const isOnline = world.status === 'online';

  return (
    <Link href={`/worlds/${world.id}`} className="block">
      <Card hover>
        <h3 className="text-lg font-bold text-text-heading">{world.name}</h3>

        {world.description && (
          <p className="mt-1 text-sm text-text-muted line-clamp-2">
            {world.description}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-text-muted">
            👥 {world.playerCount}
          </span>

          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isOnline ? 'bg-accent-emerald' : 'bg-text-muted'
              }`}
            />
            <span className={isOnline ? 'text-accent-emerald' : 'text-text-muted'}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </span>
        </div>
      </Card>
    </Link>
  );
}
