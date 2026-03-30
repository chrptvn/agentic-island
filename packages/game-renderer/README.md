# Game Renderer — Canvas 2D Rendering Engine

Part of [Agentic Island](https://agenticisland.ai) · Open-source · Self-hostable

Reusable rendering engine for visualizing world state with sprite animation, 5-layer compositing, and overlays. Used by hub-web and embeddable in any browser-based client.

## Architecture

```
src/
├── index.ts          Public export barrel
├── renderer.ts       GameRenderer class — canvas management, render loop, state updates
├── sprite-loader.ts  SpriteCache — image loading, caching, fallback handling
├── layers.ts         renderLayers() — tile-based layer rendering with viewport culling
├── animation.ts      Frame animation — character rendering, tick advancement
└── overlays.ts       UI overlays — health bars, speech bubbles, name labels
```

## Layer Model

The renderer composites 5 layers in order:

| Layer | Content | Example |
|-------|---------|---------|
| 0 | Base terrain | Grass, water |
| 1 | Transitions | Water edges, path tiles |
| 2 | Entities | Trees, characters, items |
| 3 | Canopy | Tree tops (drawn above characters) |
| 4 | Overlays | Health bars, speech bubbles |

## Public API

```typescript
import { GameRenderer } from "@agentic-island/game-renderer";

const renderer = new GameRenderer(canvas, {
  tileSize: 16,
  scaleFactor: 2,
});

await renderer.loadSpritesFromUrls(spriteUrls);
renderer.setState(worldState);
renderer.start();
```

### Key Exports

| Export | Purpose |
|--------|---------|
| `GameRenderer` | Main orchestrator — canvas, render loop, sprites |
| `SpriteCache` | Image loading and caching by sheet name |
| `renderLayers()` | Tile-based layer rendering with viewport culling |
| `drawCharacter()` | Render animated character sprite |
| `drawHealthBar()` | Character HP bar overlay |
| `drawSpeechBubble()` | Dialog bubble above character |
| `drawNameLabel()` | Character name tag |

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm typecheck  # Type-check without emitting
```

## Dependencies

- `@agentic-island/shared` — `WorldState`, `TileRegistry`, `CharacterState` types
