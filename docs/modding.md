# Agentic Island — Game Modding Guide

All game data lives in `apps/island/config/`. The island process **hot-reloads** the following files when you save them — no restart required:

| File | What it controls |
|---|---|
| `entities.json` | Every world object (trees, rocks, campfire, supply cache, etc.) |
| `item-defs.json` | Item behaviour (equippable, capabilities, eat effects, specials) |
| `items.json` | Item display emoji in the UI |
| `recipes.json` | Crafting recipes |
| `world.json` | Core game rules (hunger, energy, map generation) |

> **Tip:** `items.json` is NOT hot-reloaded. You need to restart the island process after editing it.

---

## 1. `world.json` — Game Rules

```json
{
  "tickMs": 500,                    // Server tick rate in milliseconds
  "moveTickInterval": 2,            // Ticks between each movement step
  "hungerDrainPerSecond": 0.2,      // Hunger lost per real second
  "healthDrainPerSecond": 0.5,      // Health lost per second when starving
  "healthRegenPassive": 0.5,        // Health regenerated per second when well-fed
  "energyRegenPassive": 1.0,        // Energy regenerated per second when idle
  "energyCosts": {
    "moveStep": 1,                  // Energy per walk step
    "moveStepOnPath": 0.5,          // Energy per pathfinding step
    "harvest": 5,                   // Energy per harvest action
    "build": 10,                    // Energy per build action
    "interact": 5,                  // Energy per interact action
    "craft": 3,                     // Energy per craft action
    "eat": 0                        // Energy cost to eat (free)
  },
  "characterStats": {
    "maxHealth": 100,
    "maxHunger": 100,
    "maxEnergy": 100
  },
  "mapGen": {
    "vegetationDensity": 0.1,       // General vegetation density (0–1)
    "forestCount": 2,               // Number of forest zones
    "forestVegetationDensity": 1,   // Vegetation density inside forests
    "lakeProbability": 0.01,        // Chance per cell of being a lake seed
    "lilyPadDensity": 0.10          // Density of lily pads on water
    // ... more map gen params
  }
}
```

---

## 2. `entities.json` — World Entities

The top-level structure is `{ "entities": [ ... ] }`. Each entry is an entity definition.

### Minimal entity (a harvestable plant)

```json
{
  "id": "my_plant",
  "name": "My Plant",
  "tiles": [
    { "dx": 0, "dy": 0, "layer": 3, "tileId": "plant" }
  ],
  "blocks": false,
  "spawn": { "weight": 1.0 },
  "stats": { "wild_herb": 2 },
  "randomStats": {
    "wild_herb": { "min": 1, "max": 3 }
  },
  "harvest": {
    "fullBase": "plant",
    "emptyBase": "plant",
    "regrowMs": 180000
  }
}
```

### Entity fields reference

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Referenced in recipes, interactions, growth chains. |
| `name` | string | Human-readable display name. |
| `tiles` | array | Visual tiles that compose this entity (see **Tiles** below). |
| `blocks` | boolean | If `true`, characters cannot walk through this entity. |
| `spawn.weight` | number | Relative spawn probability during world generation. Higher = more common. |
| `spawn.forestOnly` | boolean | Only spawns inside forest zones. |
| `spawn.noForest` | boolean | Never spawns inside forest zones. |
| `spawn.lakeOnly` | boolean | Only spawns on lake-border water cells. |
| `spawn.lakeInterior` | boolean | Only spawns on deep lake water cells. |
| `stats` | object | Default resource amounts (also used as starting inventory when entity spawns). |
| `randomStats` | object | Randomizes stats on spawn: `{ "item": { "min": N, "max": M } }`. Overrides `stats` values. |
| `harvest` | object | Makes this entity harvestable (see **Harvest** below). |
| `build` | object | Makes this entity buildable by players (see **Build** below). |
| `interact` | object | Makes this entity interactable, morphing it into another entity (see **Interact** below). |
| `decay` | object | Entity loses health over time and can be refuelled (see **Decay** below). |
| `repair` | object | Entity can be refuelled manually without a decay timer. |
| `container` | boolean | If `true`, players can store items in this entity. |
| `acceptedItems` | string[] | Whitelist of item IDs allowed in the container. |
| `rejectedItems` | string[] | Blacklist of item IDs not allowed in the container. |
| `maxItems` | number | Max item stack count in the container. |
| `growthStages` | object | Entity automatically advances to another entity after a delay (see **Growth** below). |
| `proximityTrigger` | object | Sends a sensory message when a character walks nearby. |
| `interactionEffect` | object | Sends messages/emotion effects when a character interacts. |

---

### Tiles

Each entry in `tiles` places one sprite relative to the entity's anchor cell `(0, 0)`:

```json
{ "dx": 0, "dy": 0,  "layer": 3, "tileId": "campfire_lit" }
{ "dx": 0, "dy": -1, "layer": 4, "tileId": "campfire_lit_top" }
```

- **`dx`, `dy`**: offset from anchor. `dy: -1` = one cell above (canopy).
- **`layer`**: `3` = entity level (same z as player), `4` = canopy (rendered above player).
- **`tileId`**: must be a valid ID from `tileset.json`.

#### Available tile IDs

| Category | Tile IDs |
|---|---|
| Terrain | `grass`, `water` |
| Trees (big) | `tree_light0–3`, `tree_dark0–3`, `tree_orange0–3`, `tree_dead0–3` |
| Trees (small) | `bush_light`, `bush_dark`, `bush_orange`, `bush_dead` |
| Stumps & logs | `small_stump`, `large_stump`, `fallen_tree_horrizontal0–1`, `fallen_tree_vertical0–1`, `log_pile` |
| Plants | `plant`, `cotton_patch`, `grass_patch`, `dead_plant`, `dead_grass_patch`, `sprout` |
| Flowers | `white_flowers`, `white_flowers_patch`, `moon_blossom`, `pink_flowers`, `red_flowers`, `blue_flowers`, `skyblossoms`, `yellow_flowers` |
| Mushrooms | `orange_mushrooms`, `purple_mushrooms` |
| Rocks | `small_rock`, `big_rock`, `rock_small`, `rock_large` |
| Crops | `carrot`, `lettuce`, `pumpkin`, `cabbage` |
| Bushes | `berry_bush_empty`, `berry_bush_full` |
| Structures | `campfire_extinct`, `campfire_lit`, `campfire_lit_top`, `supply_cache`, `waystone_dormant`, `waystone_humming` |
| Water plants | `lily_pad_small`, `lily_pad_big`, `berries` |

---

### Harvest

Makes the entity harvestable using the `harvest` MCP tool.

```json
"harvest": {
  "fullBase": "berry_bush_full",   // Tile shown when resources are available
  "emptyBase": "berry_bush_empty", // Tile shown when resources are depleted
  "regrowMs": 300000,              // Milliseconds until resources replenish
  "requires": ["chop"],            // Tool capability required (omit = no tool needed)
  "damage": 20,                    // HP damage per harvest strike (omit = one-shot drain)
  "onDeath": {
    "spawnEntity": "log_pile",     // Entity placed at this cell after death
    "drops": { "wood": 3 },        // Items added to character inventory on death
    "dropStats": true              // Also drop all entity stats as items on death
  }
}
```

**Tool capabilities** (for `requires`): `chop`, `mine`, `cut`, `plow`.

---

### Build

Makes the entity placeable by a character using `build_structure`.

```json
"build": {
  "costs": {
    "wood": 3,
    "branches": 2,
    "rocks": 5
  }
}
```

Items are consumed from the character's inventory. Character must be **adjacent** to the target tile.

---

### Interact

Replaces this entity with another when a character uses `interact_with`.

```json
"interact": {
  "costs": {},              // Items consumed from inventory (empty = free)
  "result": "campfire_lit", // Entity to place after interaction
  "preserveHealth": true,   // Copy this entity's health to the new one
  "minHealth": 10           // Minimum health required to interact
}
```

To give an interaction a feedback message, add `interactionEffect`:

```json
"interactionEffect": {
  "message": "You light the campfire.",
  "nearbyMessage": "You see someone light a fire nearby.",
  "radius": 3
}
```

---

### Decay

Entity health drains over time (e.g. a lit campfire burning out). Characters can top it up with `feed_entity`.

```json
"decay": {
  "ratePerSecond": 0.017,    // Health drained per second (~100 HP over ~100 minutes)
  "fuelItem": "wood",        // Item consumed when feeding
  "healthPerFuel": 10,       // HP restored per 1 fuel item
  "onEmpty": "campfire_extinct"  // Entity to replace with when HP = 0. null = disappear
}
```

For a static entity that only accepts refuelling (no automatic drain), use `repair` instead:

```json
"repair": {
  "fuelItem": "wood",
  "healthPerFuel": 10
}
```

---

### Growth Stages

Entity automatically advances to another entity after a delay (used for growing plants/trees).

```json
"growthStages": {
  "nextStage": "oak_sprout_2",   // Entity ID to become after growing
  "growthMs": 120000             // Milliseconds until growth (2 minutes)
}
```

You can chain multiple stages: sprout → mid-sprout → mature tree. The final stage should have no `growthStages`.

> **Seeding via `plant_seed` tool:** The mapping from seed item → first sprout entity ID is hardcoded in `island.ts` (`SEED_TO_SPROUT`). To add a new plantable seed you must also update that map in code.

---

### Proximity Trigger

Sends a sensory message to a character when they move within range.

```json
"proximityTrigger": {
  "message": "You smell woodsmoke.",
  "radius": 2   // Chebyshev distance (default: 1 = strictly adjacent)
}
```

---

## 3. `item-defs.json` — Item Behaviour

Each key is an item ID. Fields:

```json
"stone_axe": {
  "equippable": true,        // Can be held in the hands slot
  "wearable": null,          // "head" | "body" | "legs" | "feet" | null
  "hideWhenEquipped": true,  // Don't show sprite when equipped (for rocks, etc.)
  "capabilities": {
    "chop": 1,               // Capability level (multiplied by harvestYield)
    "mine": 0.3,
    "plow": 0.2
  },
  "eat": {                   // Makes this item edible
    "hunger": 20,            // Hunger restored (can be negative)
    "health": -10,           // Health change on eat (optional)
    "message": "Ouch."       // Message shown to character (optional)
  },
  "special": [               // Extra verb interactions
    {
      "verb": "brandish",
      "description": "Wave the axe menacingly.",
      "message": "You swing the axe. You feel powerful.",
      "nearbyMessage": "Someone is brandishing an axe nearby.",
      "radius": 4,
      "emotionEffects": [
        { "key": "anxious_confident", "delta": -10 }
      ]
    }
  ]
}
```

#### Capability keys

| Key | Used by |
|---|---|
| `chop` | Stone axe — cuts trees |
| `mine` | Stone pickaxe — mines rocks |
| `cut` | Stone knife — cuts things |
| `plow` | Plow, shovel, stone axe — tills soil |

#### Emotion keys

Emotions are bipolar sliders. Positive delta pushes toward the high pole:

| Key | Low pole → High pole |
|---|---|
| `sad_happy` | sad → happy |
| `anxious_confident` | anxious → confident |
| `joy` | (positive = more joyful) |
| `fear` | (positive = more fearful) |

---

## 4. `items.json` — Item Display Emoji

Maps item ID → emoji shown in the UI. Add a new item ID here to give it an icon:

```json
{
  "my_item": "🧪"
}
```

> Fallback is `📦` (`_unknown`). This file requires **server restart** to take effect.

---

## 5. `recipes.json` — Crafting Recipes

Structure: `{ "recipes": { "<output_item>": { ... } } }`

```json
"stone_axe": {
  "ingredients": {
    "branches": 1,
    "rocks": 1
  },
  "output": {
    "stone_axe": 1       // Can output multiple items or quantities
  },
  "description": "A crude stone axe — useful for chopping trees"
}
```

> Recipes only define **crafting** (hand-crafted). Building structures on the map uses `build.costs` in `entities.json` instead.

---

## Workflow: Adding a New Entity

1. **Pick or reuse a tile ID** from the available tile IDs table above.
2. **Add the entity** to `entities.json` inside the `"entities"` array.
3. **Add item behaviour** (if it drops a new item) in `item-defs.json`.
4. **Add item emoji** in `items.json`.
5. **Add a recipe** in `recipes.json` if it should be craftable.
6. **Save** — `entities.json`, `item-defs.json`, and `recipes.json` hot-reload automatically. Restart the island service after `items.json` changes.

### Example: A new buildable well

```json
// In entities.json → "entities" array:
{
  "id": "stone_well",
  "name": "Stone Well",
  "tiles": [
    { "dx": 0, "dy": 0, "layer": 3, "tileId": "big_rock" }
  ],
  "blocks": true,
  "build": {
    "costs": { "rocks": 8, "wood": 2 }
  },
  "stats": { "health": 100, "maxHealth": 100 },
  "proximityTrigger": {
    "message": "You hear the distant sound of water.",
    "radius": 2
  }
}
```

### Example: A new food item with a recipe

```jsonc
// item-defs.json — add a new entry:
"mushroom_stew": {
  "equippable": false,
  "wearable": null,
  "eat": { "hunger": 40, "message": "Warm and filling." }
}

// items.json — add emoji:
"mushroom_stew": "🍲"

// recipes.json — add recipe:
"mushroom_stew": {
  "ingredients": { "mushroom": 2, "wild_herb": 1 },
  "output": { "mushroom_stew": 1 },
  "description": "A hearty stew made from forest mushrooms"
}
```

---

## Notes

- **IDs must be unique** across all entities. Duplicate IDs will silently overwrite each other.
- **`tileId` must exist** in `tileset.json`. Using an unknown tile ID will render nothing or cause errors.
- **Hot reload** applies to new and modified entities. The world map itself is NOT regenerated — spawned entities and overrides persist. Changes only affect new spawns and entities placed by the build tool.
- The old `chest` entity has been replaced by `supply_cache`, which reuses an existing visible tile and works as a real buildable container.
