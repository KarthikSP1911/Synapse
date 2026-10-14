import type { Clue, Shape } from "./types";

/**
 * The geometry of patches: what a set of cells looks like and whether it meets a clue. These few functions are the
 * only definition of "this shape is allowed", used by the solver, the drawing rules, the board check and the tests,
 * so they cannot drift apart. Cells are indices (row * cols + column).
 */

export interface Box {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
  /** Height and width in cells. */
  h: number;
  w: number;
}

export function boundingBox(cells: readonly number[], cols: number): Box {
  let r0 = Infinity;
  let c0 = Infinity;
  let r1 = -Infinity;
  let c1 = -Infinity;
  for (const cell of cells) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if (c < c0) c0 = c;
    if (c > c1) c1 = c;
  }
  return { r0, c0, r1, c1, h: r1 - r0 + 1, w: c1 - c0 + 1 };
}

/** Every cell of the rectangle between two corner cells, in index order. */
export function rectangleBetween(a: number, b: number, cols: number): number[] {
  const r0 = Math.min(Math.floor(a / cols), Math.floor(b / cols));
  const r1 = Math.max(Math.floor(a / cols), Math.floor(b / cols));
  const c0 = Math.min(a % cols, b % cols);
  const c1 = Math.max(a % cols, b % cols);
  const cells: number[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push(r * cols + c);
  return cells;
}

/** The cells (distinct) form a full rectangle. */
export function isRectangle(cells: readonly number[], cols: number): boolean {
  if (cells.length === 0) return false;
  const box = boundingBox(cells, cols);
  return new Set(cells).size === box.h * box.w && cells.length === box.h * box.w;
}

/** The cells are one piece, joined along edges (touching only at a corner does not count). */
export function isConnected(cells: readonly number[], cols: number): boolean {
  if (cells.length === 0) return false;
  const inSet = new Set(cells);
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  while (stack.length > 0) {
    const cell = stack.pop()!;
    const c = cell % cols;
    const next = [cell - cols, cell + cols, c > 0 ? cell - 1 : -1, c < cols - 1 ? cell + 1 : -1];
    for (const m of next) {
      if (m >= 0 && inSet.has(m) && !seen.has(m)) {
        seen.add(m);
        stack.push(m);
      }
    }
  }
  return seen.size === inSet.size;
}

/** The category of a set of cells: a rectangle is square, wide or tall; anything else is freeform. */
export function shapeOf(cells: readonly number[], cols: number): Shape {
  if (!isRectangle(cells, cols)) return "free";
  const { h, w } = boundingBox(cells, cols);
  return h === w ? "square" : w > h ? "wide" : "tall";
}

/** Whether the cells have the shape a clue asks for (`null`: any rectangle). Assumes the cells are connected. */
export function fitsShape(shape: Shape | null, cells: readonly number[], cols: number): boolean {
  if (shape === "free") return true;
  if (!isRectangle(cells, cols)) return false;
  return shape === null || shapeOf(cells, cols) === shape;
}

/** Whether a connected set of cells meets the clue's area and shape. Where the clue sits, and other clues, are not its business. */
export function fitsClue(clue: Pick<Clue, "area" | "shape">, cells: readonly number[], cols: number): boolean {
  if (clue.area !== null && cells.length !== clue.area) return false;
  return fitsShape(clue.shape, cells, cols);
}
