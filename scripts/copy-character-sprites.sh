#!/usr/bin/env bash
# Copy character idle sprites from island app to web public dir for the passport character preview.
# Only copies idle.png files (the minimum needed for character designer).
set -euo pipefail

SRC="$(dirname "$0")/../apps/island/sprites/LPC Characters"
DST="$(dirname "$0")/../apps/web/public/characters"

rm -rf "$DST"
mkdir -p "$DST"

# Copy body idle sprites: bodies/{skinColor}/{gender}/idle.png
find "$SRC/bodies" -name "idle.png" | while read -r f; do
  rel="${f#$SRC/}"
  mkdir -p "$DST/$(dirname "$rel")"
  cp "$f" "$DST/$rel"
done

# Copy clothing idle sprites
find "$SRC/clothing" -name "idle.png" | while read -r f; do
  rel="${f#$SRC/}"
  mkdir -p "$DST/$(dirname "$rel")"
  cp "$f" "$DST/$rel"
done

# Copy hair idle sprites
find "$SRC/hair" -name "idle.png" | while read -r f; do
  rel="${f#$SRC/}"
  mkdir -p "$DST/$(dirname "$rel")"
  cp "$f" "$DST/$rel"
done

echo "Character idle sprites copied to $DST"
find "$DST" -name "idle.png" | wc -l
echo "files copied"
