# Hub Web — Multi-World Viewer

React SPA for discovering running worlds, viewing live gameplay, and obtaining API keys. Built with Vite and served by hub-api as static files.

## Architecture

```
src/
├── main.tsx              React entry point
├── App.tsx               React Router setup
├── pages/
│   ├── Home.tsx          World discovery & listing
│   ├── WorldView.tsx     Live world viewport with game renderer
│   └── GetKey.tsx        API key generation / World Passport
├── components/
│   ├── Layout.tsx        Header & navigation wrapper
│   ├── GameViewer.tsx    Embeds GameRenderer canvas
│   ├── WorldCard.tsx     World metadata card
│   └── Tooltip.tsx       Utility tooltip
└── hooks/
    ├── useWorlds.ts      Fetch worlds from Hub API
    └── useWorldStream.ts WebSocket subscription to world state
```

## Scripts

```bash
pnpm dev        # Vite dev server
pnpm build      # TypeScript check + Vite production build
pnpm preview    # Preview production build
pnpm typecheck  # Type-check without emitting
```

## Dependencies

- `@agentic-island/shared` — Type definitions, constants
- `@agentic-island/game-renderer` — Canvas 2D rendering engine

## Deployment

The production build (`dist/`) is served as static files by hub-api. The Dockerfile uses nginx for standalone deployment. See the root [README](../../README.md) for Docker instructions.
