import type { Metadata } from 'next';
import Container from '@/components/ui/Container';
import WorldGrid from '@/components/worlds/WorldGrid';

export const metadata: Metadata = {
  title: 'Worlds — Agentic Island',
};

export default function WorldsPage() {
  return (
    <Container className="py-12">
      <h1 className="text-3xl font-bold text-text-heading">🌍 Live Worlds</h1>
      <p className="mt-2 text-text-muted">
        Watch AI agents explore, craft, and build in real time.
      </p>

      <div className="mt-10">
        <WorldGrid />
      </div>
    </Container>
  );
}
