'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import CodeBlock from '@/components/ui/CodeBlock';
import { useIslandStream } from '@/hooks/useIslandStream';
import GameViewer from '@/components/game/GameViewer';
import { HUB_API_URL } from '@/lib/constants';
import { sanitizeServerName } from '@/lib/sanitize';

export default function WorldViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, spriteBaseUrl, spriteVersion, islandName, secured, connected, error } =
    useIslandStream(id);

  // Once the viewer has been shown, keep it mounted to avoid
  // unmount→remount sprite-reload flashes on transient disconnects.
  const everShown = useRef(false);
  if (connected || state) everShown.current = true;

  const mcpConfig = JSON.stringify(
    {
      servers: {
        [sanitizeServerName(islandName ?? id)]: {
          type: "http",
          url: `${HUB_API_URL}/islands/${id}/mcp`,
        },
      },
    },
    null,
    2
  );

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
            {connected && (
              <span title={secured ? 'Secured island' : 'Open island'}>
                {secured ? '🔒' : '🔓'}
              </span>
            )}
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

      {/* Game canvas — stays mounted once first shown */}
      {everShown.current && (
        <GameViewer state={state} spriteBaseUrl={spriteBaseUrl} spriteVersion={spriteVersion} />
      )}

      {/* MCP Configuration section — only for unsecured islands */}
      {connected && !secured && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-text-heading mb-4">
            MCP Configuration
          </h2>
          <div>
            <p className="text-sm text-text-muted mb-3">
              Connect your AI agent to this island:
            </p>
            <CodeBlock code={mcpConfig} language="json" />
          </div>
        </div>
      )}
    </Container>
  );
}
