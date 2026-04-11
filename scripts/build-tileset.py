#!/usr/bin/env python3
"""
Build-time tileset atlas generator.

Reads tileset.json + source sprite sheet PNGs, extracts only the referenced
cells, composites them into a single 32px atlas PNG, and writes a compiled
tileset JSON with updated coordinates.

Usage:
    python3 scripts/build-tileset.py

Outputs:
    apps/island/sprites/tileset-atlas.png
    apps/island/config/tileset-compiled.json
"""

import json
import math
import os
import sys
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
ISLAND_DIR = REPO_ROOT / "apps" / "island"
SPRITES_DIR = ISLAND_DIR / "sprites"
CONFIG_DIR = ISLAND_DIR / "config"

SOURCE_JSON = CONFIG_DIR / "tileset.json"
OUTPUT_ATLAS = SPRITES_DIR / "tileset-atlas.png"
OUTPUT_JSON = CONFIG_DIR / "tileset-compiled.json"

ATLAS_TILE_SIZE = 32
ATLAS_TILE_GAP = 0
ATLAS_COLS = 32  # 32 columns → 1024px wide
ATLAS_SHEET_NAME = "tileset-atlas.png"


def load_source_config():
    with open(SOURCE_JSON) as f:
        return json.load(f)


def get_tile_size(tile, config):
    """Resolve the effective tileSize and tileGap for a tile."""
    sheet = tile.get("sheet", config.get("sheet", ""))
    override = config.get("sheets", {}).get(sheet, {})
    ts = override.get("tileSize", config["tileSize"])
    gap = override.get("tileGap", config["tileGap"])
    return ts, gap


def extract_cell(sheet_img, col, row, tile_size, gap):
    """Extract a single cell from a sprite sheet and return as 32×32 Image."""
    x = col * (tile_size + gap)
    y = row * (tile_size + gap)
    cell = sheet_img.crop((x, y, x + tile_size, y + tile_size))
    if tile_size != ATLAS_TILE_SIZE:
        cell = cell.resize(
            (ATLAS_TILE_SIZE, ATLAS_TILE_SIZE), Image.NEAREST
        )
    return cell


def main():
    config = load_source_config()
    tiles = config["tiles"]

    # Cache loaded sheet images
    sheet_cache: dict[str, Image.Image] = {}

    def get_sheet(sheet_path: str) -> Image.Image:
        if sheet_path not in sheet_cache:
            full_path = SPRITES_DIR / sheet_path
            if not full_path.exists():
                print(f"ERROR: Sheet not found: {full_path}", file=sys.stderr)
                sys.exit(1)
            sheet_cache[sheet_path] = Image.open(full_path).convert("RGBA")
        return sheet_cache[sheet_path]

    # Collect all cells to extract: list of (sheet, col, row, tileSize, gap)
    # Each cell gets a sequential index → atlas position
    cells: list[tuple[str, int, int, int, int]] = []
    # Map: tile_id → { atlas_col, atlas_row } for static tiles
    # Map: tile_id → { frames: [{atlas_col, atlas_row}, ...] } for animated
    tile_map: dict[str, dict] = {}

    for tile in tiles:
        sheet = tile.get("sheet", config.get("sheet", ""))
        ts, gap = get_tile_size(tile, config)
        tile_id = tile["id"]

        if "frames" in tile:
            frame_positions = []
            for frame in tile["frames"]:
                idx = len(cells)
                cells.append((sheet, frame["col"], frame["row"], ts, gap))
                atlas_col = idx % ATLAS_COLS
                atlas_row = idx // ATLAS_COLS
                frame_positions.append({"col": atlas_col, "row": atlas_row})
            tile_map[tile_id] = {"frames": frame_positions}
        else:
            idx = len(cells)
            cells.append((sheet, tile["col"], tile["row"], ts, gap))
            atlas_col = idx % ATLAS_COLS
            atlas_row = idx // ATLAS_COLS
            tile_map[tile_id] = {"col": atlas_col, "row": atlas_row}

    total_cells = len(cells)
    atlas_rows = math.ceil(total_cells / ATLAS_COLS)
    atlas_w = ATLAS_COLS * ATLAS_TILE_SIZE
    atlas_h = atlas_rows * ATLAS_TILE_SIZE

    print(f"Tiles: {len(tiles)}, Cells: {total_cells}")
    print(f"Atlas: {ATLAS_COLS}×{atlas_rows} = {atlas_w}×{atlas_h} px")

    # Create atlas image
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))

    for idx, (sheet, col, row, ts, gap) in enumerate(cells):
        sheet_img = get_sheet(sheet)
        cell = extract_cell(sheet_img, col, row, ts, gap)
        ax = (idx % ATLAS_COLS) * ATLAS_TILE_SIZE
        ay = (idx // ATLAS_COLS) * ATLAS_TILE_SIZE
        atlas.paste(cell, (ax, ay))

    atlas.save(OUTPUT_ATLAS, "PNG", optimize=True)
    print(f"Wrote atlas: {OUTPUT_ATLAS} ({os.path.getsize(OUTPUT_ATLAS)} bytes)")

    # Build compiled tileset JSON
    compiled_tiles = []
    for tile in tiles:
        tile_id = tile["id"]
        pos = tile_map[tile_id]

        compiled = {
            "id": tile_id,
            "sheet": ATLAS_SHEET_NAME,
            "layer": tile.get("layer", 0),
            "category": tile.get("category", ""),
            "description": tile.get("description", ""),
        }

        if "frames" in pos:
            # First frame is the base col/row
            compiled["col"] = pos["frames"][0]["col"]
            compiled["row"] = pos["frames"][0]["row"]
            compiled["frames"] = pos["frames"]
            compiled["fps"] = tile.get("fps", 10)
        else:
            compiled["col"] = pos["col"]
            compiled["row"] = pos["row"]

        compiled_tiles.append(compiled)

    compiled_config = {
        "sheet": ATLAS_SHEET_NAME,
        "tileSize": ATLAS_TILE_SIZE,
        "tileGap": ATLAS_TILE_GAP,
        "sheets": {
            ATLAS_SHEET_NAME: {
                "tileSize": ATLAS_TILE_SIZE,
                "tileGap": ATLAS_TILE_GAP,
            }
        },
        "tiles": compiled_tiles,
    }

    with open(OUTPUT_JSON, "w") as f:
        json.dump(compiled_config, f, indent=2)
    print(f"Wrote compiled config: {OUTPUT_JSON}")

    # Print source sheets that are no longer needed at runtime
    source_sheets = set()
    for tile in config["tiles"]:
        source_sheets.add(tile.get("sheet", config.get("sheet", "")))
    print(f"\nSource sheets (can be excluded from upload):")
    for s in sorted(source_sheets):
        print(f"  {s}")


if __name__ == "__main__":
    main()
