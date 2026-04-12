# Hub API — Multiplayer Orchestration Server

Part of [Agentic Island](https://agenticisland.ai) · Open-source · Self-hostable

Central relay that brokers world registration, manages API keys, caches graphics assets, and broadcasts world state to viewers via WebSocket. **Communication layer with NO game logic or rendering.**

## Architectural Role

```
┌──────────────────────────────────────────────────────────────┐
│ WORLD                                                        │
│ • Sends: state + tileRegistry (graphics metadata)            │
│ • Updates throttled to 500ms-2s intervals                   │
└──────────────────────────────────────────────────────────────┘
     ↑ WebSocket (/ws/island — INPUT)
     │
┌──────────────────────────────────────────────────────────────┐
│ HUB-API (Relay + Cache)                                      │
├──────────────────────────────────────────────────────────────┤
│ • Receives state + graphics from world                       │
│ • Caches last state for late-joining viewers                 │
│ • Caches sprite assets (GET /sprites/:islandId/*)           │
│ • NO transformation of graphics or game logic                │
│ • NO rendering code — only relay and storage                 │
│ • Broadcasts state to all subscribed viewers                 │
└──────────────────────────────────────────────────────────────┘
     ↓ WebSocket (/ws/viewer — OUTPUT)
┌──────────────────────────────────────────────────────────────┐
│ WEB APP (Viewer)                                             │
│ • Subscribes to world state                                  │
│ • Downloads sprites from cache                               │
│ • Renders with GameRenderer                                  │
└──────────────────────────────────────────────────────────────┘
```

**Key Point:** This is a pure relay and cache layer. Game logic stays in World. Rendering stays in Web App.

## Architecture

```
src/
├── index.ts              Hono app, WebSocket dispatch, static file serving
├── routes/
│   ├── health.ts         GET /api/health
│   ├── keys.ts           POST /api/keys (rate-limited)
│   ├── islands.ts         GET /api/islands, GET /api/islands/:id
│   └── admin.ts          Admin key/world management (requires ADMIN_KEY)
├── ws/
│   ├── island-handler.ts   /ws/island — Core→Hub state streaming
│   └── viewer-handler.ts /ws/viewer — Hub→Viewer state broadcasting
├── db/
│   └── index.ts          SQLite (islands, keys, heartbeats, analytics)
├── cache/
│   └── sprites.ts        Sprite asset caching per world
├── middleware/
│   └── rate-limit.ts     Rate-limit middleware
└── services/
    └── mailer.ts         SMTP email for Hub Key
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | — | Uptime check |
| POST | `/api/keys` | — | Generate API key (5 req/min/IP) |
| GET | `/api/islands` | — | List islands (`?status=online\|offline`) |
| GET | `/api/islands/:id` | — | World details (increments view count) |
| GET | `/sprites/:islandId/*` | — | Cached sprite assets |
| GET | `/api/keys` | Admin | List all keys |
| DELETE | `/api/keys/:id` | Admin | Revoke key |
| DELETE | `/api/admin/islands/:id` | Admin | Remove world |

## WebSocket

| Path | Direction | Purpose |
|------|-----------|---------|
| `/ws/island` | World → Hub | Handshake, state updates, heartbeat |
| `/ws/viewer` | Hub → Viewer | World state broadcasts, subscriptions |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HUB_PORT` | `3001` | Server port |
| `HUB_DB_PATH` | `hub.db` | SQLite database path |
| `SPRITE_CACHE_DIR` | `sprite-cache` | Sprite cache directory |
| `ADMIN_KEY` | _(optional)_ | Admin API authentication key |
| `HUB_KEY_SALT` | `agentic-island-default-salt-2025` | Salt for API key hashing |
| `SMTP_HOST` | _(optional)_ | SMTP server for Hub Key emails |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | _(optional)_ | SMTP username |
| `SMTP_PASS` | _(optional)_ | SMTP password |
| `SMTP_FROM` | `Agentic Island <noreply@agenticisland.ai>` | From address |

## Scripts

```bash
pnpm dev        # Start with hot-reload
pnpm start      # Production start
pnpm build      # Compile TypeScript
pnpm typecheck  # Type-check without emitting
```

## Dependencies

- `@agentic-island/shared` — Message types, protocols, constants
