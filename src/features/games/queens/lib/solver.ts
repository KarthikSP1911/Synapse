import type { Board } from "./grid";

/**
 * Exhaustive search for Queens solutions, row by row with bit masks. At most nine rows and nine columns, so it
 * answers in microseconds; that is what makes "exactly one solution" cheap enough to check for every puzzle,
 * and again on the server for every upload.
 */

/** Calls `visit` with the column of the queen in each row, for each solution found; `visit` returns true to stop. */
function search(board: Board, visit: (columns: number[]) => boolean): void {
  const { n, reg } = board;
  const columns = new Array<number>(n).fill(-1);
  const place = (row: number, usedCols: number, usedRegions: number): boolean => {
    if (row === n) return visit(columns);
    const prev = row > 0 ? columns[row - 1] : -10;
    for (let c = 0; c < n; c++) {
      if (usedCols & (1 << c) || Math.abs(c - prev) < 2) continue;
      const g = reg[row * n + c];
      if (usedRegions & (1 << g)) continue;
      columns[row] = c;
      if (place(row + 1, usedCols | (1 << c), usedRegions | (1 << g))) return true;
    }
    return false;
  };
  place(0, 0, 0);
}

/** How many solutions the board has, counting no further than `limit`. 1 means the puzzle is valid. */
export function countSolutions(board: Board, limit = 2): number {
  let count = 0;
  search(board, () => ++count >= limit);
  return count;
}

/** A solution different from `known` (both as the column of the queen in each row), or null if `known` is the only one. */
export function solveOtherThan(board: Board, known: readonly number[]): number[] | null {
  let found: number[] | null = null;
  search(board, (columns) => {
    if (columns.every((c, r) => c === known[r])) return false;
    found = columns.slice();
    return true;
  });
  return found;
}

/** The first solution found, as the column of the queen in each row, or null. */
export function solve(board: Board): number[] | null {
  let found: number[] | null = null;
  search(board, (columns) => {
    found = columns.slice();
    return true;
  });
  return found;
}
