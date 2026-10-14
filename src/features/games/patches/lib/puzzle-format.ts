import type { Clue, PatchesPuzzle, Shape } from "./types";

/**
 * The text form of a Patches puzzle, which is what is stored and uploaded: `6x6;0:4s,9,14:6w,20:5f`
 * (rows x columns; then the clues in cell order). A clue is its cell, then optionally `:` and its area, then
 * optionally a letter for its shape: s square, w wide, t tall, f freeform. `9` is a clue that says nothing about
 * size or shape. Parsing is strict: anything else is not a puzzle, and a puzzle has exactly one text form.
 */

export const MIN_SIDE = 3;
export const MAX_SIDE = 10;
export const MAX_CELLS = MAX_SIDE * MAX_SIDE;
/** A freeform clue always shows its area, between these. Larger shapes would make the solver's job unbounded. */
export const MIN_FREE_AREA = 3;
export const MAX_FREE_AREA = 8;

const LETTER: Record<Shape, string> = { square: "s", wide: "w", tall: "t", free: "f" };
const SHAPE_OF = Object.fromEntries(Object.entries(LETTER).map(([shape, letter]) => [letter, shape])) as Record<string, Shape>;

const TOKEN = /^(\d{1,3})(?::(\d{1,3}))?([swtf])?$/;
const HEAD = /^(\d{1,2})x(\d{1,2});(.+)$/;

export const cellCount = (p: Pick<PatchesPuzzle, "rows" | "cols">): number => p.rows * p.cols;

export function formatClue(clue: Clue): string {
  return `${clue.cell}${clue.area === null ? "" : `:${clue.area}`}${clue.shape === null ? "" : LETTER[clue.shape]}`;
}

export function formatPuzzle(p: PatchesPuzzle): string {
  const clues = [...p.clues].sort((a, b) => a.cell - b.cell);
  return `${p.rows}x${p.cols};${clues.map(formatClue).join(",")}`;
}

/** Whether `area` cells can make a square / wide / tall rectangle on a board of this size. */
function rectangleFits(shape: "square" | "wide" | "tall" | null, area: number, rows: number, cols: number): boolean {
  for (let h = 1; h <= rows; h++) {
    if (area % h !== 0) continue;
    const w = area / h;
    if (w > cols) continue;
    if (shape === null || (shape === "square" && h === w) || (shape === "wide" && w > h) || (shape === "tall" && h > w)) return true;
  }
  return false;
}

/** A strictly validated puzzle from untrusted text, or null. (It does not check that there is exactly one solution.) */
export function parsePuzzle(value: unknown): PatchesPuzzle | null {
  if (typeof value !== "string" || value.length > 600) return null;
  const head = HEAD.exec(value);
  if (!head) return null;
  const rows = Number(head[1]);
  const cols = Number(head[2]);
  if (rows < MIN_SIDE || rows > MAX_SIDE || cols < MIN_SIDE || cols > MAX_SIDE) return null;
  const cells = rows * cols;

  const clues: Clue[] = [];
  for (const token of head[3].split(",")) {
    const m = TOKEN.exec(token);
    if (!m) return null;
    const cell = Number(m[1]);
    const area = m[2] === undefined ? null : Number(m[2]);
    const shape = m[3] === undefined ? null : SHAPE_OF[m[3]];
    if (cell >= cells) return null;
    if (area !== null && (area < 1 || area > cells)) return null;
    if (shape === "free" && (area === null || area < MIN_FREE_AREA || area > MAX_FREE_AREA)) return null;
    // A square, wide or tall rectangle (or any rectangle) must exist with that area on this board, or the clue could never be met.
    if (area !== null && shape !== "free" && !rectangleFits(shape, area, rows, cols)) return null;
    clues.push({ cell, area, shape });
  }
  if (clues.length < 1 || clues.length > cells) return null;
  for (let i = 1; i < clues.length; i++) if (clues[i].cell <= clues[i - 1].cell) return null;
  let total = 0;
  for (const clue of clues) total += clue.area ?? 1;
  if (total > cells) return null;

  const puzzle = { rows, cols, clues };
  // Written as formatPuzzle writes it, so a puzzle has one text form.
  return formatPuzzle(puzzle) === value ? puzzle : null;
}

/** For every cell, the index of the clue on it, or -1. */
export function clueIndexByCell(p: PatchesPuzzle): Int16Array {
  const at = new Int16Array(cellCount(p)).fill(-1);
  p.clues.forEach((clue, i) => {
    at[clue.cell] = i;
  });
  return at;
}

/** "row 3, column 4" (1-based), as the game says it aloud. */
export const placeName = (cell: number, cols: number): string => `row ${Math.floor(cell / cols) + 1}, column ${(cell % cols) + 1}`;

/** What a clue says, in words: "area 6, wide rectangle". */
export function describeClue(clue: Clue): string {
  const area = clue.area === null ? null : `${clue.area} ${clue.area === 1 ? "cell" : "cells"}`;
  const shape =
    clue.shape === "square" ? "a square" : clue.shape === "wide" ? "a wide rectangle" : clue.shape === "tall" ? "a tall rectangle" : clue.shape === "free" ? "a freeform shape" : null;
  if (area && shape) return `${area}, ${shape}`;
  return area ?? shape ?? "any rectangle";
}
