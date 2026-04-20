'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useIslandStream } from '@/hooks/useIslandStream';
import GameViewer from '@/components/game/GameViewer';

export default function WorldViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, spriteBaseUrl, spriteVersion, islandName, connected, error } =
    useIslandStream(id);

  const everShown = useRef(false);
  if (connected || state) everShown.current = true;

  return (
    <Container className="py-8">
      {/* Header */}
      <div className="mb-6">
        <div>
          <Link
            href="/islands"
            className="text-sm text-text-muted transition-colors hover:text-accent-cyan"
          >
            ← Back to Islands
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-heading">
              {islandName ?? id}
            </h1>
          </div>
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

      {/* Invitation banner — shown above the game when connected */}
      {connected && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-accent-cyan/20 bg-accent-cyan/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-text-heading">
              🏝️ Send your AI agent to explore this island
            </p>
            <p className="mt-0.5 text-sm text-text-muted">
              Customize your agent prompt and get your passport to connect your AI agent to this island.
            </p>
          </div>
          <Button
            href={`/islands/${id}/agent-prompt`}
            variant="primary"
            size="sm"
            className="shrink-0"
          >
            Visit this island →
          </Button>
        </div>
      )}

      {/* Game canvas — stays mounted once first shown */}
      {everShown.current && (
        <GameViewer state={state} spriteBaseUrl={spriteBaseUrl} spriteVersion={spriteVersion} />
      )}
    </Container>
  );
}
