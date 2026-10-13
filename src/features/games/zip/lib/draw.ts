import { cellCount, isAdjacent, numbersOf, wallKey } from "./puzzle-format";
import type { ZipPuzzle } from "./types";

/**
 * Drawing rules for Zip: what a path may do. Pure and shared by pointer and keyboard input, so every way of
 * drawing obeys the same rules.
 *
 * A path starts on checkpoint 1 and moves one orthogonal step at a time, never across a wall and never onto a cell
 * it already holds. A numbered cell can only be entered when it is the next number; the last number can only be
 * entered once every other cell is covered, because the path ends there. Dragging back onto a cell of the path
 * erases the path after it.
 */

export type StepResult = { ok: true } | { ok: false; reason: "start" | "far" | "wall" | "visited" | "order" | "last" };

/** A reusable lookup of what a puzzle's rules need (build once per puzzle, not per move). */
export interface Rules {
  puzzle: ZipPuzzle;
  walls: ReadonlySet<string>;
  /** Number of each cell (0 = none). */
  numbers: Uint8Array;
  cells: number;
  /** The highest number. */
  last: number;
}

export function rulesOf(puzzle: ZipPuzzle): Rules {
  return { puzzle, walls: new Set(puzzle.walls), numbers: numbersOf(puzzle), cells: cellCount(puzzle), last: puzzle.checkpoints.length };
}

/** The next number the path must reach, given the cells it holds. */
export function nextNumber(rules: Rules, path: readonly number[]): number {
  let reached = 0;
  for (const cell of path) if (rules.numbers[cell] > 0) reached = Math.max(reached, rules.numbers[cell]);
  return Math.min(reached + 1, rules.last + 1);
}

/** Whether the path could step from its end onto `to`. An empty path can only start on checkpoint 1. */
export function canStep(rules: Rules, path: readonly number[], to: number): StepResult {
  if (path.length === 0) return to === rules.puzzle.checkpoints[0] ? { ok: true } : { ok: false, reason: "start" };
  const head = path[path.length - 1];
  if (!isAdjacent(head, to, rules.puzzle.cols)) return { ok: false, reason: "far" };
  if (rules.walls.has(wallKey(head, to))) return { ok: false, reason: "wall" };
  if (path.includes(to)) return { ok: false, reason: "visited" };
  const number = rules.numbers[to];
  if (number > 0) {
    if (number !== nextNumber(rules, path)) return { ok: false, reason: "order" };
    if (number === rules.last && path.length !== rules.cells - 1) return { ok: false, reason: "last" };
  }
  return { ok: true };
}

/** True when the last number has not yet been reached only because cells remain: every other cell is covered. */
export const lastNumberOpen = (rules: Rules, path: readonly number[]): boolean => path.length === rules.cells - 1 && nextNumber(rules, path) === rules.last;

/** What the player sees when a step is refused. */
export function explain(reason: Exclude<StepResult, { ok: true }>["reason"], rules: Rules, path: readonly number[]): string {
  switch (reason) {
    case "start":
      return "Start on the square marked 1.";
    case "far":
      return "Move one square at a time, up, down, left or right.";
    case "wall":
      return "A wall blocks that way.";
    case "visited":
      return "That square is already on your path.";
    case "order":
      return `Reach the numbers in order: you are heading for ${nextNumber(rules, path)}.`;
    default:
      return `${rules.last} is the end of the path. It opens once every other square is filled.`;
  }
}

/**
 * Moves the path to `to`: erases back to it if it is already on the path, extends by one step if that is allowed,
 * or leaves the path as it is. Returns the same array when nothing changed.
 */
export function advance(rules: Rules, path: readonly number[], to: number): readonly number[] {
  const at = path.indexOf(to);
  if (at >= 0) return at === path.length - 1 ? path : path.slice(0, at + 1);
  return canStep(rules, path, to).ok ? [...path, to] : path;
}

/**
 * The pointer can jump over cells (a quick drag, or a corner cut diagonally). Finds the shortest legal way of
 * stepping from the path's end to `to`, up to `maxSteps` cells, and returns the extended path, or the path itself
 * when there is none. Cells already on the path are handled by `advance`.
 */
export function reach(rules: Rules, path: readonly number[], to: number, maxSteps = 4): readonly number[] {
  if (path.includes(to) || path.length === 0) return advance(rules, path, to);
  const find = (current: readonly number[], depth: number): readonly number[] | null => {
    if (canStep(rules, current, to).ok) return [...current, to];
    if (depth === 0) return null;
    const head = current[current.length - 1];
    const r = Math.floor(head / rules.puzzle.cols);
    const c = head % rules.puzzle.cols;
    // Prefer neighbours that bring the path closer to the target.
    const tr = Math.floor(to / rules.puzzle.cols);
    const tc = to % rules.puzzle.cols;
    const near = [r > 0 ? head - rules.puzzle.cols : -1, r < rules.puzzle.rows - 1 ? head + rules.puzzle.cols : -1, c > 0 ? head - 1 : -1, c < rules.puzzle.cols - 1 ? head + 1 : -1]
      .filter((n) => n >= 0 && Math.abs(Math.floor(n / rules.puzzle.cols) - tr) + Math.abs((n % rules.puzzle.cols) - tc) < Math.abs(r - tr) + Math.abs(c - tc))
      .filter((n) => canStep(rules, current, n).ok && rules.numbers[n] === 0);
    for (const n of near) {
      const found = find([...current, n], depth - 1);
      if (found) return found;
    }
    return null;
  };
  // Steps across plain cells only: a route never passes a numbered cell the player did not point at.
  return find(path, Math.max(0, maxSteps - 1)) ?? path;
}

/** Whether the path is a valid complete solution: every cell once, in order, ending on the last number. */
export function isComplete(rules: Rules, path: readonly number[]): boolean {
  if (path.length !== rules.cells) return false;
  return validatePath(rules, path);
}

/** Whether a (possibly partial) path breaks no rule from its first cell on. */
export function validatePath(rules: Rules, path: readonly number[]): boolean {
  const seen: number[] = [];
  for (const cell of path) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= rules.cells) return false;
    if (!canStep(rules, seen, cell).ok) return false;
    seen.push(cell);
  }
  return true;
}
