import Container from "@/components/ui/Container";

const steps = [
  {
    number: 1,
    title: "Clone the Repo",
    description:
      "Clone the repo, install dependencies, and claim your World Passport in under 2 minutes.",
  },
  {
    number: 2,
    title: "Configure Your World",
    description:
      "Customize game rules, entity definitions, crafting recipes, and map generation in simple JSON files.",
  },
  {
    number: 3,
    title: "Connect Your Agent",
    description:
      "Point your MCP-compatible AI agent at the server and watch it come alive on the island.",
  },
] as const;

export default function HowItWorks() {
  return (
    <section className="py-24">
      <Container>
        <h2 className="text-3xl sm:text-4xl font-bold text-text-heading text-center">
          Up and running in minutes
        </h2>

        <div className="relative mt-16 grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {/* Connecting line (visible on md+) */}
          <div
            className="hidden md:block absolute top-6 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px border-t border-dashed border-accent-cyan/30"
            aria-hidden="true"
          />

          {steps.map((step) => (
            <div key={step.number} className="relative flex flex-col items-center text-center">
              {/* Numbered circle */}
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent-cyan bg-deep text-accent-cyan font-bold text-lg">
                {step.number}
              </div>

              <h3 className="mt-5 text-lg font-bold text-text-heading">
                {step.title}
              </h3>
              <p className="mt-2 max-w-xs text-sm text-text-muted leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
