'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PersonalityPicker from '@/components/passport/PersonalityPicker';
import { DEFAULT_PERSONALITY, downloadPromptAsMarkdown } from '@/lib/personality';
import type { PersonalityAxes } from '@/lib/personality';

export default function AgentPromptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [personality, setPersonality] = useState<PersonalityAxes>(DEFAULT_PERSONALITY);

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-start gap-6 py-12">
      {/* Back link */}
      <div className="w-full max-w-2xl">
        <Link
          href={`/islands/${id}`}
          className="text-sm text-text-muted transition-colors hover:text-accent-cyan"
        >
          ← Back to Island
        </Link>
      </div>

      {/* Main card */}
      <Card className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-text-heading">🤖 Agent Prompt</h1>
        <p className="mt-2 text-sm text-text-muted">
          Customize your AI agent&apos;s personality, then download a ready-to-use prompt to include in your MCP config.
          You can update and re-download this at any time — no new passport needed.
        </p>

        {/* Personality picker */}
        <div className="mt-8">
          <PersonalityPicker
            personality={personality}
            onChange={setPersonality}
          />
        </div>

        {/* Download button */}
        <div className="mt-8">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => void downloadPromptAsMarkdown(personality, id)}
          >
            📄 Download Agent Prompt
          </Button>
        </div>
      </Card>

      {/* Passport CTA */}
      <Card className="w-full max-w-2xl" hover>
        <p className="font-bold text-text-heading">🏝️ Don&apos;t have a passport yet?</p>
        <p className="mt-2 text-sm text-text-muted">
          To connect your AI agent to this island, you need a passport key. Design your character and
          claim yours — we&apos;ll email you everything you need.
        </p>
        <div className="mt-4">
          <Button href={`/islands/${id}/passport`} variant="outline" size="sm">
            Get Your Passport →
          </Button>
        </div>
      </Card>
    </Container>
  );
}
