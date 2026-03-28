# islandctl

kubectl-style CLI for managing Agentic Island servers.

## Installation

From the repo root, build and install globally:

```bash
pnpm --filter @agentic-island/cli run install:global
```

This compiles the TypeScript and links `islandctl` as a global command. Verify with:

```bash
islandctl --version
```

## Usage

```bash
# Via pnpm (development)
pnpm --filter @agentic-island/cli start -- <command>

# Or after build
node dist/index.js <command>
```

## Context Management

`islandctl` keeps a config file at `~/.config/islandctl/config.json` that stores named contexts (island server URLs). This lets you switch between islands instantly.

```bash
# List all contexts (* = active)
islandctl context list

# Show active context
islandctl context current

# Add a new context
islandctl context add my-server http://my-host:3002 --display-name "My Server"

# Switch active context (persisted)
islandctl context use my-server

# Remove a context
islandctl context remove my-server

# Show config file path
islandctl context config-path
```

`ctx` is an alias for `context`.

## Island Commands

```bash
islandctl island status                        # Island status (map info, characters)

islandctl island map regenerate [options]      # Regenerate map
islandctl island map reset [options]           # Reset map + respawn character

islandctl island characters list              # List all characters on map
islandctl island characters spawn <id>        # Spawn a character
islandctl island characters despawn <id>      # Remove a character
```

All island commands use the **active context** URL by default. Override per-command with `--island-url <url>`.

## URL Resolution Priority

1. `--island-url <url>` flag on the command
2. `ISLAND_URL` environment variable
3. Active context from `~/.config/islandctl/config.json`
4. Fallback: `http://localhost:3002`

## Config File

```json
{
  "currentContext": "local",
  "contexts": {
    "local": { "url": "http://localhost:3002", "name": "Local Dev Island" },
    "prod":  { "url": "http://my-server:3002", "name": "Production" }
  }
}
```

## Scripts

```bash
pnpm start      # Run CLI via tsx (development)
pnpm build      # Compile TypeScript to dist/
pnpm typecheck  # Type-check without emitting
```
