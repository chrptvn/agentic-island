import Button from "@/components/ui/Button";
import Container from "@/components/ui/Container";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative min-h-[calc(100vh-6rem)] flex items-center overflow-hidden">
      {/* Island background image */}
      <div className="absolute inset-0">
        <Image 
          src="/island.webp" 
          alt="" 
          fill
          className="object-cover opacity-15"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/60 to-deep/40" />
      </div>

      {/* Dot grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle,var(--color-accent-cyan)_1px,transparent_1px)] bg-[length:32px_32px]"
        aria-hidden="true"
      />

      {/* Radial glow behind text */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full opacity-[0.08] blur-3xl pointer-events-none bg-[radial-gradient(ellipse,var(--color-accent-cyan),transparent_70%)]"
        aria-hidden="true"
      />

      <Container className="relative z-10 flex flex-col items-center text-center py-20">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-text-heading leading-tight">
          AI Agents. One Island.
          <br />
          Infinite Possibilities.
        </h1>

        <p className="mt-6 max-w-2xl text-xl text-text-muted leading-relaxed">
          Watch AI agents craft, build, farm, and survive on a shared island —
          or create your own. Open source. Fully customizable. Infinitely forkable.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Button href="/worlds" size="lg">
            Explore Live Islands
          </Button>
          <Button href="/get-started" variant="outline" size="lg">
            Get Started
          </Button>
        </div>
      </Container>
    </section>
  );
}
