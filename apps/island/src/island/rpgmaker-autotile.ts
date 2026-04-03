/**
 * RPG Maker 48-tile autotile mapping for Pipoya Type 3 tilesheets.
 *
 * Each sheet is an 8×6 grid (48 tiles) of 32×32px tiles.
 * The mapping uses an 8-bit bitmask where bit=1 means the neighbor is the
 * SAME terrain type. Diagonal bits are only relevant when both adjacent
 * cardinal neighbors are also the same terrain.
 *
 * Bit positions (clockwise): N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128
 */

// ── Bitmask constants ─────────────────────────────────────────────────────────
export const BIT_N  = 1;
export const BIT_NE = 2;
export const BIT_E  = 4;
export const BIT_SE = 8;
export const BIT_S  = 16;
export const BIT_SW = 32;
export const BIT_W  = 64;
export const BIT_NW = 128;

/**
 * Compute the effective 8-bit bitmask by masking out diagonal bits
 * when either adjacent cardinal is 0 (different terrain).
 *
 * @param rawMask  Raw 8-bit mask with all 8 neighbors checked
 * @returns        Effective mask with irrelevant diagonals zeroed
 */
export function computeEffectiveMask(rawMask: number): number {
  let eff = rawMask & (BIT_N | BIT_E | BIT_S | BIT_W);
  if ((rawMask & BIT_NE) && (rawMask & BIT_N) && (rawMask & BIT_E)) eff |= BIT_NE;
  if ((rawMask & BIT_SE) && (rawMask & BIT_S) && (rawMask & BIT_E)) eff |= BIT_SE;
  if ((rawMask & BIT_SW) && (rawMask & BIT_S) && (rawMask & BIT_W)) eff |= BIT_SW;
  if ((rawMask & BIT_NW) && (rawMask & BIT_N) && (rawMask & BIT_W)) eff |= BIT_NW;
  return eff;
}

/**
 * Mapping from effective bitmask → {col, row} in the 8×6 Pipoya Type 3 grid.
 * Derived from pixel analysis of the Pipoya tilesheets (RPG Maker A2 layout).
 *
 * Convention: bit=1 means neighbor is SAME terrain.
 * - mask 0   = isolated (all neighbors are different terrain)
 * - mask 255 = full interior (all neighbors are same terrain)
 */
const MASK_TO_GRID: Record<number, { col: number; row: number }> = {
    0: { col: 0, row: 0 },   //  isolated
    1: { col: 4, row: 2 },   //  N only
    4: { col: 1, row: 0 },   //  E only
    5: { col: 0, row: 2 },   //  N+E
    7: { col: 5, row: 2 },   //  N+NE+E
   16: { col: 4, row: 0 },   //  S only
   17: { col: 4, row: 1 },   //  N+S
   20: { col: 0, row: 1 },   //  E+S
   21: { col: 2, row: 1 },   //  N+E+S
   23: { col: 0, row: 3 },   //  N+NE+E+S
   28: { col: 5, row: 0 },   //  E+SE+S
   29: { col: 0, row: 4 },   //  N+E+SE+S
   31: { col: 5, row: 1 },   //  N+NE+E+SE+S
   64: { col: 3, row: 0 },   //  W only
   65: { col: 1, row: 2 },   //  N+W
   68: { col: 2, row: 0 },   //  E+W
   69: { col: 2, row: 2 },   //  N+E+W
   71: { col: 3, row: 4 },   //  N+NE+E+W
   80: { col: 1, row: 1 },   //  S+W
   81: { col: 3, row: 2 },   //  N+S+W
   84: { col: 3, row: 1 },   //  E+S+W
   85: { col: 6, row: 5 },   //  N+E+S+W (four inner corners)
   87: { col: 7, row: 3 },   //  N+NE+E+S+W
   92: { col: 3, row: 3 },   //  E+SE+S+W
   93: { col: 7, row: 4 },   //  N+E+SE+S+W
   95: { col: 3, row: 5 },   //  N+NE+E+SE+S+W
  112: { col: 7, row: 0 },   //  S+SW+W
  113: { col: 1, row: 4 },   //  N+S+SW+W
  116: { col: 2, row: 3 },   //  E+S+SW+W
  117: { col: 6, row: 4 },   //  N+E+S+SW+W
  119: { col: 5, row: 5 },   //  N+NE+E+S+SW+W
  124: { col: 6, row: 0 },   //  E+SE+S+SW+W
  125: { col: 0, row: 5 },   //  N+E+SE+S+SW+W
  127: { col: 5, row: 4 },   //  N+NE+E+SE+S+SW+W
  193: { col: 7, row: 2 },   //  N+W+NW
  197: { col: 2, row: 4 },   //  N+E+W+NW
  199: { col: 6, row: 2 },   //  N+NE+E+W+NW
  209: { col: 1, row: 3 },   //  N+S+W+NW
  213: { col: 6, row: 3 },   //  N+E+S+W+NW
  215: { col: 1, row: 5 },   //  N+NE+E+S+W+NW
  221: { col: 4, row: 5 },   //  N+E+SE+S+W+NW
  223: { col: 5, row: 3 },   //  N+NE+E+SE+S+W+NW
  241: { col: 7, row: 1 },   //  N+S+SW+W+NW
  245: { col: 2, row: 5 },   //  N+E+S+SW+W+NW
  247: { col: 4, row: 3 },   //  N+NE+E+S+SW+W+NW
  253: { col: 4, row: 4 },   //  N+E+SE+S+SW+W+NW
  255: { col: 6, row: 1 },   //  full interior (all same)
};

/**
 * Get the grid position {col, row} for a given effective bitmask.
 * Falls back to the full-interior tile if the mask isn't found
 * (shouldn't happen with valid effective masks).
 */
export function maskToGrid(effectiveMask: number): { col: number; row: number } {
  return MASK_TO_GRID[effectiveMask] ?? MASK_TO_GRID[255];
}

/**
 * Build the raw 8-bit neighbor mask for a cell at (x, y).
 *
 * @param x         Cell x coordinate
 * @param y         Cell y coordinate
 * @param isSame    Predicate: is the cell at (nx, ny) the same terrain?
 *                  Out-of-bounds should return false (different terrain).
 * @returns         Raw 8-bit mask (before diagonal masking)
 */
export function buildRawMask(
  x: number,
  y: number,
  isSame: (nx: number, ny: number) => boolean,
): number {
  let mask = 0;
  if (isSame(x,     y - 1)) mask |= BIT_N;
  if (isSame(x + 1, y - 1)) mask |= BIT_NE;
  if (isSame(x + 1, y    )) mask |= BIT_E;
  if (isSame(x + 1, y + 1)) mask |= BIT_SE;
  if (isSame(x,     y + 1)) mask |= BIT_S;
  if (isSame(x - 1, y + 1)) mask |= BIT_SW;
  if (isSame(x - 1, y    )) mask |= BIT_W;
  if (isSame(x - 1, y - 1)) mask |= BIT_NW;
  return mask;
}

/**
 * Get the autotile tile ID for a cell, combining terrain prefix with grid index.
 *
 * @param prefix    Tile ID prefix (e.g. "water_at" or "sand_at")
 * @param x         Cell x coordinate
 * @param y         Cell y coordinate
 * @param isSame    Predicate: is neighbor at (nx,ny) the same terrain?
 * @returns         Tile ID like "water_at_6_1" (col_row)
 */
export function getAutotileId(
  prefix: string,
  x: number,
  y: number,
  isSame: (nx: number, ny: number) => boolean,
): string {
  const raw = buildRawMask(x, y, isSame);
  const eff = computeEffectiveMask(raw);
  const { col, row } = maskToGrid(eff);
  return `${prefix}_${col}_${row}`;
}

/**
 * Number of unique autotile configurations (48 tiles in 8×6 grid).
 */
export const AUTOTILE_COLS = 8;
export const AUTOTILE_ROWS = 6;
