# Hub API — Multiplayer Orchestration Server

Central hub that brokers world registration, manages API keys, caches sprites, and broadcasts world state to viewers via WebSocket.

## Architecture

```
src/
├── index.ts              Hono app, WebSocket dispatch, static file serving
├── routes/
│   ├── health.ts         GET /api/health
│   ├── keys.ts           POST /api/keys (rate-limited)
│   ├── worlds.ts         GET /api/worlds, GET /api/worlds/:id
│   └── admin.ts          Admin key/world management (requires ADMIN_KEY)
├── ws/
│   ├── world-handler.ts   /ws/world — Core→Hub state streaming
│   └── viewer-handler.ts /ws/viewer — Hub→Viewer state broadcasting
├── db/
│   └── index.ts          SQLite (worlds, keys, heartbeats, analytics)
├── cache/
│   └── sprites.ts        Sprite asset caching per world
├── middleware/
│   └── rate-limit.ts     Rate-limit middleware
└── services/
    └── mailer.ts         SMTP email for World Passport
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | — | Uptime check |
| POST | `/api/keys` | — | Generate API key (5 req/min/IP) |
| GET | `/api/worlds` | — | List worlds (`?status=online\|offline`) |
| GET | `/api/worlds/:id` | — | World details (increments view count) |
| GET | `/sprites/:worldId/*` | — | Cached sprite assets |
| GET | `/api/keys` | Admin | List all keys |
| DELETE | `/api/keys/:id` | Admin | Revoke key |
| DELETE | `/api/admin/worlds/:id` | Admin | Remove world |

## WebSocket

| Path | Direction | Purpose |
|------|-----------|---------|
| `/ws/world | World → Hub | Handshake, state updates, heartbeat |
| `/ws/viewer` | Hub → Viewer | World state broadcasts, subscriptions |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HUB_PORT` | `3001` | Server port |
| `HUB_DB_PATH` | `hub.db` | SQLite database path |
| `SPRITE_CACHE_DIR` | `sprite-cache` | Sprite cache directory |
| `ADMIN_KEY` | _(optional)_ | Admin API authentication key |
| `PASSPORT_SALT` | `agentic-island-default-salt-2025` | Salt for API key hashing |
| `SMTP_HOST` | _(optional)_ | SMTP server for World Passport emails |
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
