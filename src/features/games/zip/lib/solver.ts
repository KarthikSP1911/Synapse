import { cellCount, numbersOf, openNeighbors } from "./puzzle-format";
import type { ZipPuzzle } from "./types";

/**
 * Exhaustive search for Zip solutions: depth-first from checkpoint 1, with the same movement rules as the game
 * (see draw.ts). The search is deterministic (no randomness, a fixed move order), so a puzzle always costs the same
 * number of nodes, and a budget of nodes bounds the work. Three prunings keep it fast on 8 x 8 boards:
 *
 *   - every uncovered cell must keep two ways in and out (one for the end cell);
 *   - the uncovered cells must form one connected area;
 *   - squares alternate colours like a chessboard, so the uncovered cells must have exactly the colour counts
 *     (and the end cell the colour) that a path through all of them would use.
 *
 * `exceeded` means the budget ran out: the counts are then not proof of anything and the puzzle is "unverified".
 * Generation discards such puzzles and the server rejects them, so every accepted puzzle costs at most the budget.
 * The inner loops avoid allocation on purpose: the search runs in the browser while a puzzle is being built.
 */

/** The most nodes a search may visit. Part of what makes a puzzle valid: do not lower it without regenerating. */
export const NODE_BUDGET = 50_000;

export interface SolveResult {
  /** Solutions found, up to the limit. */
  count: number;
  exceeded: boolean;
  first: number[] | null;
  second: number[] | null;
  nodes: number;
}

export function solvePuzzle(puzzle: ZipPuzzle, { limit = 2, budget = NODE_BUDGET }: { limit?: number; budget?: number } = {}): SolveResult {
  const n = cellCount(puzzle);
  const walls = new Set(puzzle.walls);
  const adj = Array.from({ length: n }, (_, c) => Int16Array.from(openNeighbors(puzzle, c, walls)));
  const numbers = numbersOf(puzzle);
  const last = puzzle.checkpoints.length;
  const endCell = puzzle.checkpoints[last - 1];
  const color = new Uint8Array(n);
  for (let c = 0; c < n; c++) color[c] = (Math.floor(c / puzzle.cols) + (c % puzzle.cols)) & 1;

  const visited = new Uint8Array(n);
  const path = new Int16Array(n);
  let length = 0;
  const found: number[][] = [];
  let nodes = 0;
  let exceeded = false;

  // Scratch space for the connectivity check, reused by every node.
  const seen = new Uint32Array(n);
  let stamp = 0;
  const stack = new Int16Array(n);

  /** Prunes: false when no path can cover the uncovered cells from `head`. */
  const feasible = (head: number, uncovered: number): boolean => {
    if (uncovered === 0) return true;
    let colorZero = 0;
    for (let c = 0; c < n; c++) {
      if (visited[c] === 1) continue;
      if (color[c] === 0) colorZero++;
      const list = adj[c];
      let ways = 0;
      for (let k = 0; k < list.length; k++) {
        const m = list[k];
        if (visited[m] === 0 || m === head) ways++;
      }
      if (ways < (c === endCell ? 1 : 2) && !(ways === 1 && uncovered === 1)) return false;
    }
    // Colour counts: the next cell has the colour opposite to the head, then they alternate.
    const next = color[head] ^ 1;
    const nextCount = (uncovered + 1) >> 1;
    if (colorZero !== (next === 0 ? nextCount : uncovered - nextCount)) return false;
    if (visited[endCell] === 0 && color[endCell] !== (uncovered & 1 ? next : color[head])) return false;
    // Connectivity from the head through uncovered cells.
    stamp++;
    seen[head] = stamp;
    let top = 0;
    stack[top++] = head;
    let reached = 0;
    while (top > 0) {
      const list = adj[stack[--top]];
      for (let k = 0; k < list.length; k++) {
        const m = list[k];
        if (visited[m] === 1 || seen[m] === stamp) continue;
        seen[m] = stamp;
        reached++;
        stack[top++] = m;
      }
    }
    return reached === uncovered;
  };

  const dfs = (head: number, reachedNumber: number): boolean => {
    if (++nodes > budget) {
      exceeded = true;
      return true;
    }
    if (length === n) {
      found.push(Array.from(path));
      return found.length >= limit;
    }
    // Candidate moves in a fixed order: fewest onward moves first (Warnsdorff), ties by cell index.
    const list = adj[head];
    const cells: number[] = [];
    const onward: number[] = [];
    for (let k = 0; k < list.length; k++) {
      const m = list[k];
      if (visited[m] === 1) continue;
      const number = numbers[m];
      if (number > 0 && (number !== reachedNumber + 1 || (number === last && length !== n - 1))) continue;
      let free = 0;
      const around = adj[m];
      for (let j = 0; j < around.length; j++) if (visited[around[j]] === 0) free++;
      // Insertion sort into place: at most four candidates.
      let at = cells.length;
      while (at > 0 && (onward[at - 1] > free || (onward[at - 1] === free && cells[at - 1] > m))) at--;
      cells.splice(at, 0, m);
      onward.splice(at, 0, free);
    }
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      visited[cell] = 1;
      path[length++] = cell;
      const reached = numbers[cell] > 0 ? numbers[cell] : reachedNumber;
      if (feasible(cell, n - length) && dfs(cell, reached)) return true;
      length--;
      visited[cell] = 0;
    }
    return false;
  };

  const start = puzzle.checkpoints[0];
  visited[start] = 1;
  path[length++] = start;
  if (feasible(start, n - 1)) dfs(start, 1);

  return { count: found.length, exceeded, first: found[0] ?? null, second: found[1] ?? null, nodes };
}

/** True when the puzzle has exactly one solution and the search finished within the budget. */
export function hasUniqueSolution(puzzle: ZipPuzzle, budget = NODE_BUDGET): boolean {
  const result = solvePuzzle(puzzle, { budget });
  return !result.exceeded && result.count === 1;
}
