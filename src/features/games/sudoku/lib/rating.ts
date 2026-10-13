import { ALL_DIGITS, BOX_UNITS, COL_UNITS, PEERS, POPCOUNT, ROW_UNITS, UNITS, bit, candidatesOf, digitOf } from "./grid";
import { CELLS, SIZE, type Difficulty } from "./types";

/**
 * Grades a puzzle the way a person would solve it: by applying named techniques, always the simplest one that
 * makes progress, and noting the hardest one that was needed. This (not the number of empty cells) decides which
 * difficulty a puzzle belongs to.
 *
 *   easy    singles only: a cell with one candidate left, or a digit with one place left in a row, column or box
 *   medium  also locked candidates (pointing / claiming), naked pairs and hidden pairs
 *   hard    also naked and hidden triples, X-Wing and XY-Wing
 *   expert  these techniques run out: the puzzle needs deeper chains or trial and error
 */

export const TECHNIQUES = ["naked-single", "hidden-single", "locked-candidates", "naked-pair", "hidden-pair", "naked-triple", "hidden-triple", "x-wing", "xy-wing"] as const;
export type Technique = (typeof TECHNIQUES)[number];

/** 1 = easy, 2 = medium, 3 = hard. */
export const TECHNIQUE_LEVEL: Record<Technique, 1 | 2 | 3> = {
  "naked-single": 1,
  "hidden-single": 1,
  "locked-candidates": 2,
  "naked-pair": 2,
  "hidden-pair": 2,
  "naked-triple": 3,
  "hidden-triple": 3,
  "x-wing": 3,
  "xy-wing": 3,
};

export const LEVEL_DIFFICULTY: Record<1 | 2 | 3, Difficulty> = { 1: "easy", 2: "medium", 3: "hard" };

export interface Rating {
  /** Whether the listed techniques alone completed the grid. */
  solved: boolean;
  /** The grid contradicts itself (an empty cell with no candidate left); never the case for a valid puzzle. */
  invalid: boolean;
  difficulty: Difficulty;
  /** Every technique that was needed at least once. */
  techniques: Technique[];
}

class Board {
  readonly v: number[];
  /** Candidate mask per empty cell (0 for a filled one). */
  readonly c: number[];

  constructor(values: readonly number[]) {
    this.v = [...values];
    this.c = this.v.map((d, i) => (d === 0 ? candidatesOf(this.v, i) : 0));
  }

  place(i: number, d: number): void {
    this.v[i] = d;
    this.c[i] = 0;
    for (const p of PEERS[i]) this.c[p] &= ~bit(d);
  }

  /** Removes the digits in `mask` from a cell's candidates; true if that changed anything. */
  eliminate(i: number, mask: number): boolean {
    if ((this.c[i] & mask) === 0) return false;
    this.c[i] &= ~mask;
    return true;
  }

  get solved(): boolean {
    return this.v.every((d) => d !== 0);
  }

  get invalid(): boolean {
    return this.v.some((d, i) => d === 0 && this.c[i] === 0);
  }
}

// ---------------------------------------------------------------------------
// Techniques. Each returns true if it changed the board.
// ---------------------------------------------------------------------------

function nakedSingle(b: Board): boolean {
  let progress = false;
  for (let i = 0; i < CELLS; i++) {
    if (b.v[i] === 0 && POPCOUNT[b.c[i]] === 1) {
      b.place(i, digitOf(b.c[i]));
      progress = true;
    }
  }
  return progress;
}

function hiddenSingle(b: Board): boolean {
  let progress = false;
  for (const unit of UNITS) {
    for (let d = 1; d <= SIZE; d++) {
      let only = -1;
      let count = 0;
      for (const i of unit) {
        if (b.v[i] === 0 && b.c[i] & bit(d)) {
          only = i;
          count++;
        }
      }
      if (count === 1) {
        b.place(only, d);
        progress = true;
      }
    }
  }
  return progress;
}

/** Pointing (a box's candidates for a digit sit in one line) and claiming (a line's sit in one box). */
function lockedCandidates(b: Board): boolean {
  let progress = false;
  for (let d = 1; d <= SIZE; d++) {
    const m = bit(d);
    for (const box of BOX_UNITS) {
      const cells = box.filter((i) => b.c[i] & m);
      if (cells.length < 2) continue;
      for (const lines of [ROW_UNITS, COL_UNITS]) {
        const line = lines.find((l) => cells.every((i) => l.includes(i)));
        if (!line) continue;
        for (const i of line) if (!box.includes(i) && b.eliminate(i, m)) progress = true;
      }
    }
    for (const lines of [ROW_UNITS, COL_UNITS]) {
      for (const line of lines) {
        const cells = line.filter((i) => b.c[i] & m);
        if (cells.length < 2) continue;
        const box = BOX_UNITS.find((x) => cells.every((i) => x.includes(i)));
        if (!box) continue;
        for (const i of box) if (!line.includes(i) && b.eliminate(i, m)) progress = true;
      }
    }
  }
  return progress;
}

/** n cells of a unit that between them hold only n digits: those digits cannot go anywhere else in the unit. */
function nakedSubset(b: Board, n: number): boolean {
  let progress = false;
  for (const unit of UNITS) {
    const cells = unit.filter((i) => b.v[i] === 0 && POPCOUNT[b.c[i]] >= 2 && POPCOUNT[b.c[i]] <= n);
    const walk = (start: number, chosen: number[], union: number): void => {
      if (chosen.length === n) {
        if (POPCOUNT[union] !== n) return;
        for (const i of unit) if (b.v[i] === 0 && !chosen.includes(i) && b.eliminate(i, union)) progress = true;
        return;
      }
      for (let k = start; k < cells.length; k++) {
        const merged = union | b.c[cells[k]];
        if (POPCOUNT[merged] <= n) walk(k + 1, [...chosen, cells[k]], merged);
      }
    };
    walk(0, [], 0);
  }
  return progress;
}

/** n digits of a unit that fit in only n cells: those cells can hold nothing else. */
function hiddenSubset(b: Board, n: number): boolean {
  let progress = false;
  for (const unit of UNITS) {
    const where: number[] = [];
    for (let d = 1; d <= SIZE; d++) {
      let mask = 0;
      unit.forEach((i, k) => {
        if (b.v[i] === 0 && b.c[i] & bit(d)) mask |= 1 << k;
      });
      where[d] = mask;
    }
    const digits: number[] = [];
    for (let d = 1; d <= SIZE; d++) if (POPCOUNT[where[d]] >= 2 && POPCOUNT[where[d]] <= n) digits.push(d);
    const walk = (start: number, chosen: number[], union: number): void => {
      if (chosen.length === n) {
        if (POPCOUNT[union] !== n) return;
        const keep = chosen.reduce((acc, d) => acc | bit(d), 0);
        unit.forEach((i, k) => {
          if (union & (1 << k) && b.eliminate(i, ALL_DIGITS & ~keep)) progress = true;
        });
        return;
      }
      for (let k = start; k < digits.length; k++) {
        const merged = union | where[digits[k]];
        if (POPCOUNT[merged] <= n) walk(k + 1, [...chosen, digits[k]], merged);
      }
    };
    walk(0, [], 0);
  }
  return progress;
}

/**
 * A digit with exactly two places in each of two lines, both in the same two crossing lines, fills one diagonal of
 * that rectangle: it is cleared from the rest of the crossing lines. Works for rows and for columns.
 */
function xWing(b: Board): boolean {
  let progress = false;
  for (let d = 1; d <= SIZE; d++) {
    const m = bit(d);
    for (const [bases, covers] of [
      [ROW_UNITS, COL_UNITS],
      [COL_UNITS, ROW_UNITS],
    ] as const) {
      // For each base line, which cover lines (by position 0-8) still allow the digit.
      const spots = bases.map((line) => line.reduce((acc, i, k) => (b.c[i] & m ? acc | (1 << k) : acc), 0));
      for (let x = 0; x < SIZE; x++) {
        if (POPCOUNT[spots[x]] !== 2) continue;
        for (let y = x + 1; y < SIZE; y++) {
          if (spots[y] !== spots[x]) continue;
          for (let k = 0; k < SIZE; k++) {
            if (!(spots[x] & (1 << k))) continue;
            for (const i of covers[k]) if (!bases[x].includes(i) && !bases[y].includes(i) && b.eliminate(i, m)) progress = true;
          }
        }
      }
    }
  }
  return progress;
}

/** A cell {A,B} that sees a cell {A,C} and a cell {B,C}: whichever way it falls, C is gone from every cell seeing both of those. */
function xyWing(b: Board): boolean {
  let progress = false;
  for (let pivot = 0; pivot < CELLS; pivot++) {
    if (b.v[pivot] !== 0 || POPCOUNT[b.c[pivot]] !== 2) continue;
    const pairs = PEERS[pivot].filter((p) => b.v[p] === 0 && POPCOUNT[b.c[p]] === 2);
    for (const p1 of pairs) {
      const shared = b.c[p1] & b.c[pivot];
      if (POPCOUNT[shared] !== 1) continue;
      const c = b.c[p1] & ~b.c[pivot];
      const other = b.c[pivot] & ~shared;
      for (const p2 of pairs) {
        if (p2 === p1 || b.c[p2] !== (other | c)) continue;
        for (const i of PEERS[p1]) if (i !== pivot && i !== p2 && b.v[i] === 0 && PEERS[p2].includes(i) && b.eliminate(i, c)) progress = true;
      }
    }
  }
  return progress;
}

const STEPS: { name: Technique; apply: (b: Board) => boolean }[] = [
  { name: "naked-single", apply: nakedSingle },
  { name: "hidden-single", apply: hiddenSingle },
  { name: "locked-candidates", apply: lockedCandidates },
  { name: "naked-pair", apply: (b) => nakedSubset(b, 2) },
  { name: "hidden-pair", apply: (b) => hiddenSubset(b, 2) },
  { name: "naked-triple", apply: (b) => nakedSubset(b, 3) },
  { name: "hidden-triple", apply: (b) => hiddenSubset(b, 3) },
  { name: "x-wing", apply: xWing },
  { name: "xy-wing", apply: xyWing },
];

/**
 * Grades a puzzle. `maxLevel` stops early (and reports "expert") as soon as a technique above that level would be
 * needed, which is all the generator wants to know and is cheaper than solving to the end.
 */
export function ratePuzzle(values: readonly number[], maxLevel: 1 | 2 | 3 = 3): Rating {
  const board = new Board(values);
  const used = new Set<Technique>();
  let level = 1;

  while (!board.solved && !board.invalid) {
    const step = STEPS.find((s) => TECHNIQUE_LEVEL[s.name] <= maxLevel && s.apply(board));
    if (!step) break;
    used.add(step.name);
    level = Math.max(level, TECHNIQUE_LEVEL[step.name]);
  }

  const solved = board.solved;
  return {
    solved,
    invalid: board.invalid,
    difficulty: solved ? LEVEL_DIFFICULTY[level as 1 | 2 | 3] : "expert",
    techniques: TECHNIQUES.filter((t) => used.has(t)),
  };
}
