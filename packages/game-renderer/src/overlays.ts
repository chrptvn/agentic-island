/**
 * HUD overlay drawing: health bars, speech bubbles, and name labels.
 *
 * All functions draw directly onto a CanvasRenderingContext2D at the
 * given canvas-space coordinates (already viewport-adjusted).
 */

const HEALTH_BAR_HEIGHT = 3;
const HEALTH_BAR_BG = "#333";
const HEALTH_BAR_FG = "#2ecc40";
const HEALTH_BAR_LOW = "#e74c3c";
const HEALTH_LOW_THRESHOLD = 0.3;

const BUBBLE_PADDING = 8;
const BUBBLE_RADIUS = 6;
const BUBBLE_BG = "rgba(245,239,230,0.92)";       // surface #f5efe6 at ~92%
const BUBBLE_BORDER = "#d4c5b0";                   // border-default
const BUBBLE_TEXT_COLOR = "#3d3329";                // text-primary
const BUBBLE_NAME_COLOR = "#0d9488";               // accent-cyan
const BUBBLE_FONT = "bold 14px ui-monospace, 'Cascadia Code', 'Fira Code', Menlo, monospace";
const BUBBLE_NAME_FONT = "bold 10px ui-monospace, 'Cascadia Code', 'Fira Code', Menlo, monospace";
const BUBBLE_MAX_WIDTH_DEFAULT = 220;
const BUBBLE_TAIL_SIZE = 5;

const LABEL_FONT = "bold 8px sans-serif";
const LABEL_COLOR = "#fff";
const LABEL_SHADOW = "#000";

/**
 * Draw a health bar above an entity.
 *
 * The bar is centered horizontally on `canvasX` and drawn above `canvasY`.
 */
export function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  current: number,
  max: number,
  canvasX: number,
  canvasY: number,
  width: number,
): void {
  if (max <= 0) return;

  const ratio = Math.max(0, Math.min(1, current / max));
  const x = canvasX - width / 2;
  const y = canvasY - HEALTH_BAR_HEIGHT - 2;

  // Background
  ctx.fillStyle = HEALTH_BAR_BG;
  ctx.fillRect(x, y, width, HEALTH_BAR_HEIGHT);

  // Foreground
  ctx.fillStyle = ratio <= HEALTH_LOW_THRESHOLD ? HEALTH_BAR_LOW : HEALTH_BAR_FG;
  ctx.fillRect(x, y, width * ratio, HEALTH_BAR_HEIGHT);
}

/**
 * Draw a speech bubble above a character.
 *
 * The bubble is centered horizontally on `canvasX` and drawn above `canvasY`
 * with a small downward-pointing tail.
 */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasX: number,
  canvasY: number,
  name?: string,
  maxWidth: number = BUBBLE_MAX_WIDTH_DEFAULT,
): void {
  if (!text) return;

  ctx.save();
  ctx.textBaseline = "top";

  // Measure name line if provided
  let nameHeight = 0;
  let nameWidth = 0;
  if (name) {
    ctx.font = BUBBLE_NAME_FONT;
    nameWidth = ctx.measureText(name).width;
    nameHeight = 14; // line height for name
  }

  // Word-wrap body text
  ctx.font = BUBBLE_FONT;
  const lines = wrapText(ctx, text, maxWidth - BUBBLE_PADDING * 2);
  const lineHeight = 18;
  const textHeight = lines.length * lineHeight;
  const textWidth = Math.min(
    maxWidth - BUBBLE_PADDING * 2,
    Math.max(nameWidth, ...lines.map((l) => ctx.measureText(l).width)),
  );

  const bubbleW = textWidth + BUBBLE_PADDING * 2;
  const bubbleH = nameHeight + textHeight + BUBBLE_PADDING * 2;
  const bx = canvasX - bubbleW / 2;
  const by = canvasY - bubbleH - BUBBLE_TAIL_SIZE - 2;

  // Rounded rect background
  ctx.fillStyle = BUBBLE_BG;
  ctx.beginPath();
  roundedRect(ctx, bx, by, bubbleW, bubbleH, BUBBLE_RADIUS);
  ctx.fill();

  // Border
  ctx.strokeStyle = BUBBLE_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, bx, by, bubbleW, bubbleH, BUBBLE_RADIUS);
  ctx.stroke();

  // Tail
  ctx.fillStyle = BUBBLE_BG;
  ctx.beginPath();
  ctx.moveTo(canvasX - BUBBLE_TAIL_SIZE, by + bubbleH);
  ctx.lineTo(canvasX, by + bubbleH + BUBBLE_TAIL_SIZE);
  ctx.lineTo(canvasX + BUBBLE_TAIL_SIZE, by + bubbleH);
  ctx.closePath();
  ctx.fill();
  // Tail border (left + right edges only)
  ctx.strokeStyle = BUBBLE_BORDER;
  ctx.beginPath();
  ctx.moveTo(canvasX - BUBBLE_TAIL_SIZE, by + bubbleH);
  ctx.lineTo(canvasX, by + bubbleH + BUBBLE_TAIL_SIZE);
  ctx.lineTo(canvasX + BUBBLE_TAIL_SIZE, by + bubbleH);
  ctx.stroke();

  // Name label
  let textY = by + BUBBLE_PADDING;
  if (name) {
    ctx.font = BUBBLE_NAME_FONT;
    ctx.fillStyle = BUBBLE_NAME_COLOR;
    ctx.fillText(name, bx + BUBBLE_PADDING, textY);
    textY += nameHeight;
  }

  // Body text
  ctx.font = BUBBLE_FONT;
  ctx.fillStyle = BUBBLE_TEXT_COLOR;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i]!,
      bx + BUBBLE_PADDING,
      textY + i * lineHeight,
    );
  }

  ctx.restore();
}

/**
 * Draw a character name label centered below the given position.
 */
export function drawNameLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  canvasX: number,
  canvasY: number,
): void {
  if (!name) return;

  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Shadow for readability
  ctx.fillStyle = LABEL_SHADOW;
  ctx.fillText(name, canvasX + 1, canvasY + 1);

  ctx.fillStyle = LABEL_COLOR;
  ctx.fillText(name, canvasX, canvasY);

  ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────────────

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines : [""];
}
