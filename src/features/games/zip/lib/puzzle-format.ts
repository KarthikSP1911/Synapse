import type { ZipPuzzle } from "./types";

/**
 * The text form of a Zip puzzle, which is what is stored and uploaded: `5x5;c:0,12,24;w:3-4,10-15`
 * (rows x columns; the cells of checkpoints 1, 2, 3 ... in order; walls as "a-b" pairs of neighbouring cells).
 * A puzzle with no walls ends in `w:`. Parsing is strict: anything else is not a puzzle.
 */

export const MIN_SIDE = 3;
export const MAX_SIDE = 8;
/** The largest board the server will verify. */
export const MAX_CELLS = 64;
export const MAX_WALLS = 40;

const FORMAT = /^(\d{1,2})x(\d{1,2});c:(\d{1,2}(?:,\d{1,2})*);w:(\d{1,2}-\d{1,2}(?:,\d{1,2}-\d{1,2})*)?$/;

/** The key of the wall between two neighbouring cells, whichever way round they are given. */
export const wallKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

export const cellCount = (p: Pick<ZipPuzzle, "rows" | "cols">): number => p.rows * p.cols;

/** Whether two cells share an edge. */
export function isAdjacent(a: number, b: number, cols: number): boolean {
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  const dc = Math.abs((a % cols) - (b % cols));
  return dr + dc === 1;
}

export function formatPuzzle(p: ZipPuzzle): string {
  const walls = [...p.walls].sort((x, y) => {
    const [xa, xb] = x.split("-").map(Number);
    const [ya, yb] = y.split("-").map(Number);
    return xa - ya || xb - yb;
  });
  return `${p.rows}x${p.cols};c:${p.checkpoints.join(",")};w:${walls.join(",")}`;
}

/** A strictly validated puzzle from untrusted text, or null. (It does not check that there is exactly one solution.) */
export function parsePuzzle(value: unknown): ZipPuzzle | null {
  if (typeof value !== "string" || value.length > 512) return null;
  const match = FORMAT.exec(value);
  if (!match) return null;
  const rows = Number(match[1]);
  const cols = Number(match[2]);
  if (rows < MIN_SIDE || rows > MAX_SIDE || cols < MIN_SIDE || cols > MAX_SIDE) return null;
  const cells = rows * cols;
  const checkpoints = match[3].split(",").map(Number);
  if (checkpoints.length < 2 || checkpoints.length > cells || checkpoints.some((c) => c >= cells)) return null;
  if (new Set(checkpoints).size !== checkpoints.length) return null;
  const walls: string[] = [];
  if (match[4]) {
    for (const key of match[4].split(",")) {
      const [a, b] = key.split("-").map(Number);
      if (a >= b || b >= cells || !isAdjacent(a, b, cols)) return null;
      walls.push(key);
    }
    if (new Set(walls).size !== walls.length || walls.length > MAX_WALLS) return null;
  }
  // Written as formatPuzzle writes it, so a puzzle has one text form.
  const puzzle = { rows, cols, checkpoints, walls };
  return formatPuzzle(puzzle) === value ? puzzle : null;
}

/** The numbered cells as a lookup: cell -> its number (1-based), or 0 for a plain cell. */
export function numbersOf(p: ZipPuzzle): Uint8Array {
  const numbers = new Uint8Array(cellCount(p));
  p.checkpoints.forEach((cell, i) => {
    numbers[cell] = i + 1;
  });
  return numbers;
}

/** The up to four neighbouring cells a path could step to from `cell`, walls excluded. */
export function openNeighbors(p: ZipPuzzle, cell: number, walls: ReadonlySet<string> = new Set(p.walls)): number[] {
  const r = Math.floor(cell / p.cols);
  const c = cell % p.cols;
  const out: number[] = [];
  if (r > 0) out.push(cell - p.cols);
  if (c > 0) out.push(cell - 1);
  if (c < p.cols - 1) out.push(cell + 1);
  if (r < p.rows - 1) out.push(cell + p.cols);
  return out.filter((n) => !walls.has(wallKey(cell, n)));
}
