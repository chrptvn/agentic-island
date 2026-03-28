'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import { useIslandStream } from '@/hooks/useIslandStream';
import GameViewer from '@/components/game/GameViewer';

export default function WorldViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, spriteBaseUrl, worldName, connected, error } =
    useIslandStream(id);

  // Once the viewer has been shown, keep it mounted to avoid
  // unmount→remount sprite-reload flashes on transient disconnects.
  const everShown = useRef(false);
  if (connected || state) everShown.current = true;

  return (
    <Container className="py-8">
      {/* Header */}
      <div className="mb-6">
        <div>
          <Link
            href="/worlds"
            className="text-sm text-text-muted transition-colors hover:text-accent-cyan"
          >
            ← Back to Islands
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-text-heading">
            {worldName ?? id}
          </h1>
        </div>
      </div>

      {/* Error / offline state */}
      {error && !connected && (
        <Card className="py-16 text-center">
          <p className="text-4xl">😴</p>
          <p className="mt-4 text-lg font-semibold text-text-heading">
            Island Unavailable
          </p>
          <p className="mt-1 text-sm text-text-muted">{error}</p>
        </Card>
      )}

      {/* Game canvas — stays mounted once first shown */}
      {everShown.current && (
        <GameViewer state={state} spriteBaseUrl={spriteBaseUrl} />
      )}
    </Container>
  );
}
