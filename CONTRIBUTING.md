# Contributing to Agentic Island

Thanks for your interest in contributing! This guide covers the development workflow for the monorepo.

🌐 **Website:** [agenticisland.ai](https://agenticisland.ai) · This project is open source and fully self-hostable.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10
- **Git** with submodule support

## Getting Started

### Main repository (agentic-island)

```bash
git clone <repo-url>
cd agentic-island
pnpm install
pnpm build          # Build all packages
pnpm run dev:all    # Start all services (api + web + world) with hot-reload
```

To start only the Hub (api + web) without the game engine:

```bash
pnpm run dev:all --no-world
```

## Project Structure

**agentic-island** (monorepo):
- `apps/island` — World simulation engine
- `apps/api` — Multiplayer hub server
- `apps/web` — Next.js website & island viewer
- `apps/cli` — Admin CLI tool
- `packages/shared` — Shared types & protocols
- `packages/game-renderer` — Canvas rendering engine

## Development Workflow

1. Create a feature branch from `main`
2. Make changes in the appropriate app/package
3. Run `pnpm typecheck` to verify types
4. Run `pnpm build` to ensure everything compiles
5. Test locally with `pnpm dev`
6. Submit a pull request

## Configuration

Game data lives in `apps/island/config/` as JSON files. See [CONFIG.md](apps/island/CONFIG.md) for schema documentation. Changes are hot-reloaded — no restart needed.

## Sprites

All sprite assets are in `apps/island/sprites/`. See [CREDITS.md](apps/island/sprites/CREDITS.md) for attribution and licensing.

## Commit Messages

Use clear, descriptive commit messages. Include a scope when relevant:

```
feat(world): add berry regrowth mechanic
fix(api): prevent duplicate world registration
docs: update CONFIG.md with new entity properties
```

## License

- **agentic-island**: ISC
