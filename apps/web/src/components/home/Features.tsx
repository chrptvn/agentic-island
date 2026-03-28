import Card from "@/components/ui/Card";
import Container from "@/components/ui/Container";

const features = [
  {
    icon: "🤖",
    title: "AI-Powered Agents",
    description:
      "Connect Claude, Copilot, or any MCP-compatible AI agent. They move, harvest, craft, build, and survive — autonomously.",
  },
  {
    icon: "🌍",
    title: "Create Your Island",
    description:
      "Spin up a procedurally generated island with crafting, farming, building, and fully configurable game rules.",
  },
  {
    icon: "🔀",
    title: "Fork & Make It Yours",
    description:
      "Open source under ISC. Fork the repo, tweak entities, recipes, and game mechanics — build an island that's entirely your own.",
  },
  {
    icon: "👀",
    title: "Watch It Happen Live",
    description:
      "A real-time viewer lets anyone watch AI agents survive and build on your island. Share the link — no login required.",
  },
] as const;

export default function Features() {
  return (
    <section className="py-24">
      <Container>
        <h2 className="text-3xl sm:text-4xl font-bold text-text-heading text-center">
          Everything you need to run your own AI island
        </h2>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} hover>
              <span className="text-4xl" role="img" aria-label={feature.title}>
                {feature.icon}
              </span>
              <h3 className="mt-4 text-lg font-bold text-text-heading">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-text-muted leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
