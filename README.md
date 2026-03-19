# 🏝️ Agentic Island

AI-powered tile-based survival game where AI agents control characters on a procedurally generated island. Fully customizable worlds with crafting, farming, building, and exploration — all driven by AI through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

This monorepo contains two systems: **Core** (the game engine that runs on your machine) and **Hub** (a public website where anyone can watch your world in real-time).

## Architecture Overview

```
  Your Machine                         Cloud / Server
 ┌──────────────┐                    ┌──────────────────┐
 │              │   outbound WS      │                  │
 │    Core      │ ──────────────────►│     Hub API      │
 │  (engine +   │   state updates    │  (relay + DB)    │
 │   MCP srv)   │◄──────────────────│                  │
 │              │   ack / pong       │                  │
 └──────┬───────┘                    └────────┬─────────┘
        │                                     │
   AI agents                            Viewer clients
   connect via                          connect via
   MCP (HTTP)                           WebSocket
        │                                     │
 ┌──────┴───────┐                    ┌────────┴─────────┐
 │  Claude /    │                    │   Hub Web (SPA)  │
 │  Copilot /   │                    │  React + Canvas  │
 │  any MCP     │                    │  renders world   │
 │  client      │                    │  in browser      │
 └──────────────┘                    └──────────────────┘
```

**Key design:** Core connects **outbound** to Hub — no open ports or port forwarding needed on the host machine.

## Monorepo Structure

| Package | Path | Description |
|---------|------|-------------|
| `@agentic-island/core` | `apps/core` | Game engine, world simulation, MCP server, Hub connector |
| `@agentic-island/hub-api` | `apps/hub-api` | Hono HTTP/WebSocket server, state relay, SQLite DB, sprite cache |
| `@agentic-island/hub-web` | `apps/hub-web` | React + Vite SPA for discovering and watching live worlds |
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

### Run the Hub

Start the API server and web frontend (two terminals):

```bash
# Terminal 1 — Hub API (port 4000)
pnpm --filter @agentic-island/hub-api dev

# Terminal 2 — Hub Web (port 5173, proxies to Hub API)
pnpm --filter @agentic-island/hub-web dev
```

### Run the Core

```bash
# Terminal 3 — Core game engine (port 3000)
pnpm --filter @agentic-island/core dev
```

### Connect Core to Hub

1. Open the Hub web UI at `http://localhost:5173/get-key`
2. Generate an API key (save it — it's only shown once)
3. Set the key and Hub URL as environment variables for Core:

```bash
HUB_URL=ws://localhost:4000/ws/core \
HUB_API_KEY=ai_your_key_here \
pnpm --filter @agentic-island/core dev
```

Your world will appear on the Hub's homepage. Open it to watch the game live.

### Connect an AI Agent

Point any MCP-compatible client (Claude Desktop, GitHub Copilot, etc.) at Core's MCP endpoint:

```
URL: http://localhost:3000/mcp
Transport: Streamable HTTP
```

The agent can then spawn characters, move, harvest, craft, build, and explore.

## Configuration

Core's game world is fully customizable through JSON config files in `apps/core/config/`:

| File | Controls |
|------|----------|
| `world.json` | Game tick rate, stat drain/regen rates, energy costs, map generation params |
| `entities.json` | Entity definitions — trees, rocks, campfires, chests, growth stages, decay |
| `item-defs.json` | Item properties — equippable, wearable, edible, tool capabilities |
| `recipes.json` | Crafting recipes — ingredients, outputs, descriptions |
| `tileset.json` | Sprite sheet tile mappings — sheet names, positions, animation frames |

All config files support **hot-reload** — edit and save while the server is running.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript 5.9 |
| Monorepo | pnpm workspaces, Turborepo |
| Core engine | SQLite (better-sqlite3), rot-js (pathfinding), Zod (validation) |
| Core AI | `@modelcontextprotocol/sdk` (MCP servers) |
| Hub API | Hono, WebSocket (ws), SQLite |
| Hub Web | React 19, React Router 7, Vite 6 |
| Renderer | Canvas 2D API (custom 5-layer compositing engine) |

## Documentation

- **[Architecture Guide](docs/architecture.md)** — Detailed system design, WebSocket protocol, data flow, database schema, customization, and security model

## License

ISC