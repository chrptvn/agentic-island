# CLI — Hub Admin Tool

Command-line tool for managing worlds, API keys, and querying core server state.

## Usage

```bash
# Via pnpm
pnpm --filter @agentic-island/cli start -- <command>

# Or after build
node dist/index.js <command>
```

## Commands

```
keys list                  List all API keys (requires ADMIN_KEY)
keys create [-l label]     Create a new API key

worlds list                List registered worlds
worlds delete <id>         Remove a world

core status                Query core server status
core characters list       List in-world characters
core map info              Map dimensions and seed
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HUB_URL` | `http://localhost:4000` | Hub API base URL |
| `ADMIN_KEY` | _(required for admin commands)_ | Admin authentication key |
| `CORE_URL` | `http://localhost:3000` | Core server base URL |

## Scripts

```bash
pnpm start      # Run CLI
pnpm build      # Compile TypeScript
pnpm typecheck  # Type-check without emitting
```
