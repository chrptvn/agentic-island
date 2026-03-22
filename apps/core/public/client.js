'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const TILE_SRC_SIZE = 16;
const TILE_GAP      = 1;
const TILE_STEP     = TILE_SRC_SIZE + TILE_GAP;

// ─── State ────────────────────────────────────────────────────────────────────
let canvas      = null;
let ctx         = null;
let tileSet     = null;
let charSheet   = null;
let itemSheet   = null;   // emoji item sprite sheet
let itemRegistry = {};    // item name → { col, row } from /emoji-items.json
const itemIconCache = {};  // item name → data-URL string (lazy, cached)
let tileRegistry = {};    // tileId → { col, row, sheet, tileSize, step, frames?, fps? }
let itemDefs     = {};    // itemName → { equippable, hideWhenEquipped, ... }
let animatedCells = new Set(); // "x,y" keys of cells containing animated tiles
const sheetCache  = {};   // url → HTMLImageElement
let entityMap    = {};  // "x,y" → { health, maxHealth, wood?, berries? }
let characterList = []; // [{ id, x, y, stats }]
let charFrame    = 0;   // 0 or 1 — animation frame index
let lastMapData  = null;

// ─── Load images ─────────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

// ─── Load tile registry ───────────────────────────────────────────────────────
async function loadTileRegistry() {
  const res  = await fetch('/api/tiles');
  const data = await res.json();
  const defaultSheet = data.sheet;
  const sheetMeta = data.sheets ?? {};  // per-sheet overrides

  // Collect all unique sheet URLs and load them in parallel (skip missing sheets gracefully)
  const sheetUrls = [...new Set(data.tiles.map(t => t.sheet ?? defaultSheet))];
  await Promise.all(sheetUrls.map(async url => {
    try { sheetCache[url] = await loadImage('/' + url); }
    catch (e) { console.warn(`Sheet not found, skipping: ${url}`); }
  }));
  // tileSet stays as the default sheet for character rendering etc.
  tileSet = sheetCache[defaultSheet];

  for (const t of data.tiles) {
    const sheetUrl = t.sheet ?? defaultSheet;
    const override = sheetMeta[sheetUrl] ?? {};
    const tileSize = override.tileSize ?? data.tileSize;
    const tileGap  = override.tileGap  ?? data.tileGap;
    tileRegistry[t.id] = {
      col: t.col, row: t.row,
      sheet: sheetCache[sheetUrl],
      tileSize,
      step: tileSize + tileGap,
      frames: t.frames ?? null,
      fps:    t.fps    ?? null,
    };
  }
  itemDefs = data.itemDefs ?? {};
}

// ─── Load item registry (emoji sprite sheet mapping) ─────────────────────────
async function loadItemRegistry() {
  const res  = await fetch('/emoji-items.json');
  itemRegistry = await res.json();
}

// ─── Item icon as a 16×16 data-URL (lazy-cached from the item sheet) ─────────
// ─── Resolve the best source for an item icon: tile registry > emoji sheet ────
function itemIconSource(itemName) {
  const tile = tileRegistry[itemName];
  if (tile) return { sheet: tile.sheet, col: tile.col, row: tile.row, step: tile.step, tileSize: tile.tileSize };
  const emoji = itemRegistry[itemName] ?? itemRegistry['_unknown'];
  if (emoji && itemSheet) return { sheet: itemSheet, col: emoji.col, row: emoji.row, step: TILE_STEP, tileSize: TILE_SRC_SIZE };
  return null;
}

function itemIconHtml(itemName) {
  if (itemIconCache[itemName]) return `<img src="${itemIconCache[itemName]}" style="width:14px;height:14px;image-rendering:pixelated;vertical-align:middle">`;

  const src = itemIconSource(itemName);
  if (!src) return '📦';

  const off = document.createElement('canvas');
  off.width = off.height = TILE_SRC_SIZE;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(
    src.sheet,
    src.col * src.step, src.row * src.step, src.tileSize, src.tileSize,
    0, 0, src.tileSize, src.tileSize,
  );
  itemIconCache[itemName] = off.toDataURL();
  return `<img src="${itemIconCache[itemName]}" style="width:14px;height:14px;image-rendering:pixelated;vertical-align:middle">`;
}

// ─── Draw a single tile from its registered sheet ─────────────────────────────
function drawTile(tileId, cellX, cellY) {
  const t = tileRegistry[tileId];
  if (!t) return;
  let col = t.col;
  let row = t.row;
  if (t.frames && t.fps) {
    const frameIndex = Math.floor(Date.now() / (1000 / t.fps)) % t.frames.length;
    col = t.frames[frameIndex].col;
    row = t.frames[frameIndex].row;
  }
  ctx.drawImage(
    t.sheet,
    col * t.step, row * t.step, t.tileSize, t.tileSize,
    cellX, cellY, TILE_SRC_SIZE, TILE_SRC_SIZE,
  );
}

// ─── Draw a character frame from the char sheet ───────────────────────────────
function drawCharacter(col, cellX, cellY) {
  ctx.drawImage(
    charSheet,
    col * TILE_STEP, 0, TILE_SRC_SIZE, TILE_SRC_SIZE,
    cellX, cellY, TILE_SRC_SIZE, TILE_SRC_SIZE,
  );
}

// ─── Draw an equipped item overlaid on a character cell (full tile, same origin)
// DawnLike sprites are designed to layer at identical coordinates — the item
// sprite already positions the "held" visual relative to the character tile.
function drawItemOverCharacter(itemName, cellX, cellY) {
  const src = itemIconSource(itemName);
  if (!src) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    src.sheet,
    src.col * src.step, src.row * src.step, src.tileSize, src.tileSize,
    cellX, cellY, TILE_SRC_SIZE, TILE_SRC_SIZE,
  );
}


// ─── Draw a speech bubble above a character cell ─────────────────────────────
function drawSpeechBubble(text, cellX, cellY) {
  const FONT_SIZE   = 11;
  const MAX_WIDTH   = 160;
  const PADDING     = 5;
  const LINE_HEIGHT = FONT_SIZE + 3;
  const TAIL_H      = 4;

  ctx.font = `bold ${FONT_SIZE}px monospace`;

  // Word-wrap the text
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > MAX_WIDTH - PADDING * 2 && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const bubbleW = Math.min(MAX_WIDTH, Math.max(...lines.map(l => ctx.measureText(l).width)) + PADDING * 2);
  const bubbleH = lines.length * LINE_HEIGHT + PADDING * 2;

  // Position bubble centred above the tile
  const bx = cellX + TILE_SRC_SIZE / 2 - bubbleW / 2;
  const by = cellY - bubbleH - TAIL_H - 2;

  // Bubble background
  const r = 4;
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bubbleW - r, by);
  ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + r);
  ctx.lineTo(bx + bubbleW, by + bubbleH - r);
  ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - r, by + bubbleH);
  // Tail pointing down
  const tx = cellX + TILE_SRC_SIZE / 2;
  ctx.lineTo(tx + 4, by + bubbleH);
  ctx.lineTo(tx, by + bubbleH + TAIL_H);
  ctx.lineTo(tx - 4, by + bubbleH);
  ctx.lineTo(bx + r, by + bubbleH);
  ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + PADDING, by + PADDING + i * LINE_HEIGHT);
  }
}

// ─── Render a single map cell (layers 0–4, character injected between 3 and 4)
function renderCell(lx, ly, terrain, l1, l2, l3, l4, charAtCell) {
  const cellX = lx * TILE_SRC_SIZE;
  const cellY = ly * TILE_SRC_SIZE;

  // Layer 0/1: terrain + ground overlays (grass or water shore)
  if (l1 === 'grass') {
    drawTile('grass', cellX, cellY);
  } else if (l1) {
    drawTile(terrain === 'water' ? 'water_full' : 'grass', cellX, cellY);
    drawTile(l1, cellX, cellY);
  } else if (terrain === 'water') {
    drawTile('water_full', cellX, cellY);
  } else {
    drawTile('grass', cellX, cellY);
  }

  // Layer 2: path tiles (transparent, grass shows through)
  if (l2) drawTile(l2, cellX, cellY);

  // Layer 3: entity base / trunk
  if (l3) drawTile(l3, cellX, cellY);

  // Character (above entities, below canopy)
  if (charAtCell) {
    drawCharacter(charFrame, cellX, cellY);
    // Draw equipped-in-hands item over the character (top-right corner)
    const eq = charAtCell.stats?.equipment;
    if (eq?.hands && !itemDefs[eq.hands.item]?.hideWhenEquipped) drawItemOverCharacter(eq.hands.item, cellX, cellY);
    // Speech bubbles are drawn in a separate top-level pass (see drawSpeechBubbles)
  }

  // Layer 4: entity canopy (drawn above character)
  if (l4) drawTile(l4, cellX, cellY);
}

// ─── Draw all speech bubbles on top of the fully-rendered map ────────────────
function drawSpeechBubbles(characters) {
  for (const [, c] of Object.entries(characters)) {
    if (c.speech?.text) drawSpeechBubble(c.speech.text, c.x * TILE_SRC_SIZE, c.y * TILE_SRC_SIZE);
  }
}

// ─── Build a character position lookup ───────────────────────────────────────
function buildCharPosMap(characters) {
  const map = {};
  for (const [id, c] of Object.entries(characters)) {
    map[`${c.x},${c.y}`] = { id, ...c };
  }
  return map;
}

// ─── Render full map ─────────────────────────────────────────────────────────
function renderMap(mapData) {
  const { width, height, grid, overlays = {}, entities = {}, characters = {} } = mapData;

  entityMap     = entities;
  characterList = Object.entries(characters).map(([id, c]) => ({ id, ...c }));
  lastMapData   = mapData;

  const charPos = buildCharPosMap(characters);

  if (canvas.width !== width * TILE_SRC_SIZE)   canvas.width  = width  * TILE_SRC_SIZE;
  if (canvas.height !== height * TILE_SRC_SIZE) canvas.height = height * TILE_SRC_SIZE;
  ctx.imageSmoothingEnabled = false;

  // Rebuild the set of cells that contain animated tiles so rerenderAnimatedTiles() is fast
  animatedCells.clear();

  for (let ly = 0; ly < height; ly++) {
    for (let lx = 0; lx < width; lx++) {
      const terrain    = grid[ly]?.[lx] ?? 'water';
      const cellOverlay = overlays[`${lx},${ly}`] ?? [];
      const charHere   = charPos[`${lx},${ly}`] ?? null;
      renderCell(lx, ly, terrain, cellOverlay[0] ?? '', cellOverlay[1] ?? '', cellOverlay[2] ?? '', cellOverlay[3] ?? '', charHere);

      // Track cells with animated tiles (layers 1, 2, 3 from overlay)
      for (const tileId of cellOverlay) {
        if (tileId && tileRegistry[tileId]?.frames) {
          animatedCells.add(`${lx},${ly}`);
        }
      }
    }
  }

  document.getElementById('meta').textContent =
    `${width}×${height}  ·  seed: ${mapData.seed}`;

  drawSpeechBubbles(characters);
}

// ─── Re-render only character cells (for animation ticks) ────────────────────
function rerenderCharacters() {
  if (!lastMapData) return;
  const { grid, overlays = {}, characters = {} } = lastMapData;
  const charPos = buildCharPosMap(characters);

  for (const c of characterList) {
    const { x, y } = c;
    const terrain     = grid[y]?.[x] ?? 'water';
    const cellOverlay = overlays[`${x},${y}`] ?? [];
    renderCell(x, y, terrain, cellOverlay[0] ?? '', cellOverlay[1] ?? '', cellOverlay[2] ?? '', cellOverlay[3] ?? '', charPos[`${x},${y}`]);
  }
  drawSpeechBubbles(characters);
}
function rerenderAnimatedTiles() {
  if (!lastMapData || animatedCells.size === 0) return;
  const { grid, overlays = {}, characters = {} } = lastMapData;
  const charPos = buildCharPosMap(characters);

  for (const key of animatedCells) {
    const [x, y] = key.split(',').map(Number);
    const terrain     = grid[y]?.[x] ?? 'water';
    const cellOverlay = overlays[`${x},${y}`] ?? [];
    renderCell(x, y, terrain, cellOverlay[0] ?? '', cellOverlay[1] ?? '', cellOverlay[2] ?? '', cellOverlay[3] ?? '', charPos[key] ?? null);
  }
  drawSpeechBubbles(characters);
}

// ─── Entity + character tooltip ───────────────────────────────────────────────
function initTooltip() {
  const BOX_STYLE = [
    'background:rgba(10,10,20,0.88)','color:#e8e0c8',
    'border:1px solid #5a4a2a','border-radius:4px',
    'padding:6px 10px','font:12px monospace','line-height:1.6',
    'min-width:140px',
  ].join(';');

  const container = document.createElement('div');
  container.id = 'tooltip-container';
  container.style.cssText = [
    'position:fixed','display:none','pointer-events:none',
    'z-index:100','display:flex','flex-direction:column','gap:6px',
  ].join(';');
  document.body.appendChild(container);

  function makeBox(html) {
    const box = document.createElement('div');
    box.style.cssText = BOX_STYLE;
    box.innerHTML = html;
    return box;
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = Math.floor((e.clientX - rect.left) * scaleX / TILE_SRC_SIZE);
    const cy = Math.floor((e.clientY - rect.top)  * scaleY / TILE_SRC_SIZE);
    const key = `${cx},${cy}`;

    const boxes = [];

    // Character box
    const charHere = characterList.find(c => c.x === cx && c.y === cy);
    if (charHere) {
      const s = charHere.stats;
      const hpBar  = statBar(s.health,  s.maxHealth);
      const hunBar = statBar(s.hunger,  s.maxHunger);
      const enBar  = statBar(s.energy,  s.maxEnergy);
      const hp  = Math.floor(s.health);
      const hun = Math.floor(s.hunger);
      const en  = Math.floor(s.energy);
      const inv = (s.inventory ?? []).map(i => `${i.item}: ${i.qty}`).join('<br>');
      const eq = s.equipment ?? {};
      const SLOTS = ['hands','head','body','legs','feet'];
      const eqFilled = SLOTS.filter(sl => eq[sl]);
      let html =
        `<b>${charHere.id}</b><br>` +
        `❤️ ${hpBar} ${hp}/${s.maxHealth}<br>` +
        `🍖 ${hunBar} ${hun}/${s.maxHunger}<br>` +
        `⚡ ${enBar} ${en}/${s.maxEnergy}`;
      if (eqFilled.length > 0) {
        html += `<br><br><b>equipped</b><br>` +
          eqFilled.map(sl => `[${sl}] ${eq[sl].item}`).join('<br>');
      }
      if (inv) html += `<br><br><b>inventory</b><br>${inv}`;
      boxes.push(makeBox(html));
    }

    // Entity box
    const stats = entityMap[key];
    if (stats) {
      const tileId = (lastMapData?.overlays?.[key] ?? [])[2] ?? '';
      const label  = {
        young_tree:           'Oak Tree',
        old_tree_base:        'Oak Tree',
        young_berry:          'Berry Tree',
        old_berry_base:       'Berry Tree',
        young_berry_empty:    'Berry Tree',
        old_berry_empty_base: 'Berry Tree',
        rock:                 'Rock',
        log_pile:             'Log Pile',
        campfire_lit:         'Campfire 🔥',
        campfire_extinct:     'Campfire',
      }[tileId] ?? tileId;
      let html = `<b>${label}</b>`;
      if (stats.health != null && stats.maxHealth != null) {
        html += `<br>❤️ ${statBar(stats.health, stats.maxHealth)} ${stats.health}/${stats.maxHealth}`;
      }
      const NON_RES = new Set(['health','maxHealth','inventory']);
      for (const [k, v] of Object.entries(stats)) {
        if (NON_RES.has(k) || v == null) continue;
        html += `<br>${k}: ${v}`;
      }
      if (Array.isArray(stats.inventory)) {
        for (const entry of stats.inventory) {
          html += `<br>${entry.item}: ${entry.qty}`;
        }
      }
      boxes.push(makeBox(html));
    }

    container.innerHTML = '';
    if (boxes.length === 0) {
      container.style.display = 'none';
      return;
    }
    boxes.forEach(b => container.appendChild(b));
    container.style.display = 'flex';
    container.style.left = (e.clientX + 14) + 'px';
    container.style.top  = (e.clientY + 14) + 'px';
  });

  canvas.addEventListener('mouseleave', () => { container.style.display = 'none'; });

  function statBar(val, max) {
    const pct = Math.round((val / (max || 1)) * 10);
    return '█'.repeat(pct) + '░'.repeat(10 - pct);
  }
}

// ─── Draw-path mode (disabled — buttons removed) ────────────────────────────
function initDrawMode() {}


function startCharacterAnimation() {
  setInterval(() => {
    charFrame = charFrame === 0 ? 1 : 0;
    rerenderCharacters();
  }, 1000);
}

// ─── Tile animation loop ─────────────────────────────────────────────────────
function startTileAnimation() {
  setInterval(() => {
    rerenderAnimatedTiles();
  }, 500);
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  const statusEl = document.getElementById('status');

  ws.onopen = () => {
    statusEl.textContent = '⬤ connected';
    statusEl.className = 'connected';
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'map') renderMap(msg.data);
  };

  ws.onclose = () => {
    statusEl.textContent = '⬤ disconnected — reconnecting…';
    statusEl.className = 'disconnected';
    setTimeout(connect, 2000);
  };

  ws.onerror = () => ws.close();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  canvas = document.createElement('canvas');
  ctx = canvas.getContext('2d');
  document.getElementById('display-container').appendChild(canvas);

  [charSheet, itemSheet] = await Promise.all([
    loadImage('/roguelikeChar_transparent.png'),
    loadImage('/emoji-items.png'),
    loadTileRegistry(),   // also sets tileSet and sheetCache
    loadItemRegistry(),
  ]);

  initTooltip();
  initDrawMode();
  startCharacterAnimation();
  startTileAnimation();
  connect();
}

boot().catch(console.error);

