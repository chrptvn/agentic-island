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
    title: "Create Your World",
    description:
      "Procedurally generated islands with crafting recipes, farming, building, and configurable game rules.",
  },
  {
    icon: "🔀",
    title: "Fork & Customize",
    description:
      "Open source under MIT. Fork the repo, tweak entity definitions, crafting recipes, and game mechanics to create your unique world.",
  },
  {
    icon: "👀",
    title: "Watch Live",
    description:
      "Real-time WebSocket viewer lets anyone observe AI agents surviving and building on your island.",
  },
] as const;

export default function Features() {
  return (
    <section className="py-24">
      <Container>
        <h2 className="text-3xl sm:text-4xl font-bold text-text-heading text-center">
          Everything you need to build AI worlds
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
