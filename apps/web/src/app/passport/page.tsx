'use client';

import { useState, useCallback, useEffect } from 'react';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { claimPassport, fetchSmtpStatus } from '@/lib/api';

type State =
  | { step: 'form' }
  | { step: 'success'; maskedEmail: string; sent: boolean }
  | { step: 'error'; message: string };

export default function PassportPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ step: 'form' });
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(true);

  useEffect(() => {
    fetchSmtpStatus().then(({ configured }) => setSmtpConfigured(configured));
  }, []);

  const submit = useCallback(
    async (addr: string) => {
      if (!addr.includes('@')) {
        setState({ step: 'error', message: 'Please enter a valid email address.' });
        return;
      }

      setLoading(true);
      setState({ step: 'form' });

      try {
        const result = await claimPassport(addr);
        if (!result) {
          setState({ step: 'error', message: 'Failed to send passport. Please try again.' });
          return;
        }
        setState({ step: 'success', maskedEmail: result.maskedEmail, sent: result.sent });
      } catch {
        setState({ step: 'error', message: 'Something went wrong. Please try again.' });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSubmit = useCallback(() => submit(email), [submit, email]);

  const handleResend = useCallback(() => {
    submit(email).then(() => {
      setResent(true);
      setTimeout(() => setResent(false), 2000);
    });
  }, [submit, email]);

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-start gap-6 py-12">
      <Card className="w-full max-w-lg">
        {state.step !== 'success' ? (
          <>
            <h1 className="text-2xl font-bold text-text-heading">🏝️ Island Passport</h1>
            <p className="mt-2 text-sm text-text-muted">
              Your Island Passport is a unique API key that lets you publish your island to the
              platform. Enter your email — one passport per email, yours forever.
            </p>

            {!smtpConfigured && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-accent-gold/30 bg-accent-gold/5 p-3 text-sm">
                <span className="shrink-0">⚠️</span>
                <span className="text-text-muted">
                  <strong className="text-accent-gold">Email delivery is limited.</strong>{' '}
                  Our mail server is not configured. You can use a{' '}
                  <a
                    href="https://minutemail.co"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accent-cyan underline underline-offset-2 hover:text-accent-cyan/80"
                  >
                    MinuteMail
                  </a>{' '}
                  address (<span className="font-mono text-text-primary">@minutemail.cc</span>) to receive your passport.
                </span>
              </div>
            )}

            <div className="mt-8 space-y-4">
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
                  className="w-full rounded-lg border border-border-default bg-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
                />
              </div>

              {state.step === 'error' && (
                <p className="text-sm text-accent-red">{state.message}</p>
              )}

              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Sending…' : '🏝️ Claim My Passport'}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {state.sent ? (
              <>
                <Badge variant="success">Passport Sent</Badge>
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
              It contains your API key — use it to publish your island and make it visible to everyone.
            </p>

            <div className="flex items-start gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 p-3 text-sm">
              <span className="shrink-0">💡</span>
              <span className="text-text-muted">
                Same email, same key — you can always come back to resend your
                passport.
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
              <Button href="/get-started" variant="secondary" size="sm">
                Get Started →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* MinuteMail promotional card */}
      {state.step !== 'success' && (
        <Card className="w-full max-w-lg" hover>
          <p className="font-bold text-text-heading">🔒 Want to stay private?</p>
          <p className="mt-2 text-sm text-text-muted">
            Use MinuteMail to create an instant disposable email — no signup
            required. Manage multiple mailboxes at once and recover expired ones
            whenever you need them.
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
