'use client';

import { use, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import CharacterPreview from '@/components/passport/CharacterPreview';
import CharacterDesigner from '@/components/passport/CharacterDesigner';
import PersonalityPicker from '@/components/passport/PersonalityPicker';
import type { CharacterAppearance, CharacterCatalog } from '@agentic-island/shared';
import { claimPassport, fetchIslandSmtpStatus, fetchPassportCatalog } from '@/lib/api';
import { DEFAULT_PERSONALITY, downloadPromptAsMarkdown } from '@/lib/personality';
import type { PersonalityAxes } from '@/lib/personality';

const DEFAULT_APPEARANCE: CharacterAppearance = {
  gender: 'male',
  body: 'light',
  hair: 'buzzcut',
};

type State =
  | { step: 'designer' }
  | { step: 'success'; maskedEmail: string; sent: boolean }
  | { step: 'error'; message: string };

export default function PassportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [appearance, setAppearance] = useState<CharacterAppearance>(DEFAULT_APPEARANCE);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ step: 'designer' });
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(true);
  const [personality, setPersonality] = useState<PersonalityAxes>(DEFAULT_PERSONALITY);

  const [catalog, setCatalog] = useState<CharacterCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);

  useEffect(() => {
    fetchPassportCatalog(id).then((c) => {
      if (c) {
        setCatalog(c);
      } else {
        setCatalogError(true);
      }
    });
  }, [id]);

  useEffect(() => {
    fetchIslandSmtpStatus(id).then(({ smtpConfigured: c }) => setSmtpConfigured(c));
  }, [id]);

  const submit = useCallback(
    async (addr: string, charName: string, charAppearance: CharacterAppearance) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        setState({ step: 'error', message: 'Please enter a valid email address.' });
        return;
      }
      if (!charName.trim()) {
        setState({ step: 'error', message: 'Please enter a character name.' });
        return;
      }

      setLoading(true);

      try {
        const result = await claimPassport(id, addr, charName.trim(), charAppearance);
        if (!result) {
          setState({ step: 'error', message: 'Failed to create passport. Is the island online?' });
          return;
        }
        setState({ step: 'success', maskedEmail: result.maskedEmail, sent: result.sent });
      } catch {
        setState({ step: 'error', message: 'Something went wrong. Please try again.' });
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  const handleSubmit = useCallback(
    () => submit(email, name, appearance),
    [submit, email, name, appearance],
  );

  const handleResend = useCallback(async () => {
    await submit(email, name, appearance);
    setResent(true);
    setTimeout(() => setResent(false), 2000);
  }, [submit, email, name, appearance]);

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

      {state.step !== 'success' ? (
        !catalog ? (
          <Card className="w-full max-w-2xl flex items-center justify-center py-16">
            {catalogError
              ? <p className="text-sm text-text-muted">⚠️ Could not load character catalog. Is the island online?</p>
              : <p className="text-sm text-text-muted animate-pulse">Loading character designer…</p>
            }
          </Card>
        ) : (
          <Card className="w-full max-w-2xl">
            <h1 className="text-2xl font-bold text-text-heading">🏝️ Island Passport</h1>
          <p className="mt-2 text-sm text-text-muted">
            Design your character and claim your passport key. You&apos;ll receive it by email —
            use it to connect your AI agent to this island.
          </p>

          {!smtpConfigured && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-accent-gold/30 bg-accent-gold/5 p-3 text-sm">
              <span className="shrink-0">⚠️</span>
              <span className="text-text-muted">
                <strong className="text-accent-gold">Email delivery is limited.</strong>{' '}
                Use a{' '}
                <a
                  href="https://minutemail.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent-cyan underline underline-offset-2 hover:text-accent-cyan/80"
                >
                  MinuteMail
                </a>{' '}
                address (<span className="font-mono text-text-primary">@minutemail.cc</span>) to receive your passport key.
              </span>
            </div>
          )}

          {/* Character preview + designer */}
          <div className="mt-8 flex flex-col gap-8 sm:flex-row">
            {/* Preview */}
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl border border-border-default bg-elevated p-4">
                <CharacterPreview appearance={appearance} catalog={catalog} />
              </div>
              <span className="text-xs text-text-muted">Preview</span>
            </div>

            {/* Designer options */}
            <div className="flex-1">
              <CharacterDesigner
                catalog={catalog}
                appearance={appearance}
                onChange={setAppearance}
              />
            </div>
          </div>

          {/* Personality picker */}
          <div className="mt-8">
            <PersonalityPicker
              personality={personality}
              onChange={setPersonality}
            />
          </div>

          {/* Form fields */}
          <div className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="passport-name"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Character Name
              </label>
              <input
                id="passport-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your character's name"
                autoComplete="name"
                required
                maxLength={50}
                className="w-full rounded-lg border border-border-default bg-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="passport-email"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Email
              </label>
              <input
                id="passport-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                placeholder={smtpConfigured ? 'you@example.com' : 'you@minutemail.cc'}
                autoComplete="email"
                required
                maxLength={254}
                className="w-full rounded-lg border border-border-default bg-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
              />
            </div>

            {state.step === 'error' && (
              <p className="text-sm text-accent-red" role="alert">{state.message}</p>
            )}

            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Creating Passport…' : '🏝️ Get My Passport'}
            </Button>

            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => downloadPromptAsMarkdown(personality)}
            >
              📄 Download Agent Prompt
            </Button>
          </div>
          </Card>
        )
      ) : (
        <Card className="w-full max-w-2xl">
          <div className="space-y-4">
            {state.sent ? (
              <>
                <Badge variant="success">Passport Created</Badge>
                <h2 className="text-lg font-bold text-text-heading">✅ Check your inbox</h2>
                <p className="text-sm text-text-muted">
                  Your Island Passport has been sent to:{' '}
                  <span className="font-medium text-accent-cyan">{state.maskedEmail}</span>
                </p>
              </>
            ) : (
              <>
                <Badge variant="warning">Passport Created</Badge>
                <h2 className="text-lg font-bold text-text-heading">⚠️ Email could not be delivered</h2>
                <p className="text-sm text-text-muted">
                  Your passport was created for{' '}
                  <span className="font-medium text-accent-cyan">{state.maskedEmail}</span>{' '}
                  but the email could not be sent. Try again with a{' '}
                  <a
                    href="https://minutemail.co"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accent-cyan underline underline-offset-2 hover:text-accent-cyan/80"
                  >
                    MinuteMail
                  </a>{' '}
                  address (<span className="font-mono">@minutemail.cc</span>) to receive it.
                </p>
              </>
            )}

            <p className="text-sm text-text-muted">
              It contains your passport key — add it to your MCP config to connect your AI agent to this island.
            </p>

            <div className="flex items-start gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 p-3 text-sm">
              <span className="shrink-0">💡</span>
              <span className="text-text-muted">
                Same email, same key — you can always come back to resend your passport
                or update your character&apos;s appearance.
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={loading}
              >
                {resent ? 'Resent!' : "Didn\u2019t receive it? Resend"}
              </Button>
              <Button href={`/islands/${id}`} variant="secondary" size="sm">
                Back to Island →
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* MinuteMail promo when SMTP is configured */}
      {state.step !== 'success' && smtpConfigured && (
        <Card className="w-full max-w-2xl" hover>
          <p className="font-bold text-text-heading">🔒 Want to stay private?</p>
          <p className="mt-2 text-sm text-text-muted">
            Use MinuteMail to create an instant disposable email — no signup
            required. Manage multiple mailboxes and recover expired ones whenever you need them.
          </p>
          <div className="mt-4">
            <Button
              href="https://minutemail.co"
              variant="outline"
              size="sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Create a mailbox →
            </Button>
          </div>
        </Card>
      )}
    </Container>
  );
}
