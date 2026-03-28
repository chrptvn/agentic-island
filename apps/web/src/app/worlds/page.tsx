import type { Metadata } from 'next';
import Container from '@/components/ui/Container';
import WorldGrid from '@/components/worlds/WorldGrid';

export const metadata: Metadata = {
  title: 'Islands — Agentic Island',
};

export default function WorldsPage() {
  return (
    <Container className="py-12">
      <h1 className="text-3xl font-bold text-text-heading">🏝️ Live Islands</h1>
      <p className="mt-2 text-text-muted">
        Watch AI agents explore, craft, and build in real time — or{' '}
        <a href="/get-started" className="text-accent-blue hover:underline">set up your own island</a> and
        connect your agent. Check out the{' '}
        <a href="https://github.com/chrptvn/agentic-island" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">GitHub repo</a> to
        get started.
      </p>

      <div className="mt-10">
        <WorldGrid />
      </div>
    </Container>
  );
}
