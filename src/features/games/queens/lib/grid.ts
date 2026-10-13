import { isQueen, type Conflict, type Mark } from "./types";

/** Board geometry for Queens. Cells are indexed row by row: index = row * n + column. */

/** What hints call the regions; the board palette (--qn-r0..8 in globals.css) uses these hues in this order. */
export const REGION_NAMES = ["red", "orange", "yellow", "green", "teal", "blue", "violet", "pink", "gray"] as const;

export const MIN_SIZE = 5;
export const MAX_SIZE = 9;

export const rowOf = (index: number, n: number): number => Math.floor(index / n);
export const colOf = (index: number, n: number): number => index % n;

/** A parsed board: its size and the region of every cell. */
export interface Board {
  n: number;
  reg: number[];
}

/** The up to eight cells that touch a cell, diagonals included. */
export function neighbors8(index: number, n: number): number[] {
  const r = rowOf(index, n);
  const c = colOf(index, n);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
  }
  return out;
}

/** The cells of each region, in index order. */
export function regionCells(reg: readonly number[], n: number): number[][] {
  const cells: number[][] = Array.from({ length: n }, () => []);
  reg.forEach((g, i) => cells[g].push(i));
  return cells;
}

/** True when every region is one connected piece (cells sharing an edge). */
function regionsConnected(reg: readonly number[], n: number): boolean {
  const groups = regionCells(reg, n);
  for (const cells of groups) {
    if (cells.length === 0) return false;
    const inRegion = new Set(cells);
    const seen = new Set<number>([cells[0]]);
    const stack = [cells[0]];
    while (stack.length > 0) {
      const at = stack.pop() as number;
      const r = rowOf(at, n);
      const c = colOf(at, n);
      for (const next of [r > 0 ? at - n : -1, r < n - 1 ? at + n : -1, c > 0 ? at - 1 : -1, c < n - 1 ? at + 1 : -1]) {
        if (next >= 0 && inRegion.has(next) && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

/** The side length for a region string, or null if its length is not n*n for a supported n. */
export function sizeOf(regions: string): number | null {
  const n = Math.round(Math.sqrt(regions.length));
  return n * n === regions.length && n >= MIN_SIZE && n <= MAX_SIZE ? n : null;
}

/**
 * A strictly validated board from an untrusted string: a supported size, region digits below n, every region
 * present and in one piece. (It does not check that there is exactly one solution; the solver does.)
 */
export function parseRegions(value: unknown): Board | null {
  if (typeof value !== "string") return null;
  const n = sizeOf(value);
  if (n === null || !/^[0-9]+$/.test(value)) return null;
  const reg = Array.from(value, Number);
  if (reg.some((g) => g >= n)) return null;
  return regionsConnected(reg, n) ? { n, reg } : null;
}

export const formatRegions = (reg: readonly number[]): string => reg.join("");

/**
 * The rules the queens on a board break. A row, column or region with two or more queens is one conflict naming
 * those queens; two queens that touch (also diagonally) are one conflict each. Cross-outs are never conflicts.
 */
export function findConflicts(cells: readonly Mark[], board: Board): Conflict[] {
  const { n, reg } = board;
  const conflicts: Conflict[] = [];
  const queens = cells.flatMap((m, i) => (isQueen(m) ? [i] : []));

  const groups = (kind: Conflict["kind"], key: (i: number) => number) => {
    const by = new Map<number, number[]>();
    for (const q of queens) by.set(key(q), [...(by.get(key(q)) ?? []), q]);
    for (const list of by.values()) if (list.length > 1) conflicts.push({ kind, cells: list });
  };
  groups("row", (i) => rowOf(i, n));
  groups("column", (i) => colOf(i, n));
  groups("region", (i) => reg[i]);

  for (const q of queens) {
    for (const other of neighbors8(q, n)) {
      if (other > q && isQueen(cells[other])) conflicts.push({ kind: "touch", cells: [q, other] });
    }
  }
  return conflicts;
}

/** The queens that are part of at least one conflict. */
export function conflictingQueens(conflicts: readonly Conflict[]): Set<number> {
  const set = new Set<number>();
  for (const c of conflicts) for (const i of c.cells) set.add(i);
  return set;
}

/** Whether `columns` (the column of the queen in each row) is a complete, rule-abiding placement on the board. */
export function isSolution(board: Board, columns: readonly number[]): boolean {
  const { n, reg } = board;
  if (columns.length !== n) return false;
  const cols = new Set<number>();
  const regions = new Set<number>();
  for (let r = 0; r < n; r++) {
    const c = columns[r];
    if (!Number.isInteger(c) || c < 0 || c >= n) return false;
    if (r > 0 && Math.abs(c - columns[r - 1]) < 2) return false;
    cols.add(c);
    regions.add(reg[r * n + c]);
  }
  return cols.size === n && regions.size === n;
}
