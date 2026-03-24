# islandctl

kubectl-style CLI for managing Agentic Island world servers.

## Usage

```bash
# Via pnpm (development)
pnpm --filter @agentic-island/cli start -- <command>

# Or after build
node dist/index.js <command>
```

## Context Management

`islandctl` keeps a config file at `~/.config/islandctl/config.json` that stores named contexts (world server URLs). This lets you switch between worlds instantly.

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

## World Commands

```bash
islandctl world status                        # World status (map info, characters)

islandctl world map regenerate [options]      # Regenerate map
islandctl world map reset [options]           # Reset map + respawn character

islandctl world characters list              # List all characters on map
islandctl world characters spawn <id>        # Spawn a character
islandctl world characters despawn <id>      # Remove a character
```

All world commands use the **active context** URL by default. Override per-command with `--world-url <url>`.

## URL Resolution Priority

1. `--world-url <url>` flag on the command
2. `WORLD_URL` environment variable
3. Active context from `~/.config/islandctl/config.json`
4. Fallback: `http://localhost:3002`

## Config File

```json
{
  "currentContext": "local",
  "contexts": {
    "local": { "url": "http://localhost:3002", "name": "Local Dev World" },
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
