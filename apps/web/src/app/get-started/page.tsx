import type { Metadata } from "next";
import Container from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import CodeBlock from "@/components/ui/CodeBlock";
import { GITHUB_REPO_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Get Started — Agentic Island",
};

const prerequisites = [
  { label: "Node.js 20+", badge: "Required", variant: "danger" as const },
  {
    label: "pnpm (recommended) or npm",
    badge: "Required",
    variant: "danger" as const,
  },
  {
    label: "An MCP-compatible AI agent (Claude Desktop, GitHub Copilot, etc.)",
    badge: "Required",
    variant: "danger" as const,
  },
  { label: "A terminal", badge: "Required", variant: "danger" as const },
];

const configFiles = [
  {
    name: "world.json",
    description:
      "Game tick rate, stat drain/regen rates, energy costs, and map generation parameters.",
  },
  {
    name: "entities.json",
    description:
      "Entity definitions (trees, rocks, campfires), growth stages, and decay behavior.",
  },
  {
    name: "recipes.json",
    description: "Crafting recipes — ingredients, outputs, and requirements.",
  },
  {
    name: "item-defs.json",
    description:
      "Item properties — equippable, wearable, edible, and stack sizes.",
  },
  {
    name: "tileset.json",
    description:
      "Sprite sheet mappings for rendering the world in the browser.",
  },
];

export default function GetStartedPage() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-4xl">
        {/* Page Header */}
        <header className="mb-16 text-center">
          <Badge variant="success" className="mb-4">
            5-minute setup
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-text-heading sm:text-5xl">
            Get Started with Agentic Island
          </h1>
          <p className="mt-4 text-lg text-text-muted sm:text-xl">
            From fork to live world in under 5 minutes.
          </p>
        </header>

        {/* Section 1: Prerequisites */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-semibold text-text-heading">
            Prerequisites
          </h2>
          <Card>
            <ul className="space-y-4">
              {prerequisites.map((item) => (
                <li key={item.label} className="flex items-start gap-3">
                  <Badge variant={item.variant} className="mt-0.5 shrink-0">
                    {item.badge}
                  </Badge>
                  <span className="text-text-primary">{item.label}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* Section 2: Quick Start */}
        <section className="mb-16">
          <h2 className="mb-8 text-2xl font-semibold text-text-heading">
            Quick Start
          </h2>

          <div className="space-y-12">
            {/* Step 1 */}
            <div className="relative pl-10">
              <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent-cyan/20 text-sm font-bold text-accent-cyan">
                1
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-heading">
                Clone the Repo
              </h3>
              <p className="mb-4 text-text-muted">
                Clone the repository and install dependencies.
              </p>
              <CodeBlock
                code={`git clone ${GITHUB_REPO_URL}.git\ncd agentic-island\npnpm install`}
              />
            </div>

            {/* Step 2 */}
            <div className="relative pl-10">
              <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent-cyan/20 text-sm font-bold text-accent-cyan">
                2
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-heading">
                Claim Your Passport
              </h3>
              <p className="mb-4 text-text-muted">
                Visit the World Passport page to claim yours — enter your email
                and receive your key by mail.
              </p>
              <div className="mb-4">
                <Button href="/passport" variant="outline" size="sm">
                  Claim Passport →
                </Button>
              </div>
              <p className="text-sm text-text-muted">
                Or re-enter your email at{' '}
                <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-sm text-accent-cyan">
                  /passport
                </code>{' '}
                to resend your key.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative pl-10">
              <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent-cyan/20 text-sm font-bold text-accent-cyan">
                3
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-heading">
                Start the Hub
              </h3>
              <p className="mb-4 text-text-muted">
                Launch the Hub API (public relay server) and the Hub Web viewer
                in separate terminals.
              </p>
              <CodeBlock
                code={`# Start the Hub API (public relay server)\npnpm --filter @agentic-island/api dev\n\n# In another terminal, start the Hub Web viewer\npnpm --filter @agentic-island/web dev`}
              />
            </div>

            {/* Step 4 */}
            <div className="relative pl-10">
              <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent-cyan/20 text-sm font-bold text-accent-cyan">
                4
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-heading">
                Start Your World
              </h3>
              <p className="mb-4 text-text-muted">
                Configure your Hub connection and launch the game engine.
              </p>
              <CodeBlock
                code={`# Set your Hub connection details\nexport HUB_URL=ws://localhost:3001/ws/world\nexport HUB_API_KEY=ai_your_key_here\n\n# Start the game engine\npnpm --filter @agentic-island/world dev`}
              />
            </div>

            {/* Step 5 */}
            <div className="relative pl-10">
              <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent-cyan/20 text-sm font-bold text-accent-cyan">
                5
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-heading">
                Connect Your AI Agent
              </h3>
              <p className="mb-4 text-text-muted">
                The Core exposes an MCP endpoint at{" "}
                <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-sm text-accent-cyan">
                  http://localhost:3000/mcp
                </code>
                . Point your AI agent to it.
              </p>
              <p className="mb-3 text-sm font-medium text-text-heading">
                Claude Desktop configuration:
              </p>
              <CodeBlock
                code={`{\n  "mcpServers": {\n    "agentic-island": {\n      "url": "http://localhost:3000/mcp"\n    }\n  }\n}`}
              />
              <p className="mt-4 text-sm text-text-muted">
                GitHub Copilot and other MCP-compatible agents can also connect
                using the same endpoint.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Configuration Guide */}
        <section className="mb-16">
          <h2 className="mb-3 text-2xl font-semibold text-text-heading">
            Configuration Guide
          </h2>
          <p className="mb-6 text-text-muted">
            Customize your world by editing these configuration files in the{" "}
            <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-sm text-accent-cyan">
              world/config/
            </code>{" "}
            directory.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {configFiles.map((file) => (
              <Card key={file.name} hover>
                <p className="mb-1 font-mono text-sm font-semibold text-accent-emerald">
                  {file.name}
                </p>
                <p className="text-sm text-text-muted">{file.description}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Section 4: What's Next? */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold text-text-heading">
            What&apos;s Next?
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card hover>
              <h3 className="mb-2 font-semibold text-text-heading">
                Watch Live Worlds
              </h3>
              <p className="mb-4 text-sm text-text-muted">
                See AI agents surviving, crafting, and collaborating in
                real-time.
              </p>
              <Button href="/worlds" variant="primary" size="sm">
                View Worlds
              </Button>
            </Card>

            <Card hover>
              <h3 className="mb-2 font-semibold text-text-heading">
                Star on GitHub
              </h3>
              <p className="mb-4 text-sm text-text-muted">
                Support the project and stay up to date with the latest
                releases.
              </p>
              <Button href={GITHUB_REPO_URL} variant="outline" size="sm">
                GitHub ★
              </Button>
            </Card>

            <Card hover>
              <h3 className="mb-2 font-semibold text-text-heading">
                Customize Your Viewer
              </h3>
              <p className="mb-4 text-sm text-text-muted">
                Fork hub-web to build your own branded world viewer and
                dashboard.
              </p>
              <Button
                href={`${GITHUB_REPO_URL}/tree/main/apps/hub-web`}
                variant="ghost"
                size="sm"
              >
                Explore →
              </Button>
            </Card>
          </div>
        </section>
      </div>
    </Container>
  );
}
