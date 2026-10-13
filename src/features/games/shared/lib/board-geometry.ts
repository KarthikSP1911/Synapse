/**
 * Turning pointer positions into cells on a grid board (Zip draws with it; Queens marks cells by dragging). Pure, so the tricky parts (cutting a corner, a fast drag that skips
 * cells) are tested without a browser.
 */

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
  rows: number;
  cols: number;
}

/**
 * The share of a cell, around its centre, in which a pointer counts as being on that cell. The rim between cells
 * belongs to neither, so a finger sliding diagonally past a corner does not touch the cells beside the diagonal.
 */
export const CELL_CORE = 0.7;

/** The cell under a point, or null when the point is outside the board or in the rim between cells. */
export function pointToCell(rect: BoardRect, x: number, y: number, core = CELL_CORE): number | null {
  const cw = rect.width / rect.cols;
  const ch = rect.height / rect.rows;
  const fx = (x - rect.left) / cw;
  const fy = (y - rect.top) / ch;
  if (fx < 0 || fy < 0 || fx >= rect.cols || fy >= rect.rows) return null;
  const col = Math.floor(fx);
  const row = Math.floor(fy);
  const margin = (1 - core) / 2;
  const inX = fx - col;
  const inY = fy - row;
  if (inX < margin || inX > 1 - margin || inY < margin || inY > 1 - margin) return null;
  return row * rect.cols + col;
}

/**
 * Points along the straight line from one position to another, at most a quarter of a cell apart, ending on the
 * last one. A fast drag delivers few pointer events, so each is expanded into these and none of the cells in
 * between is missed.
 */
export function samplePoints(rect: BoardRect, from: readonly [number, number], to: readonly [number, number]): [number, number][] {
  const step = Math.min(rect.width / rect.cols, rect.height / rect.rows) / 4;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
  const points: [number, number][] = [];
  for (let i = 1; i <= count; i++) points.push([from[0] + (dx * i) / count, from[1] + (dy * i) / count]);
  return points;
}

/** The distinct cells a drag from one position to another passes through, in order. */
export function cellsAlong(rect: BoardRect, from: readonly [number, number], to: readonly [number, number]): number[] {
  const cells: number[] = [];
  for (const [x, y] of samplePoints(rect, from, to)) {
    const cell = pointToCell(rect, x, y);
    if (cell !== null && cells[cells.length - 1] !== cell) cells.push(cell);
  }
  return cells;
}
