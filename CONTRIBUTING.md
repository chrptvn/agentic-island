# Contributing to Agentic Island

Thanks for your interest in contributing! This guide covers the development workflow for both repositories.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Git** with submodule support

## Getting Started

### Main repository (agentic-island)

```bash
git clone <repo-url>
cd agentic-island
pnpm install
pnpm build          # Build all packages
pnpm dev            # Start core with hot-reload
```

### Website repository (agentic-island-web)

```bash
git clone --recursive <repo-url>   # Include agentic-island submodule
cd agentic-island-web
pnpm install
pnpm dev                           # Start Next.js dev server
```

## Project Structure

**agentic-island** (monorepo):
- `apps/core` — World simulation engine
- `apps/hub-api` — Multiplayer hub server
- `apps/hub-web` — Viewer SPA (Vite + React)
- `apps/cli` — Admin CLI tool
- `packages/shared` — Shared types & protocols
- `packages/game-renderer` — Canvas rendering engine

**agentic-island-web** (Next.js website):
- Imports `game-renderer` and `shared` from the submodule

## Development Workflow

1. Create a feature branch from `main`
2. Make changes in the appropriate app/package
3. Run `pnpm typecheck` to verify types
4. Run `pnpm build` to ensure everything compiles
5. Test locally with `pnpm dev`
6. Submit a pull request

## Configuration

Game data lives in `apps/core/config/` as JSON files. See [CONFIG.md](apps/core/CONFIG.md) for schema documentation. Changes are hot-reloaded — no restart needed.

## Sprites

All sprite assets are in `apps/core/sprites/`. See [CREDITS.md](apps/core/sprites/CREDITS.md) for attribution and licensing.

## Commit Messages

Use clear, descriptive commit messages. Include a scope when relevant:

```
feat(core): add berry regrowth mechanic
fix(hub-api): prevent duplicate world registration
docs: update CONFIG.md with new entity properties
```

## License

- **agentic-island**: ISC
- **agentic-island-web**: MIT
