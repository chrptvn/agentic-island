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

const BUBBLE_PADDING = 4;
const BUBBLE_RADIUS = 4;
const BUBBLE_BG = "rgba(255,255,255,0.92)";
const BUBBLE_TEXT_COLOR = "#222";
const BUBBLE_FONT = "10px sans-serif";
const BUBBLE_MAX_WIDTH_DEFAULT = 120;
const BUBBLE_TAIL_SIZE = 4;

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
  maxWidth: number = BUBBLE_MAX_WIDTH_DEFAULT,
): void {
  if (!text) return;

  ctx.save();
  ctx.font = BUBBLE_FONT;
  ctx.textBaseline = "top";

  // Word-wrap text
  const lines = wrapText(ctx, text, maxWidth - BUBBLE_PADDING * 2);
  const lineHeight = 12;
  const textHeight = lines.length * lineHeight;
  const textWidth = Math.min(
    maxWidth - BUBBLE_PADDING * 2,
    Math.max(...lines.map((l) => ctx.measureText(l).width)),
  );

  const bubbleW = textWidth + BUBBLE_PADDING * 2;
  const bubbleH = textHeight + BUBBLE_PADDING * 2;
  const bx = canvasX - bubbleW / 2;
  const by = canvasY - bubbleH - BUBBLE_TAIL_SIZE - 2;

  // Rounded rect background
  ctx.fillStyle = BUBBLE_BG;
  ctx.beginPath();
  roundedRect(ctx, bx, by, bubbleW, bubbleH, BUBBLE_RADIUS);
  ctx.fill();

  // Tail
  ctx.beginPath();
  ctx.moveTo(canvasX - BUBBLE_TAIL_SIZE, by + bubbleH);
  ctx.lineTo(canvasX, by + bubbleH + BUBBLE_TAIL_SIZE);
  ctx.lineTo(canvasX + BUBBLE_TAIL_SIZE, by + bubbleH);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.fillStyle = BUBBLE_TEXT_COLOR;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i]!,
      bx + BUBBLE_PADDING,
      by + BUBBLE_PADDING + i * lineHeight,
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
