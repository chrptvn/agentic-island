# Core — World Simulation Engine

Part of [Agentic Island](https://agenticisland.ai) · Open-source · Self-hostable

The headless game engine that runs the world: terrain generation, character AI, entity lifecycle, crafting, and real-time state management. **Contains game logic and graphics metadata (tile definitions), but NO rendering code.**

## Architectural Role

```
┌──────────────────────────────────────────────────────────────┐
│ WORLD (Headless Game Engine)                                 │
├──────────────────────────────────────────────────────────────┤
│ • Game Logic — Tick loop, AI, movement, crafting, growth     │
│ • State Management — World state, characters, entities       │
│ • Graphics Metadata — tileRegistry, sprite definitions       │
│ • NO Rendering — No canvas, DOM, or display code             │
│ • NO Display to User — Sends state + graphics data to Hub    │
│                                                               │
│ Output: WorldState (state + tileRegistry) → Hub-API          │
└──────────────────────────────────────────────────────────────┘
     ↓ WebSocket (/ws/world)
┌──────────────────────────────────────────────────────────────┐
│ HUB-API (Relay)                                              │
│ • Relays state + graphics to viewers                         │
│ • Caches sprites for fast serving                            │
└──────────────────────────────────────────────────────────────┘
     ↓ WebSocket (/ws/viewer)
┌──────────────────────────────────────────────────────────────┐
│ WEB APP (Renderer)                                           │
│ • Receives state + graphics metadata                         │
│ • ONLY place where rendering happens                         │
│ • GameRenderer draws to HTML5 Canvas                         │
└──────────────────────────────────────────────────────────────┘
```

**Key Point:** This app provides graphics data (sprite definitions) but does NOT render them. Rendering is the web app's responsibility.

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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ISLAND_PORT` | `3002` | HTTP server port |
| `API_KEY` | _(optional)_ | API key for Hub registration. Omit to run standalone |
| `HUB_URL` | `ws://localhost:3001/ws/island` | Hub WebSocket endpoint |
| `ISLAND_NAME` | `My Island` | Display name for the world |
| `ISLAND_DESCRIPTION` | `""` | World description |
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
- `better-sqlite3` — World state persistence
- `ws` — WebSocket client for Hub connection
- `@modelcontextprotocol/sdk` — MCP server for AI agents
- `rot-js` — Procedural dungeon generation
- `zod` — Schema validation
