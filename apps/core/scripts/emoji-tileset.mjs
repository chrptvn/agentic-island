#!/usr/bin/env node
/**
 * emoji-tileset.mjs
 *
 * Renders a set of emojis into a 16×16 sprite sheet PNG.
 *
 * Usage:
 *   node scripts/emoji-tileset.mjs [input.json] [output.png] [--cols N]
 *
 * input.json — object mapping item names to emoji characters:
 *   { "berries": "🍒", "wood": "🪵", "rocks": "🪨" }
 *   Defaults to the built-in ITEM_ICON map if not provided.
 *
 * output.png — path to write the sprite sheet (default: public/emoji-items.png)
 *
 * --cols N — number of columns in the sheet (default: 8)
 *
 * Also writes a JSON mapping alongside the PNG:
 *   { "berries": { "col": 0, "row": 0 }, "wood": { "col": 1, "row": 0 }, ... }
 * This can be added to config/tileset.json or used as a separate items sheet.
 */

import { createCanvas, registerFont } from "canvas";
import { writeFileSync, existsSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Default emoji map (mirrors public/client.js ITEM_ICON) ───────────────────
const DEFAULT_ITEMS = {
  berries:   "🍒",
  wood:      "🪵",
  rocks:     "🪨",
  branches:  "🌿",
  acorns:    "🌰",
  stone_axe: "🪓",
};

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputPath  = null;
let outputPath = join(__dirname, "..", "public", "emoji-items.png");
let columns    = 8;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--cols" && args[i + 1]) {
    columns = parseInt(args[++i], 10);
  } else if (!inputPath && args[i].endsWith(".json")) {
    inputPath = args[i];
  } else if (!args[i].startsWith("--") && args[i].endsWith(".png")) {
    outputPath = args[i];
  }
}

// ── Load item map ─────────────────────────────────────────────────────────────
let items = DEFAULT_ITEMS;
if (inputPath) {
  if (!existsSync(inputPath)) {
    process.stderr.write(`Error: input file not found: ${inputPath}\n`);
    process.exit(1);
  }
  const raw = JSON.parse((await import("fs")).readFileSync(inputPath, "utf-8"));
  items = raw;
}

const entries = Object.entries(items);
if (entries.length === 0) {
  process.stderr.write("Error: no items to render.\n");
  process.exit(1);
}

// ── Register Noto Color Emoji if available ────────────────────────────────────
const NOTO_PATH = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf";
if (existsSync(NOTO_PATH)) {
  registerFont(NOTO_PATH, { family: "Noto Color Emoji" });
}

// ── Render ────────────────────────────────────────────────────────────────────
const TILE = 16;
const GAP  = 1;  // 1px gap between tiles (matches the existing tileset convention)
const STEP = TILE + GAP;

const rows   = Math.ceil(entries.length / columns);
const width  = columns * STEP - GAP;
const height = rows    * STEP - GAP;

const canvas = createCanvas(width, height);
const ctx    = canvas.getContext("2d");

// Transparent background
ctx.clearRect(0, 0, width, height);

// Emoji rendering settings
ctx.textBaseline = "middle";
ctx.textAlign    = "center";

// Try to find a font size that fits the emoji within 14px (leaving 1px padding each side)
const FONT_SIZE = 12;
ctx.font = `${FONT_SIZE}px "Noto Color Emoji", Apple Color Emoji, Segoe UI Emoji, sans-serif`;

const mapping = {};

entries.forEach(([name, emoji], index) => {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const cx  = col * STEP + TILE / 2;
  const cy  = row * STEP + TILE / 2 + 1; // +1 optical centering

  ctx.fillText(emoji, cx, cy);
  mapping[name] = { col, row };
});

// ── Write PNG ─────────────────────────────────────────────────────────────────
const pngBuffer = canvas.toBuffer("image/png");
writeFileSync(outputPath, pngBuffer);
process.stdout.write(`Wrote sprite sheet: ${outputPath}  (${width}×${height}px, ${entries.length} items)\n`);

// ── Write JSON mapping ────────────────────────────────────────────────────────
const base    = basename(outputPath, extname(outputPath));
const jsonOut = join(dirname(outputPath), `${base}.json`);
writeFileSync(jsonOut, JSON.stringify(mapping, null, 2));
process.stdout.write(`Wrote mapping:      ${jsonOut}\n`);
process.stdout.write(`\nMapping:\n${JSON.stringify(mapping, null, 2)}\n`);
