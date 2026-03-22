# Core — World Simulation Engine

The game engine that runs the world: terrain generation, character AI, entity lifecycle, crafting, and real-time state management.

## Architecture

```
src/
├── world/           # Game simulation
│   ├── world.ts         Singleton World class — tick loop, event system
│   ├── map.ts           Terrain generation (Cellular Automata), pathfinding grid
│   ├── character-registry.ts   Character stats, equipment, movement
│   ├── entity-registry.ts      Entity definitions, harvesting, decay, growth
│   ├── tile-registry.ts        Tile definitions, animation frames, autotiling
│   ├── craft-registry.ts       Recipe system and item crafting
│   ├── pathfinder.ts           A* pathfinding for character movement
│   └── autotile.ts             Terrain autotiling and walkability
├── server/
│   └── http.ts          Local HTTP server (sprites, API, WebSocket)
├── hub-connector/
│   ├── connector.ts     WebSocket connection to Hub
│   ├── state-streamer.ts    Throttled state updates
│   └── sprite-uploader.ts  Package sprites as base64 payloads
├── mcp/
│   └── server.ts        Model Context Protocol server for AI agents
└── persistence/
    └── db.ts            SQLite persistence (world state, overrides, characters)
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `config/` | Game configuration (tileset, entities, items, recipes, world). See [CONFIG.md](CONFIG.md) |
| `sprites/` | All sprite assets with attribution. See [sprites/CREDITS.md](sprites/CREDITS.md) |
| `public/` | Standalone web viewer (index.html + client.js) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORE_PORT` | `3000` | HTTP server port |
| `HUB_API_KEY` | _(optional)_ | API key for Hub registration. Omit to run standalone |
| `HUB_URL` | `ws://localhost:4000/ws/core` | Hub WebSocket endpoint |
| `WORLD_NAME` | `My Island` | Display name for the world |
| `WORLD_DESCRIPTION` | `""` | World description |
| `WORLD_ID` | _(auto-assigned)_ | Persistent world ID (saved to `.world-id` file) |
| `MCP_TRANSPORT` | `http` | Set to `stdio` for legacy MCP transport |

## Scripts

```bash
pnpm dev        # Start with hot-reload (tsx watch)
pnpm start      # Production start
pnpm build      # Compile TypeScript
pnpm typecheck  # Type-check without emitting
```

## Dependencies

- `@agentic-island/shared` — Types, protocols, constants
- `@agentic-island/game-renderer` — Sprite handling
