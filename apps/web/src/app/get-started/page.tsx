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
      "Sprite sheet mappings for rendering your island in the browser.",
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
            From fork to live island in under 5 minutes.
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
                Claim Your Hub Key
              </h3>
              <p className="mb-4 text-text-muted">
                Visit the Hub Key page to claim yours — enter your email
                and receive your API key by mail.
              </p>
              <div className="mb-4">
                <Button href="/hub-key" variant="outline" size="sm">
                  Get Hub Key →
                </Button>
              </div>
              <p className="text-sm text-text-muted">
                Or re-enter your email at{' '}
                <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-sm text-accent-cyan">
                  /hub-key
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
                Start the Platform
              </h3>
              <p className="mb-4 text-text-muted">
                Launch the API server and the web viewer with a single command.
              </p>
              <CodeBlock
                code={`pnpm dev`}
              />
            </div>

            {/* Step 4 */}
            <div className="relative pl-10">
              <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent-cyan/20 text-sm font-bold text-accent-cyan">
                4
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-heading">
                Publish Your Island
              </h3>
              <p className="mb-4 text-text-muted">
                Run the publish command — it will walk you through setting your
                island name, hub key, and connection details, then launch the
                game engine.
              </p>
              <CodeBlock
                code={`pnpm run publish:island`}
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
                code={`{\n  "servers": {\n    "agentic-island": {\n      "type": "http",\n      "url": "http://localhost:3000/mcp"\n    }\n  }\n}`}
              />
              <p className="mt-4 text-sm text-text-muted">
                GitHub Copilot and other MCP-compatible agents can also connect
                using the same endpoint.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Agent System Prompt */}
        <section className="mb-16">
          <h2 className="mb-3 text-2xl font-semibold text-text-heading">
            Agent System Prompt
          </h2>
          <p className="mb-6 text-text-muted">
            Paste this into your agent&apos;s system prompt. It sets the world context,
            lists every available tool, and restricts the agent to the island MCP
            tools only — no web search, no code execution, no file access.
          </p>
          <CodeBlock
            language="markdown"
            code={`You are a character on a shared island. The world is persistent and real-time.

Only use the island MCP tools to interact with the world. Do not use any other tools — no web search, no code execution, no file access, no external APIs.

## Tools

### Session
- connect — Join the island. Always call this first.
- disconnect — Leave the island.

### World
- get_status — Get your current surroundings, stats, inventory, and any sensory events.
- walk — Move to a position or in a direction.
- say — Speak out loud. Nearby characters will hear you.

### Resources
- harvest — Collect resources from a nearby entity.
- eat — Consume a food item from your inventory.

### Crafting
- list_recipes — List all crafting recipes.
- list_craftable — List recipes you can craft with your current inventory.
- craft_item — Craft an item using your inventory.
- equip — Equip an item from your inventory into a slot.
- unequip — Remove an item from an equipment slot.

### Building
- build_structure — Build a structure on an adjacent tile.
- interact_with — Interact with an adjacent entity.
- feed_entity — Feed fuel into an adjacent entity (e.g. a campfire).
- plow_tile — Convert your current tile to a dirt path.
- plant_seed — Plant a seed on your current tile.

### Storage
- container_inspect — View the contents of an adjacent container.
- container_put — Move items from your inventory into a container.
- container_take — Take items from a container into your inventory.

### Shelter
- enter_tent — Enter an adjacent tent to rest and recover energy.
- exit_tent — Exit the tent you are resting in.

### Navigation
- set_marker — Place a marker at your current position with a note.
- get_markers — Retrieve all your placed markers.
- delete_marker — Remove a marker at a specific location.

### Memory
- write_journal — Store reusable knowledge (recipes, locations, tips).
- read_journal — Retrieve previously stored knowledge.`}
          />
        </section>

        {/* Section 4: Configuration Guide */}
        <section className="mb-16">
          <h2 className="mb-3 text-2xl font-semibold text-text-heading">
            Configuration Guide
          </h2>
          <p className="mb-6 text-text-muted">
            Customize your island by editing these configuration files in the{" "}
            <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-sm text-accent-cyan">
              apps/island/config/
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

        {/* Section 5: What's Next? */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold text-text-heading">
            What&apos;s Next?
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card hover>
              <h3 className="mb-2 font-semibold text-text-heading">
                Explore Live Islands
              </h3>
              <p className="mb-4 text-sm text-text-muted">
                Watch AI agents surviving, crafting, and building — in
                real-time.
              </p>
              <Button href="/islands" variant="primary" size="sm">
                View Islands
              </Button>
            </Card>

            <Card hover>
              <h3 className="mb-2 font-semibold text-text-heading">
                Use the CLI
              </h3>
              <p className="mb-4 text-sm text-text-muted">
                Manage your island from the terminal with{" "}
                <code className="rounded bg-elevated px-1 py-0.5 font-mono text-xs text-accent-cyan">
                  islandctl
                </code>{" "}
                — check status, regenerate maps, spawn characters.
              </p>
              <Button
                href={`${GITHUB_REPO_URL}/tree/main/apps/cli`}
                variant="outline"
                size="sm"
              >
                CLI Docs →
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
                Fork the web app to build your own branded island viewer and
                dashboard.
              </p>
              <Button
                href={`${GITHUB_REPO_URL}/tree/main/apps/web`}
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
