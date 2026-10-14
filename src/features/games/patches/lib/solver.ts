import { cellCount } from "./puzzle-format";
import type { Clue, Patch, PatchesPuzzle } from "./types";

/**
 * Finding every way to divide a Patches board. The problem is an exact cover: each clue has a list of candidate
 * patches (sets of cells that contain it, no other clue, and fit what it says), and a solution picks one candidate
 * per clue so that every cell is covered exactly once.
 *
 * Search with propagation, all on bit masks:
 *   - a candidate that overlaps a cell already covered is dropped;
 *   - a clue left with one candidate is placed (a "clue single");
 *   - a cell that only one candidate can still cover forces that candidate (a "cell single");
 *   - a clue with no candidate, or a cell nothing can cover, is a dead end;
 *   - when nothing is forced, the clue with the fewest candidates is branched on.
 *
 * Counting stops at `limit` (2 tells a unique puzzle from an ambiguous one). The search is deterministic and its
 * work is bounded by a budget of nodes (one per propagation), so a puzzle always costs the same and the interface
 * cannot hang. `exceeded` means a bound was hit: the counts then prove nothing and the puzzle is "unverified".
 * Generation discards such puzzles and the server rejects them.
 */

/** The most nodes a verification may use. Part of what makes a puzzle valid: do not lower it without regenerating. */
export const NODE_BUDGET = 20_000;
/** The most candidate patches a puzzle may have in total (freeform shapes are the ones that multiply). */
export const MAX_CANDIDATES = 40_000;

export interface Candidate {
  /** Sorted cell indices. */
  cells: number[];
  mask: Int32Array;
}

export interface Model {
  puzzle: PatchesPuzzle;
  n: number;
  words: number;
  /** A mask with a bit for every cell of the board. */
  full: Int32Array;
  /** `cands[i]` are the candidate patches of clue i. */
  cands: Candidate[][];
}

const wordsFor = (n: number): number => (n + 31) >>> 5;

export function maskOf(cells: readonly number[], words: number): Int32Array {
  const mask = new Int32Array(words);
  for (const cell of cells) mask[cell >>> 5] |= 1 << (cell & 31);
  return mask;
}

/** Every rectangle through the clue's cell that holds no other clue and has the clue's area and proportions. */
function rectangles(puzzle: PatchesPuzzle, index: number, clueCount: Int32Array, emit: (cells: number[]) => boolean): boolean {
  const { rows, cols } = puzzle;
  const clue = puzzle.clues[index];
  const r = Math.floor(clue.cell / cols);
  const c = clue.cell % cols;
  const stride = cols + 1;
  for (let h = 1; h <= rows; h++) {
    for (let w = 1; w <= cols; w++) {
      if (clue.area !== null && h * w !== clue.area) continue;
      if (clue.shape === "square" && h !== w) continue;
      if (clue.shape === "wide" && w <= h) continue;
      if (clue.shape === "tall" && h <= w) continue;
      for (let r0 = Math.max(0, r - h + 1); r0 <= Math.min(r, rows - h); r0++) {
        for (let c0 = Math.max(0, c - w + 1); c0 <= Math.min(c, cols - w); c0++) {
          // Exactly one clue (this one) inside, by the prefix sums of clue positions.
          const inside = clueCount[(r0 + h) * stride + c0 + w] - clueCount[r0 * stride + c0 + w] - clueCount[(r0 + h) * stride + c0] + clueCount[r0 * stride + c0];
          if (inside !== 1) continue;
          const cells: number[] = [];
          for (let rr = r0; rr < r0 + h; rr++) for (let cc = c0; cc < c0 + w; cc++) cells.push(rr * cols + cc);
          if (!emit(cells)) return false;
        }
      }
    }
  }
  return true;
}

/**
 * Every connected set of `area` cells containing the clue's cell and no other clue, each exactly once (Redelmeier's
 * method: a cell once passed over stays excluded for the rest of that branch, so no set is found twice).
 */
function freeShapes(puzzle: PatchesPuzzle, index: number, blocked: Uint8Array, emit: (cells: number[]) => boolean): boolean {
  const { rows, cols } = puzzle;
  const clue = puzzle.clues[index];
  const area = clue.area ?? 0;
  const seen = new Uint8Array(rows * cols);
  const shape: number[] = [];
  seen[clue.cell] = 1;

  const grow = (untried: number[]): boolean => {
    const local = untried.slice();
    while (local.length > 0) {
      const cell = local.pop()!;
      shape.push(cell);
      if (shape.length === area) {
        if (!emit([...shape].sort((a, b) => a - b))) return false;
      } else {
        const added: number[] = [];
        const c = cell % cols;
        const around = [cell - cols, cell + cols, c > 0 ? cell - 1 : -1, c < cols - 1 ? cell + 1 : -1];
        for (const m of around) {
          if (m >= 0 && m < rows * cols && seen[m] === 0 && blocked[m] === 0) {
            seen[m] = 1;
            added.push(m);
          }
        }
        const ok = grow(local.concat(added));
        for (const m of added) seen[m] = 0;
        if (!ok) return false;
      }
      shape.pop();
    }
    return true;
  };
  return grow([clue.cell]);
}

/** The candidate patches of every clue, or null when there are more than `maxCandidates` (the puzzle is then too big to verify). */
export function buildModel(puzzle: PatchesPuzzle, maxCandidates = MAX_CANDIDATES): Model | null {
  const n = cellCount(puzzle);
  const words = wordsFor(n);
  const full = new Int32Array(words);
  for (let cell = 0; cell < n; cell++) full[cell >>> 5] |= 1 << (cell & 31);

  // Prefix sums of how many clues lie in each rectangle of the board.
  const { rows, cols } = puzzle;
  const stride = cols + 1;
  const clueCount = new Int32Array((rows + 1) * stride);
  const isClue = new Uint8Array(n);
  for (const clue of puzzle.clues) isClue[clue.cell] = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      clueCount[(r + 1) * stride + c + 1] = isClue[r * cols + c] + clueCount[r * stride + c + 1] + clueCount[(r + 1) * stride + c] - clueCount[r * stride + c];
    }
  }

  let total = 0;
  const cands: Candidate[][] = [];
  for (let i = 0; i < puzzle.clues.length; i++) {
    const list: Candidate[] = [];
    const emit = (cells: number[]): boolean => {
      list.push({ cells, mask: maskOf(cells, words) });
      return ++total <= maxCandidates;
    };
    let complete: boolean;
    if (puzzle.clues[i].shape === "free") {
      // A freeform clue without an area has no bound on its shapes (the text format never allows one).
      if (puzzle.clues[i].area === null) return null;
      const blocked = new Uint8Array(n);
      for (const other of puzzle.clues) if (other !== puzzle.clues[i]) blocked[other.cell] = 1;
      complete = freeShapes(puzzle, i, blocked, emit);
    } else {
      complete = rectangles(puzzle, i, clueCount, emit);
    }
    if (!complete) return null;
    cands.push(list);
  }
  return { puzzle, n, words, full, cands };
}

// ---------------------------------------------------------------------------
// The state of a search, and propagation
// ---------------------------------------------------------------------------

export interface State {
  covered: Int32Array;
  /** Per clue, the indices of its candidates that can still be used; one entry once the clue is placed. */
  live: number[][];
  /** Per clue, the candidate chosen, or -1. */
  placed: Int32Array;
  /** Clues not placed yet. */
  left: number;
}

/** A forced placement found by propagation, in the order it was found. */
export interface Step {
  kind: "clue" | "cell";
  clue: number;
  /** The candidate (index into `cands[clue]`) that has to be used. */
  candidate: number;
  /** For a cell single, the cell that only this candidate could cover. */
  cell: number | null;
}

export function emptyState(model: Model): State {
  return {
    covered: new Int32Array(model.words),
    live: model.cands.map((list) => list.map((_, i) => i)),
    placed: new Int32Array(model.cands.length).fill(-1),
    left: model.cands.length,
  };
}

export const cloneState = (s: State): State => ({ covered: s.covered.slice(), live: s.live.slice(), placed: s.placed.slice(), left: s.left });

function place(model: Model, s: State, clue: number, candidate: number): void {
  const mask = model.cands[clue][candidate].mask;
  for (let w = 0; w < model.words; w++) s.covered[w] |= mask[w];
  s.live[clue] = [candidate];
  s.placed[clue] = candidate;
  s.left--;
}

/** Puts a patch the player drew into the state; false if it is not one of the clue's candidates or overlaps. */
export function placePatch(model: Model, s: State, patch: Patch): boolean {
  const list = model.cands[patch.clue];
  if (!list || s.placed[patch.clue] >= 0) return false;
  const index = list.findIndex((c) => c.cells.length === patch.cells.length && c.cells.every((cell, i) => cell === patch.cells[i]));
  if (index < 0) return false;
  const mask = list[index].mask;
  for (let w = 0; w < model.words; w++) if ((s.covered[w] & mask[w]) !== 0) return false;
  place(model, s, patch.clue, index);
  return true;
}

/**
 * A state with the player's patches in it. A patch that does not fit its clue (the player drew it at the wrong size) is
 * not one of the clue's candidates, so it is added to a copy of the model: it still covers its cells and uses its clue,
 * which is what the rest of the board has to work around. Use the returned model, not the one passed in.
 */
export function loadPatches(model: Model, patches: readonly Patch[]): { model: Model; state: State } {
  const loose = patches.filter((p) => !model.cands[p.clue]?.some((c) => c.cells.length === p.cells.length && c.cells.every((cell, i) => cell === p.cells[i])));
  const extended: Model =
    loose.length === 0
      ? model
      : { ...model, cands: model.cands.map((list, i) => [...list, ...loose.filter((p) => p.clue === i).map((p) => ({ cells: [...p.cells], mask: maskOf(p.cells, model.words) }))]) };
  const state = emptyState(extended);
  for (const patch of patches) placePatch(extended, state, patch);
  return { model: extended, state };
}

/** Why propagation gave up. */
export type Dead = { kind: "clue"; clue: number } | { kind: "cell"; cell: number };

export interface Propagation {
  ok: boolean;
  dead: Dead | null;
}

/**
 * Applies every forced consequence until nothing more follows. Returns false (with the reason) at a dead end. `steps`,
 * when given, receives each placement it forced, in order.
 */
export function propagate(model: Model, s: State, steps?: Step[]): Propagation {
  const { words, cands } = model;
  const once = new Int32Array(words);
  const twice = new Int32Array(words);
  const forced = new Int32Array(words);

  for (;;) {
    let changed = false;

    // Drop candidates that overlap what is covered; a clue with one left is placed.
    for (let i = 0; i < cands.length; i++) {
      if (s.placed[i] >= 0) continue;
      const list = s.live[i];
      const kept: number[] = [];
      for (const index of list) {
        const mask = cands[i][index].mask;
        let clash = false;
        for (let w = 0; w < words; w++) {
          if ((mask[w] & s.covered[w]) !== 0) {
            clash = true;
            break;
          }
        }
        if (!clash) kept.push(index);
      }
      if (kept.length === 0) return { ok: false, dead: { kind: "clue", clue: i } };
      if (kept.length !== list.length) s.live[i] = kept;
      if (kept.length === 1) {
        place(model, s, i, kept[0]);
        steps?.push({ kind: "clue", clue: i, candidate: kept[0], cell: null });
        changed = true;
      }
    }

    // Which cells can still be covered, and by how many candidates.
    once.fill(0);
    twice.fill(0);
    for (let i = 0; i < cands.length; i++) {
      if (s.placed[i] >= 0) continue;
      for (const index of s.live[i]) {
        const mask = cands[i][index].mask;
        for (let w = 0; w < words; w++) {
          twice[w] |= once[w] & mask[w];
          once[w] |= mask[w];
        }
      }
    }
    let any = false;
    for (let w = 0; w < words; w++) {
      const open = model.full[w] & ~s.covered[w];
      const missing = open & ~once[w];
      if (missing !== 0) {
        const bit = 31 - Math.clz32(missing & -missing);
        return { ok: false, dead: { kind: "cell", cell: w * 32 + bit } };
      }
      forced[w] = open & once[w] & ~twice[w];
      if (forced[w] !== 0) any = true;
    }

    // A cell only one candidate can cover forces that candidate (one at a time: the rest are re-derived).
    if (any) {
      outer: for (let i = 0; i < cands.length; i++) {
        if (s.placed[i] >= 0) continue;
        for (const index of s.live[i]) {
          const mask = cands[i][index].mask;
          for (let w = 0; w < words; w++) {
            const hit = mask[w] & forced[w];
            if (hit !== 0) {
              const cell = w * 32 + (31 - Math.clz32(hit & -hit));
              place(model, s, i, index);
              steps?.push({ kind: "cell", clue: i, candidate: index, cell });
              changed = true;
              break outer;
            }
          }
        }
      }
    }
    if (!changed) return { ok: true, dead: null };
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SolveResult {
  /** Solutions found, up to the limit. */
  count: number;
  /** The search (or the candidate list) hit its bound: the counts prove nothing. */
  exceeded: boolean;
  /** For each solution found, the owning clue of every cell. */
  first: number[] | null;
  second: number[] | null;
  nodes: number;
  /** Propagation alone, with no guessing, solved the whole puzzle. */
  byDeduction: boolean;
}

function ownersOf(model: Model, s: State): number[] {
  const owner = new Array<number>(model.n).fill(-1);
  for (let i = 0; i < model.cands.length; i++) for (const cell of model.cands[i][s.placed[i]].cells) owner[cell] = i;
  return owner;
}

export function solveModel(model: Model, { limit = 2, budget = NODE_BUDGET, start }: { limit?: number; budget?: number; start?: State } = {}): SolveResult {
  const found: number[][] = [];
  let nodes = 0;
  let exceeded = false;
  let byDeduction = false;

  const search = (s: State, root: boolean): void => {
    if (++nodes > budget) {
      exceeded = true;
      return;
    }
    if (!propagate(model, s).ok) return;
    if (s.left === 0) {
      if (root) byDeduction = true;
      found.push(ownersOf(model, s));
      return;
    }
    // Branch on the clue with the fewest candidates left.
    let pick = -1;
    for (let i = 0; i < s.placed.length; i++) {
      if (s.placed[i] < 0 && (pick < 0 || s.live[i].length < s.live[pick].length)) pick = i;
    }
    for (const index of s.live[pick]) {
      if (found.length >= limit || exceeded) return;
      const next = cloneState(s);
      place(model, next, pick, index);
      search(next, false);
    }
  };

  search(start ? cloneState(start) : emptyState(model), true);
  return { count: found.length, exceeded, first: found[0] ?? null, second: found[1] ?? null, nodes, byDeduction };
}

/**
 * How a person would have to solve a puzzle, which says more about its difficulty than the size of the search:
 *   level 1  every placement follows from the clues alone (singles);
 *   level 2  also needs lookahead: trying a placement and seeing it leave a clue or a cell with nothing;
 *   level 3  needs more than that (deeper guessing).
 * `lookaheads` is how many placements had to be ruled out that way.
 */
export interface Logic {
  level: 1 | 2 | 3;
  /** Placements ruled out by lookahead, in all. */
  lookaheads: number;
  /** Rounds of lookahead that were needed, each depending on what the one before it found: how deep the reasoning goes. */
  rounds: number;
}

/** Removes from `s` every candidate that propagation shows to be impossible, one round; returns how many it removed, or -1 on a dead end. */
export function lookahead(model: Model, s: State): number {
  let removed = 0;
  for (let i = 0; i < model.cands.length; i++) {
    if (s.placed[i] >= 0) continue;
    const keep: number[] = [];
    for (const index of s.live[i]) {
      const trial = cloneState(s);
      place(model, trial, i, index);
      if (propagate(model, trial).ok) keep.push(index);
      else removed++;
    }
    if (keep.length === 0) return -1;
    if (keep.length !== s.live[i].length) s.live[i] = keep;
  }
  return removed;
}

/** Rates the puzzle, or returns null when it has no solution that logic can reach (or the work bound is hit). */
export function rateLogic(model: Model, { rounds = 40 }: { rounds?: number } = {}): Logic | null {
  const s = emptyState(model);
  if (!propagate(model, s).ok) return null;
  let lookaheads = 0;
  for (let round = 0; round < rounds; round++) {
    if (s.left === 0) return { level: lookaheads === 0 ? 1 : 2, lookaheads, rounds: round };
    const removed = lookahead(model, s);
    if (removed < 0) return null;
    if (removed === 0) return { level: 3, lookaheads, rounds: round };
    lookaheads += removed;
    if (!propagate(model, s).ok) return null;
  }
  return s.left === 0 ? { level: 2, lookaheads, rounds } : { level: 3, lookaheads, rounds };
}

/** Counts a puzzle's solutions up to `limit`. A puzzle too big to enumerate is `exceeded`. */
export function solvePuzzle(puzzle: PatchesPuzzle, options: { limit?: number; budget?: number } = {}): SolveResult {
  const model = buildModel(puzzle);
  if (!model) return { count: 0, exceeded: true, first: null, second: null, nodes: 0, byDeduction: false };
  return solveModel(model, options);
}

/** True when the puzzle has exactly one solution and the search finished within the budget. */
export function hasUniqueSolution(puzzle: PatchesPuzzle, budget = NODE_BUDGET): boolean {
  const result = solvePuzzle(puzzle, { budget });
  return !result.exceeded && result.count === 1;
}

/** The clue that owns each cell in a solution, as the patch cells grouped by clue. */
export function patchesOf(owner: readonly number[], clues: readonly Clue[]): Patch[] {
  const cells: number[][] = clues.map(() => []);
  owner.forEach((clue, cell) => {
    if (clue >= 0) cells[clue].push(cell);
  });
  return cells.map((list, clue) => ({ clue, cells: list }));
}
