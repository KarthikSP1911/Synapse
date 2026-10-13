import { CELLS, SIZE } from "./types";

/** Geometry of the board and the plain rules of Sudoku. Nothing here knows about a game in progress. */

export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;
export const boxOf = (i: number): number => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** Bit for digit d (1-9) in a candidate or notes mask. */
export const bit = (d: number): number => 1 << (d - 1);
export const ALL_DIGITS = 0b111111111;

export const POPCOUNT: readonly number[] = Array.from({ length: 512 }, (_, n) => {
  let count = 0;
  for (let m = n; m; m &= m - 1) count++;
  return count;
});

/** The digit of a mask that has exactly one bit set. */
export const digitOf = (mask: number): number => 32 - Math.clz32(mask);

/** 9 rows, then 9 columns, then 9 boxes; each a list of 9 cell indices. */
export const UNITS: readonly (readonly number[])[] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < SIZE; r++) units.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) units.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  for (let b = 0; b < SIZE; b++) {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    units.push(Array.from({ length: SIZE }, (_, k) => (r0 + Math.floor(k / 3)) * SIZE + c0 + (k % 3)));
  }
  return units;
})();

export const ROW_UNITS = UNITS.slice(0, 9);
export const COL_UNITS = UNITS.slice(9, 18);
export const BOX_UNITS = UNITS.slice(18, 27);

/** The 20 cells that share a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELLS }, (_, i) => {
  const set = new Set<number>();
  for (const unit of [ROW_UNITS[rowOf(i)], COL_UNITS[colOf(i)], BOX_UNITS[boxOf(i)]]) for (const p of unit) if (p !== i) set.add(p);
  return [...set].sort((a, b) => a - b);
});

/** Parses 81 characters ("0" or "." for empty) into numbers, or returns null if the text is not a grid. */
export function parseGrid(text: unknown): number[] | null {
  if (typeof text !== "string" || text.length !== CELLS) return null;
  const out: number[] = [];
  for (const ch of text) {
    if (ch === "." || ch === "0") out.push(0);
    else if (ch >= "1" && ch <= "9") out.push(ch.charCodeAt(0) - 48);
    else return null;
  }
  return out;
}

export const formatGrid = (values: readonly number[]): string => values.join("");

/** Cells whose digit also appears in one of their peers. Empty cells are never in conflict. */
export function findConflicts(values: readonly number[]): boolean[] {
  const conflicts = new Array<boolean>(CELLS).fill(false);
  for (const unit of UNITS) {
    const seen = new Map<number, number>();
    for (const i of unit) {
      const d = values[i];
      if (d === 0) continue;
      const first = seen.get(d);
      if (first === undefined) seen.set(d, i);
      else conflicts[first] = conflicts[i] = true;
    }
  }
  return conflicts;
}

export const hasConflict = (values: readonly number[]): boolean => findConflicts(values).some(Boolean);

/** Every cell filled and every row, column and box holding each digit exactly once. */
export function isSolved(values: readonly number[]): boolean {
  if (values.length !== CELLS) return false;
  for (const unit of UNITS) {
    let seen = 0;
    for (const i of unit) {
      const d = values[i];
      if (!Number.isInteger(d) || d < 1 || d > SIZE) return false;
      seen |= bit(d);
    }
    if (seen !== ALL_DIGITS) return false;
  }
  return true;
}

/** Digits that could go in a cell given the digits currently on the board (ignores whether they are right). */
export function candidatesOf(values: readonly number[], i: number): number {
  let used = 0;
  for (const p of PEERS[i]) if (values[p]) used |= bit(values[p]);
  return ALL_DIGITS & ~used;
}
