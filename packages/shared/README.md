# Shared — Types & Protocols

Centralized TypeScript type definitions, message protocols, and constants used across all apps for type safety and consistency.

## Exports

### Types

| Module | Exports |
|--------|---------|
| `types/world` | `WorldState`, `MapData`, `TileDef`, `TileRegistry`, `WorldConfig`, `MapGenConfig`, `TileOverride` |
| `types/character` | `CharacterState`, `CharacterStats`, `EquipmentSlot` |
| `types/entity` | `EntityDef`, `HarvestDef`, `CraftDef` |
| `types/hub` | `WorldMeta`, `SpriteAsset` |

### Protocols

| Module | Direction | Key Types |
|--------|-----------|-----------|
| `protocol/world-hub` | Core ↔ Hub | `WorldHandshakeMessage`, `WorldStateUpdateMessage`, `HubHandshakeAckMessage` |
| `protocol/hub-viewer` | Hub ↔ Viewer | `ViewerSubscribeMessage`, `ViewerWorldStateMessage`, `ViewerWorldOfflineMessage` |

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_PORT_CORE` | `3000` | Core server default port |
| `DEFAULT_PORT_HUB` | `4000` | Hub server default port |
| `HEARTBEAT_INTERVAL_MS` | — | WebSocket heartbeat timing |
| `MAX_SPRITE_UPLOAD_BYTES` | — | Sprite payload size limit |

## Usage

```typescript
import { WorldState, CharacterState } from "@agentic-island/shared";
import { WorldToHubMessage } from "@agentic-island/shared";
```

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm typecheck  # Type-check without emitting
```
