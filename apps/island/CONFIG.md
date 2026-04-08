# Game Configuration

All game data lives in JSON files under `apps/island/config/`. Changes are hot-reloaded at runtime — no restart needed.

## Files Overview

| File | Purpose |
|------|---------|
| [tileset.json](#tilesetjson) | Sprite coordinates, sheet mappings, animation |
| [entities.json](#entitiesjson) | Game objects — trees, campfires, chests, items |
| [item-defs.json](#item-defsjson) | Item capabilities and consumable effects |
| [items.json](#itemsjson) | Item display emojis |
| [recipes.json](#recipesjson) | Crafting recipes |
| [world.json](#worldjson) | Simulation tuning — stats, costs, map generation |

## Data Flow

```
tileset.json        → How things look (sprite coordinates)
     ↓
entities.json       → What things are (game objects referencing tile IDs)
     ↓ drops
item-defs.json      → What items do (capabilities, food value)
     ↓ ingredients
recipes.json        → How to combine items
     ↕
world.json          → Simulation parameters (energy costs, hunger drain, map gen)
     ↕
items.json          → Display emojis for UI
```

---

## tileset.json

Maps tile IDs to sprite sheet coordinates.

### Top-level

```json
{
  "tileSize": 16,                              // Tile size in pixels
  "tileGap": 1,                                // Gap between tiles in sheet
  "sheets": {                                  // Per-sheet overrides
    "food.png": { "tileGap": 0 }
  },
  "tiles": [ ... ]
}
```

### Tile Entry

```json
{
  "id": "young_tree",
  "col": 1,                    // X position in sheet (tile units)
  "row": 13,                   // Y position in sheet (tile units)
  "layer": 2,                  // Render layer (0=terrain, 1=transition, 2=entity, 3=canopy)
  "category": "vegetation",    // Category for grouping
  "description": "A young oak tree",
  "sheet": "food.png",         // Optional: override default sheet
  "item": true,                // Optional: marks as inventory item
  "frames": [                  // Optional: animation frames
    { "col": 14, "row": 8 },
    { "col": 15, "row": 8 }
  ],
  "fps": 2                     // Optional: animation speed
}
```

### Categories

`terrain` · `water_transition` · `path_transition` · `vegetation` · `item` · `structure` · `character`

---

## entities.json

Defines all game objects with behavior, stats, and interactions.

### Entity Entry

```json
{
  "id": "young_tree",
  "tileType": "single",           // "single" or "two-tile"
  "topTileId": null,               // Upper tile ID for two-tile entities
  "blocks": true,                  // Blocks character movement
  "stats": { "health": 40 },
  "searchTarget": "trees",         // Category for AI search
  "spawn": {                       // World generation
    "weight": 3,                   // Spawn frequency (0-4)
    "requiresDeep": false          // Only in deep grass zones
  },
  "harvest": {                     // Gathering behavior
    "fullBase": "young_tree",
    "requires": ["chop"],          // Required tool capability
    "damage": 10,                  // Damage per harvest action
    "onDeath": {
      "drops": { "wood": 3, "branches": 5, "acorns": 2 }
    }
  }
}
```

### Special Properties

| Property | Used By | Purpose |
|----------|---------|---------|
| `growthStages` | Sprouts | `{ nextStage, growthMs }` — auto-growth |
| `build` | Campfire, chest | `{ costs: { wood: 3 } }` — construction recipe |
| `interact` | Campfire | Light/extinguish actions |
| `decay` | Lit campfire | `{ ratePerSecond, fuelItem }` — health drain |
| `container` | Chest, log pile | `{ maxItems, acceptedItems, rejectedItems }` |
| `energyRegen` | Campfire | Passive energy restoration nearby |

---

## item-defs.json

Defines what items can do when held or consumed.

```json
{
  "stone_axe": {
    "equippable": true,
    "capabilities": { "chop": 1, "mine": 0.3, "plow": 0.2 }
  },
  "berries": {
    "equippable": false,
    "eat": { "hunger": 20 }
  },
  "rocks": {
    "equippable": true,
    "hideWhenEquipped": true,
    "capabilities": { "mine": 0.5, "plow": 0.3 }
  }
}
```

### Capabilities

Multiplier scale: `0` = can't use, `1` = optimal

| Capability | Best Tool | Purpose |
|------------|-----------|---------|
| `chop` | stone_axe (1.0) | Felling trees |
| `mine` | stone_pickaxe (1.0) | Mining rocks |
| `cut` | stone_knife (1.0) | Cutting / harvesting |
| `plow` | plow (1.0) | Tilling soil for paths |

---

## items.json

Maps item IDs to display emojis for UI rendering.

```json
{
  "berries": "🍒",
  "wood": "🪵",
  "rocks": "🪨",
  "branches": "🌿",
  "acorns": "🌰",
  "stone_axe": "🪓",
  "plow": "⛏️",
  "_unknown": "📦"
}
```

---

## recipes.json

Crafting combinations.

```json
{
  "recipes": {
    "stone_axe":     { "ingredients": { "branches": 1, "rocks": 1 }, "output": { "stone_axe": 1 } },
    "stone_knife":   { "ingredients": { "rocks": 2 }, "output": { "stone_knife": 1 } },
    "stone_pickaxe": { "ingredients": { "branches": 1, "rocks": 3 }, "output": { "stone_pickaxe": 1 } },
    "plow":          { "ingredients": { "branches": 2, "rocks": 1 }, "output": { "plow": 1 } }
  }
}
```

---

## world.json

Simulation parameters and map generation tuning.

### Character Stats

| Parameter | Value | Description |
|-----------|-------|-------------|
| `tickMs` | `500` | Game tick interval (ms) |
| `hungerDrainPerSecond` | `0.2` | Hunger decay rate |
| `healthDrainPerSecond` | `0.5` | HP drain when starving |
| `healthRegenPassive` | `0.5` | HP regen when fed |
| `energyRegenPassive` | `1.0` | Energy regen rate |

### Energy Costs

| Action | Cost |
|--------|------|
| Move (off path) | 1 |
| Move (on path) | 0.5 |
| Harvest | 5 |
| Build | 10 |
| Interact | 5 |
| Craft | 3 |

### Equipment Slots

`hands` · `head` · `body` · `legs` · `feet`

### Map Generation

| Parameter | Value | Description |
|-----------|-------|-------------|
| `fillProbability` | `0.55` | Initial cell fill ratio |
| `smoothingPasses` | `5` | Cellular automata iterations |
| `grassThreshold` | `5` | Neighbor count for grass |
| `waterThreshold` | `4` | Neighbor count for water |
| `vegetationDensity` | `0.1` | Tree/berry spawn weight |
| `lakeProbability` | `0.3` | Chance to place lakes |
| `lakeRadiusMin/Max` | `2-4` | Lake size range |
