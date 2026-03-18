#!/usr/bin/env python3
"""
emoji-tileset.py

Extracts emoji bitmaps from Noto Color Emoji (CBDT) and builds a 16×16 sprite sheet.

Usage:
  python3 scripts/emoji-tileset.py [input.json] [output.png] [--cols N]

input.json  — { "berries": "🍒", ... }   (default: config/items.json)
output.png  — sprite sheet path           (default: public/emoji-items.png)
--cols N    — columns per row             (default: 8)

Also writes a JSON mapping: { "berries": {"col": 0, "row": 0}, ... }
"""

import sys, json, io, math
from pathlib import Path

# ── dependency guard ──────────────────────────────────────────────────────────
try:
    from fontTools.ttLib import TTFont
    from PIL import Image
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Run: pip3 install fonttools pillow --break-system-packages", file=sys.stderr)
    sys.exit(1)

ROOT      = Path(__file__).resolve().parent.parent
FONT_PATH = Path("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf")
TILE      = 16
GAP       = 1
STEP      = TILE + GAP

# ── parse args ────────────────────────────────────────────────────────────────
args    = sys.argv[1:]
in_path = None
out_path = ROOT / "public" / "emoji-items.png"
columns  = 8

i = 0
while i < len(args):
    if args[i] == "--cols" and i + 1 < len(args):
        columns = int(args[i + 1]); i += 2
    elif args[i].endswith(".json"):
        in_path = Path(args[i]); i += 1
    elif args[i].endswith(".png"):
        out_path = Path(args[i]); i += 1
    else:
        i += 1

if in_path is None:
    in_path = ROOT / "config" / "items.json"

items = json.loads(in_path.read_text())
entries = list(items.items())
if not entries:
    print("Error: no items to render.", file=sys.stderr); sys.exit(1)

# ── load font & build glyph map ───────────────────────────────────────────────
if not FONT_PATH.exists():
    print(f"Error: Noto Color Emoji not found at {FONT_PATH}", file=sys.stderr)
    sys.exit(1)

font  = TTFont(str(FONT_PATH))
cmap  = font.getBestCmap()
cbdt  = font['CBDT']
# Strike 0 is the only strike (109ppem)
strike_data = cbdt.strikeData[0]

def emoji_to_glyphs(emoji):
    """Return list of glyph names for the emoji (handles ZWJ sequences)."""
    # Strip variation selectors (U+FE0F)
    codepoints = [ord(c) for c in emoji if ord(c) != 0xFE0F]
    # Try ZWJ sequence first, then single codepoint
    # Noto uses underscore-joined names for sequences: u1F1E6_u1F1E8
    if len(codepoints) > 1:
        seq_name = "_".join(f"u{cp:X}" for cp in codepoints)
        if seq_name in strike_data:
            return [seq_name]
    # Single glyph
    return [f"u{cp:X}" for cp in codepoints if cmap.get(cp)]

def render_emoji(emoji) -> Image.Image:
    """Extract the 16×16 RGBA tile for the given emoji."""
    glyph_names = emoji_to_glyphs(emoji)
    for name in glyph_names:
        gd = strike_data.get(name)
        if gd and hasattr(gd, 'imageData'):
            src = Image.open(io.BytesIO(gd.imageData)).convert("RGBA")
            return src.resize((TILE, TILE), Image.LANCZOS)
    # Fallback: grey question-mark tile
    img = Image.new("RGBA", (TILE, TILE), (100, 100, 100, 180))
    return img

# ── render all tiles ──────────────────────────────────────────────────────────
rows   = math.ceil(len(entries) / columns)
width  = columns * STEP - GAP
height = rows    * STEP - GAP

sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))

mapping = {}
for idx, (name, emoji) in enumerate(entries):
    col = idx % columns
    row = idx // columns
    tile = render_emoji(emoji)
    x = col * STEP
    y = row * STEP
    sheet.paste(tile, (x, y), tile)
    mapping[name] = {"col": col, "row": row}
    print(f"  [{idx+1}/{len(entries)}] {name:15s} {emoji}  → ({col}, {row})")

# ── write outputs ─────────────────────────────────────────────────────────────
out_path.parent.mkdir(parents=True, exist_ok=True)
sheet.save(str(out_path), "PNG")
json_out = out_path.with_suffix(".json")
json_out.write_text(json.dumps(mapping, indent=2))

print(f"\nWrote sprite sheet: {out_path}  ({width}×{height}px, {len(entries)} items)")
print(f"Wrote mapping:      {json_out}")
