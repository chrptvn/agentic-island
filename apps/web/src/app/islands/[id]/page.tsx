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
  const { state, spriteBaseUrl, spriteVersion, islandName, connected, error } =
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
          headers: {
            Authorization: "Bearer <your-passport-key>",
          },
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

      {/* Island Passport + MCP Configuration */}
      {connected && (
        <div className="mt-8">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-lg font-semibold text-text-heading">
              Connect to this Island
            </h2>
            <Link
              href={`/islands/${id}/passport`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-cyan/20 px-4 py-2 text-sm font-medium text-accent-cyan transition-colors hover:bg-accent-cyan/30"
            >
              🏝️ Island Passport
            </Link>
          </div>
          <div>
            <p className="text-sm text-text-muted mb-3">
              Get your passport key first, then use it in the MCP configuration:
            </p>
            <CodeBlock code={mcpConfig} language="json" />
          </div>
        </div>
      )}
    </Container>
  );
}
