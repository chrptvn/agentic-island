# 🏝️ Agentic Island

**[agenticisland.ai](https://agenticisland.ai)** · Open-source · Self-hostable

AI-powered tile-based survival game where AI agents control characters on a procedurally generated island. Fully customizable islands with crafting, farming, building, and exploration — all driven by AI through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

This is an open-source project — you can run everything locally or deploy your own instance. The monorepo contains two systems: **World** (the game engine that runs on your machine) and **Hub** (a website where anyone can watch your island in real-time). A public Hub is hosted at [agenticisland.ai](https://agenticisland.ai).

## Architecture Overview

```
  Your Machine                         Cloud / Server
 ┌──────────────┐                    ┌──────────────────┐
 │              │   outbound WS      │                  │
 │    World     │ ──────────────────►│     Hub API      │
 │  (engine +   │   state updates    │  (relay + DB +   │
 │   MCP srv)   │◄──────────────────│   MCP proxy)     │
 │              │   ack / pong /     │                  │
 │              │   MCP tunnel       │                  │
 └──────────────┘                    └────────┬─────────┘
                                              │
                                     ┌────────┴─────────┐
                                     │  AI agents (MCP) │
                                     │  Viewer clients   │
                                     │  Hub Web (SPA)   │
                                     └──────────────────┘
```

**Key design:** World connects **outbound** to Hub — no open ports or port forwarding needed on the host machine. AI agents can connect to worlds remotely via the Hub's MCP proxy.

### Remote MCP Access via Hub

When a world is connected to the hub, AI agents can interact with it through the hub's public address:

```
POST|GET|DELETE  https://<hub-host>/islands/<islandId>/mcp
```

This endpoint implements the MCP [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http). The hub transparently tunnels JSON-RPC messages to the world through the existing WebSocket connection. All MCP tools, resources, and push notifications work identically to a direct local connection.

No extra configuration is needed — if the world is connected to the hub (via `API_KEY`), the MCP proxy is automatically available.

## Monorepo Structure

| Package | Path | Description |
|---------|------|-------------|
| `@agentic-island/island` | `apps/island` | Game engine, world simulation, MCP server, Hub connector |
| `@agentic-island/api` | `apps/api` | Hono HTTP/WebSocket server, state relay, SQLite DB, sprite cache |
| `@agentic-island/web` | `apps/web` | Next.js SPA for discovering and watching live islands |
| `@agentic-island/cli` | `apps/cli` | Admin CLI for managing hub instances |
| `@agentic-island/game-renderer` | `packages/game-renderer` | Shared Canvas 2D renderer (5-layer tile compositing, sprites, overlays) |
| `@agentic-island/shared` | `packages/shared` | TypeScript types, WebSocket protocol definitions, constants |

## Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** 10+

### Install

```bash
pnpm install
```

### Run Everything (Recommended)

```bash
pnpm run dev:all
```

This builds shared packages and starts all three services with prefixed, color-coded output. Pass `--no-world` to omit the game engine:

```bash
pnpm run dev:all --no-world
```

### Run Services Individually

```bash
# Terminal 1 — Hub API (port 3001)
pnpm --filter @agentic-island/api dev

# Terminal 2 — Hub Web (port 3000)
pnpm --filter @agentic-island/web dev

# Terminal 3 — World game engine (port 3002)
pnpm --filter @agentic-island/island dev
```

### Connect World to Hub

1. Open the Hub web UI at `http://localhost:3000/hub-key`
2. Claim a Hub Key (API key) — it can be resent to your email at any time
3. Set the key and Hub URL as environment variables for World:

```bash
HUB_URL=ws://localhost:3001/ws/island \
API_KEY=ai_your_key_here \
pnpm --filter @agentic-island/island dev
```

Your island will appear on the homepage. Open it to watch the game live.

### Connect an AI Agent

Point any MCP-compatible client (Claude Desktop, GitHub Copilot, etc.) at World's MCP endpoint:

```
URL: http://localhost:3002/mcp
Transport: Streamable HTTP
```

The agent can then spawn characters, move, harvest, craft, build, and explore.

### Publish to the Public Hub

To share your island live on [agenticisland.ai](https://agenticisland.ai):

```bash
pnpm run publish:island
```

This interactive CLI will prompt for an island name, optional description, and your **Hub Key** (API key). Get your hub key at [agenticisland.ai](https://agenticisland.ai). It then boots the island engine with an outbound connection to the public Hub — no port forwarding required.

## Configuration

Your island is fully customizable through JSON config files in `apps/island/config/`:

| File | Controls |
|------|----------|
| `world.json` | Game tick rate, stat drain/regen rates, energy costs, map generation params |
| `entities.json` | Entity definitions — trees, rocks, campfires, supply caches, growth stages, decay |
| `item-defs.json` | Item properties — equippable, wearable, edible, tool capabilities |
| `recipes.json` | Crafting recipes — ingredients, outputs, descriptions |
| `tileset.json` | Sprite sheet tile mappings — sheet names, positions, animation frames |

All config files support **hot-reload** — edit and save while the server is running.

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev:all` | Start all services (api + web + world) with prefixed output |
| `pnpm run dev:all --no-world` | Start api + web only |
| `pnpm run build` | Build all packages via Turborepo |
| `pnpm run lint` | Lint all packages |
| `pnpm run typecheck` | Type-check all packages |
| `pnpm run clean` | Remove all build artifacts |
| `pnpm run test:smoke` | Run smoke tests against api |
| `pnpm run publish:island` | Interactive CLI to publish your island |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript 5.9 |
| Monorepo | pnpm workspaces, Turborepo |
| World engine | SQLite (better-sqlite3), rot-js (pathfinding), Zod (validation) |
| Core AI | `@modelcontextprotocol/sdk` (MCP servers) |
| Hub API | Hono, WebSocket (ws), SQLite |
| Hub Web | Next.js 16, React 19 |
| Renderer | Canvas 2D API (custom 5-layer compositing engine) |

## Links

- 🌐 **Website:** [agenticisland.ai](https://agenticisland.ai)
- 📖 **[Architecture Guide](docs/architecture.md)** — Detailed system design, WebSocket protocol, data flow, database schema, customization, and security model
- 🤝 **[Contributing](CONTRIBUTING.md)** — Development workflow and guidelines

## License

ISC
