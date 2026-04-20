# Game Configuration

All game data lives in JSON files under `apps/island/config/`. Changes are hot-reloaded at runtime — no restart needed.

## Files Overview

| File | Hot-reload | Purpose |
|------|-----------|---------|
| [tileset.json](#tilesetjson) | No | Sprite coordinates, sheet mappings, animation |
| [entities.json](#entitiesjson) | Yes | Game objects — trees, campfires, supply caches, items |
| [item-defs.json](#item-defsjson) | Yes | Item capabilities and consumable effects |
| [recipes.json](#recipesjson) | Yes | Crafting recipes |
| [world.json](#worldjson) | Yes | Simulation tuning — stats, costs, map generation |
| [hallucinations.json](#hallucinationsjson) | Yes | Random sensory messages injected into character perception |
| [character-catalog.json](#character-catalogjson) | No | Character sprite sheet layout and appearance options |
| [agent-prompt.md](#agent-promptmd) | No | Custom system prompt injected into MCP sessions |

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
     ↑
hallucinations.json → Atmospheric messages injected into character senses
     ↑
character-catalog.json → Character sprite options available during creation
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
  "tiles": [                       // Array of tile placements composing this entity
    { "dx": 0, "dy": 0, "layer": 2, "tileId": "young_tree" },   // trunk / main tile
    { "dx": 0, "dy": -1, "layer": 3, "tileId": "young_tree_canopy" }  // canopy layer above
  ],
  "blocks": true,                  // Blocks character movement
  "stats": { "health": 40 },
  "spawn": {                       // World generation
    "weight": 3,                   // Spawn frequency (0–4)
    "biomes": {                    // Per-biome weight overrides
      "forest": 5                  // Higher weight inside the "forest" biome
    }
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

> **Note:** For single-tile entities, `tiles` contains just one entry. Multi-tile entities (e.g. tall trees with a canopy) use multiple entries with `dx`/`dy` offsets relative to the entity's anchor position.

### Special Properties

| Property | Used By | Purpose |
|----------|---------|---------|
| `growthStages` | Sprouts | `{ nextStage, growthMs }` — auto-growth |
| `build` | Campfire, supply cache | `{ costs: { wood: 3 } }` — construction recipe |
| `interact` | Campfire | Light/extinguish actions |
| `decay` | Lit campfire | `{ ratePerSecond, fuelItem }` — health drain |
| `container` | Supply cache, log pile | `{ maxItems, acceptedItems, rejectedItems }` |
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
| `gapFillPasses` | `10` | Passes to close small water gaps |
| `gapFillThreshold` | `3` | Max gap size to fill (cells) |
| `shorePadding` | `5` | Minimum distance from map edge to land |
| `vegetationDensity` | `0.1` | Base tree/berry spawn weight outside biomes |
| `lakeProbability` | `0` | Global lake seed probability (biome lakes take precedence) |
| `lakeRadiusMin/Max` | `8–20` | Global lake size range |
| `sandSeedDistance` | `1` | Max distance from water for sand seeds |
| `sandGrowProbWave3` | `0.55` | Probability sand spreads in the 3rd wave |
| `lilyPadDensity` | `0.10` | Density of lily pads on water cells |

### Biomes

Biomes are BFS-grown zones that override vegetation density and optionally carve lakes.

```json
"biomes": [
  {
    "id": "forest",           // Biome ID (referenced in entity spawn.biomes)
    "count": 2,               // Number of zones to generate
    "radiusMin": 15,          // Min BFS expansion radius in cells
    "radiusMax": 30,
    "vegetationDensity": 1.0, // Vegetation density inside this biome
    "lake": {                 // Optional: carve a lake inside this biome zone
      "probability": 1.0,
      "radiusMin": 8,
      "radiusMax": 20,
      "count": 4
    }
  },
  {
    "id": "grass_field",
    "fill": true,             // fill=true: covers any cell not in another biome
    "count": 0,
    "radiusMin": 0,
    "radiusMax": 0,
    "vegetationDensity": 0.05
  }
]
```

### Map Sizes

Preset map sizes, selected at island creation time.

```json
"mapSizes": {
  "very_small": { "width": 120, "height": 80  },
  "small":      { "width": 160, "height": 110 },
  "medium":     { "width": 210, "height": 140 },
  "large":      { "width": 280, "height": 190 },
  "very_large": { "width": 400, "height": 270 }
},
"defaultMapSize": "medium"
```

### Gameplay

| Parameter | Value | Description |
|-----------|-------|-------------|
| `tentRegenPerSecond` | `5` | Energy regen per second inside a tent |
| `scanNearbyRadius` | `15` | Chebyshev radius scanned by `look_around` |
| `surroundingsRadius` | `3` | Radius for "adjacent" entity checks |
| `defaultEffectRadius` | `3` | Default radius for item special effects |

---

## hallucinations.json

Defines pools of random sensory messages injected into character perception at a configurable interval.

```json
{
  "intervalMs": 30000,        // Average time between hallucinations per character
  "pools": {
    "<emotion_state>": [      // Pool name (mapped to emotion state)
      "Message text.",
      "Another message."
    ]
  }
}
```

---

## character-catalog.json

Configures the LPC (Liberated Pixel Cup) character sprite sheet system.

```json
{
  "tileSize": 64,             // Sprite tile size in pixels (LPC = 64×64)
  "sheet": "characters.png", // Default sprite sheet
  "options": {
    "body": [ ... ],          // Available body type tile IDs
    "hair": [ ... ],          // Available hair style tile IDs
    "beard": [ ... ]          // Available beard style tile IDs
  }
}
```

> This file is **not** hot-reloaded. Restart the island process after editing.

---

## agent-prompt.md

A Markdown file whose content is prepended to the system prompt for every MCP session. Use it to customise the AI personality, add world lore, or restrict behaviours:

```markdown
You are stranded on a procedurally generated island.
Your goal is to survive and build a shelter before nightfall.
```

> This file is **not** hot-reloaded. Restart the island process after editing.
