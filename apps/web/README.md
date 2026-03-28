# Web Viewer — Client-Side Rendering

Next.js web application for viewing live worlds. **The ONLY place where rendering to HTML5 Canvas happens.** Receives world state + graphics metadata from Hub-API and displays them interactively.

## Architectural Role

```
┌──────────────────────────────────────────────────────────────┐
│ WORLD                                                        │
│ • Game logic + state simulation                              │
│ • Sends graphics metadata (tileRegistry)                     │
└──────────────────────────────────────────────────────────────┘
     ↓ WebSocket to Hub-API
┌──────────────────────────────────────────────────────────────┐
│ HUB-API                                                      │
│ • Relay + cache layer                                        │
│ • Serves sprites via HTTP                                    │
└──────────────────────────────────────────────────────────────┘
     ↓ WebSocket (/ws/viewer) + HTTP (/sprites/*)
┌──────────────────────────────────────────────────────────────┐
│ WEB APP (Client-Side Rendering)                              │
├──────────────────────────────────────────────────────────────┤
│ • Receives: WorldState + tileRegistry + spriteBaseUrl        │
│ • React Components: GameViewer, Tooltip, Speech Bubbles      │
│ • GameRenderer: Canvas rendering, camera, animations        │
│ • Sprite Loading: Downloads from /sprites/:islandId/*        │
│ • Interactive: Camera controls, tooltips on hover            │
│ • Output: HTML5 Canvas 2D (pixelated, 16px tiles, 2x scale) │
└──────────────────────────────────────────────────────────────┘
```

**Key Point:** This application ONLY handles user interface and display. All game logic is in the World. All state distribution is through Hub-API.

## Architecture

```
src/
├── app/
│   ├── page.tsx              Home page with world listing
│   ├── worlds/[id]/page.tsx  World viewer page (calls useIslandStream)
│   └── layout.tsx            Root layout
├── components/
│   ├── game/
│   │   ├── GameViewer.tsx    Main canvas + speech bubbles
│   │   └── Tooltip.tsx       Hover tooltips for entities
│   ├── worlds/
│   │   ├── WorldCard.tsx     World preview card
│   │   └── LiveWorldsPreview.tsx  Grid of worlds
│   └── ui/                   Shared UI components
├── hooks/
│   ├── useIslandStream.ts    WebSocket subscription to island state
│   ├── useWorlds.ts          Fetch world list from Hub-API
│   └── useDebugInfo.ts       Debug information overlay
├── lib/
│   └── api.ts                Hub-API client functions
└── styles/
    └── globals.css           Tailwind CSS
```

## Key Components

| Component | Purpose |
|-----------|---------|
| `GameViewer` | React wrapper around GameRenderer. Handles speech bubbles + tooltips |
| `GameRenderer` (from package) | Canvas 2D rendering engine. Draws tiles, entities, characters |
| `useIslandStream` | React hook for WebSocket connection to `/ws/viewer` |
| `Tooltip` | HTML overlay that shows on hover for entities |

## Graphics Pipeline

1. **World** creates `tileRegistry` (tile definitions + sprite references)
2. **World** sends `WorldState` (map, entities, characters, tileRegistry) → Hub-API
3. **Hub-API** relays `WorldState` + adds `spriteBaseUrl: /sprites/{islandId}/`
4. **Web App** receives via WebSocket, passes to GameRenderer
5. **GameRenderer** loads sprites from `spriteBaseUrl`
6. **Canvas** renders tiles, entities, characters to HTML5 Canvas

## Data Flow

```
WebSocket /ws/viewer (Hub-API)
│
├─ Receive: { type: 'island_state', state: WorldState, spriteBaseUrl, islandName }
│
└─ React State Update
   │
   ├─ GameRenderer.setState(state)
   │  └─ canvas.render() ← Draws to Canvas
   │
   └─ updateSpeechOverlays()
      └─ React setState() ← Updates HTML overlays
```

## Environment Variables

Typically managed by Next.js automatically. For local development:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_HUB_URL` | `ws://localhost:3001` | Hub-API WebSocket endpoint |

## Scripts

```bash
pnpm dev         # Start dev server (hot-reload on port 3000)
pnpm build       # Production build
pnpm start       # Production server
pnpm lint        # Run ESLint
```

## Dependencies

- `@agentic-island/game-renderer` — **ONLY app that imports this** for Canvas rendering
- `@agentic-island/shared` — Types, protocols, constants
- `next` — React framework
- `react` — UI library
- `react-dom` — React DOM rendering
- `tailwindcss` — Styling

## Key Files to Know

- `/src/app/islands/[id]/page.tsx` — Main world viewer route
- `/src/components/game/GameViewer.tsx` — Canvas rendering container
- `/src/hooks/useIslandStream.ts` — WebSocket connection logic
- `/packages/game-renderer/` — Pure rendering library (sprites, camera, input)

---

**Remember:** Web App = Display Only. Game Logic = World. Distribution = Hub-API.
