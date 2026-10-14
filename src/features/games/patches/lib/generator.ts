import type { Rng } from "@/lib/random";
import { shuffle } from "@/features/games/shared/lib/shuffle";
import { formatPuzzle } from "./puzzle-format";
import { isRectangle, shapeOf } from "./shapes";
import { buildModel, rateLogic, solveModel, type Logic, type SolveResult } from "./solver";
import type { Clue, Difficulty, PatchesPuzzle, Puzzle, Shape } from "./types";

/**
 * Builds Patches puzzles. The recipe never guesses at clues:
 *
 *   1. Carve a complete partition of the board into patches (rectangles, plus a few freeform shapes on the harder
 *      levels), so a solution is known to exist.
 *   2. Put one clue in each patch and let it say what is true of that patch: its area and its shape category, or less.
 *   3. While the solver finds a second solution, remove it: either say more on a clue the other solution gets wrong
 *      (an area or shape it does not meet), or move a clue inside its own patch to a cell the other solution gives
 *      to a different patch. Both only ever add constraints that the real partition still meets.
 *   4. On the harder levels, take back whatever a clue says that the puzzle does not need.
 *   5. Accept only when the solver proves the solution unique within its node budget (and, per level, that the
 *      deductions needed are of the right kind).
 */

export interface Profile {
  /** Board side of the standard and of the larger board. */
  sizes: readonly [number, number];
  /** About how big a patch is, and the longest side / largest area a rectangle may have. */
  avgArea: number;
  maxSide: number;
  maxArea: number;
  /** Extra weight for squares among the rectangles that fit. */
  squareBias: number;
  /** How many freeform patches, and their area. */
  free: readonly [min: number, max: number];
  freeArea: readonly [min: number, max: number];
  /** Weights for what a rectangle's clue says at first: area and shape, area only, shape only, nothing. */
  info: readonly [both: number, area: number, shape: number, none: number];
  /** The most 1-cell patches a board may have. */
  maxSingles: number;
  /** The share of clues the minimising pass tries to take information from (0 = none). */
  minimise: number;
  /** How often a repair prefers saying more over moving a clue (0-1). */
  revealBias: number;
  /**
   * The logic solving may need (see `rateLogic`): 1 = every placement follows from the clues alone, 2 = some need a
   * lookahead (try a placement, see it leave something with no room). Anything harder is made easier by saying more.
   */
  maxLevel: 1 | 2;
  /** How many rounds of lookahead the puzzle must need, each building on the last (tried while the budget lasts; relaxed after that). */
  minRounds: number;
}

/** Tuned from the benchmark in scripts/bench-puzzles.ts. */
export const PROFILES: Record<Difficulty, Profile> = {
  easy: { sizes: [5, 6], avgArea: 4, maxSide: 3, maxArea: 6, squareBias: 1.5, free: [0, 0], freeArea: [0, 0], info: [3, 6, 0, 0], maxSingles: 1, minimise: 0, revealBias: 1, maxLevel: 1, minRounds: 0 },
  medium: { sizes: [6, 7], avgArea: 5, maxSide: 4, maxArea: 9, squareBias: 0.6, free: [0, 0], freeArea: [0, 0], info: [3, 3, 3, 1], maxSingles: 2, minimise: 0.4, revealBias: 0.6, maxLevel: 1, minRounds: 0 },
  hard: { sizes: [7, 8], avgArea: 5.5, maxSide: 6, maxArea: 10, squareBias: 0.2, free: [1, 2], freeArea: [4, 5], info: [2, 3, 3, 2], maxSingles: 2, minimise: 0.8, revealBias: 0.4, maxLevel: 2, minRounds: 1 },
  expert: { sizes: [8, 9], avgArea: 6, maxSide: 7, maxArea: 12, squareBias: 0, free: [2, 3], freeArea: [4, 6], info: [1, 2, 3, 3], maxSingles: 2, minimise: 1, revealBias: 0.25, maxLevel: 2, minRounds: 2 },
};

/** The board side for a difficulty. */
export const sizeFor = (difficulty: Difficulty, larger: boolean): number => PROFILES[difficulty].sizes[larger ? 1 : 0];

/**
 * The nodes a search may use while generating, and so the most a freshly built puzzle can cost to verify. The
 * solver's own budget (what the server allows, `NODE_BUDGET`) is much larger, which leaves room for the solver to
 * change without invalidating puzzles already played.
 */
export const GENERATION_NODES = 1_500;

export class GenerationError extends Error {}

export interface Budget {
  maxAttempts: number;
  maxMs: number;
}

export const DEFAULT_BUDGET: Budget = { maxAttempts: 150, maxMs: 4000 };

export interface Attempts {
  attempts: number;
  /** Solver runs spent in total. */
  solves: number;
  /** Per accepted puzzle: the final proof's nodes, its clue and freeform counts, and clues that say nothing. */
  nodes: number[];
  clues: number[];
  free: number[];
  blank: number[];
  /** Accepted puzzles that propagation alone solves (logic level 1). */
  byDeduction: number;
  /** Per accepted puzzle: how many rounds of lookahead it needs (0 for pure deduction). */
  rounds: number[];
}

interface Piece {
  cells: number[];
  free: boolean;
}

function pick(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** A rectangle whose top-left corner is the first cell not yet taken (every cell before it is taken, so it can be nothing else). */
function carveRectangle(start: number, rows: number, cols: number, taken: Uint8Array, profile: Profile, rng: Rng): number[] {
  const r = Math.floor(start / cols);
  const c = start % cols;
  const target = Math.max(1, Math.round(profile.avgArea * (0.4 + 1.3 * rng())));
  const options: { h: number; w: number; weight: number }[] = [];
  let reach = cols - c;
  for (let h = 1; h <= Math.min(profile.maxSide, rows - r); h++) {
    // How far right the rectangle may reach on every row so far.
    let run = 0;
    while (run < reach && taken[(r + h - 1) * cols + c + run] === 0) run++;
    reach = run;
    if (reach === 0) break;
    for (let w = 1; w <= Math.min(reach, profile.maxSide); w++) {
      const area = h * w;
      if (area > profile.maxArea) continue;
      let weight = 1 / (1 + Math.abs(area - target)) ** 2;
      if (h === w) weight *= 1 + profile.squareBias;
      if (area === 1) weight *= 0.2;
      options.push({ h, w, weight });
    }
  }
  const { h, w } = options[pick(options.map((o) => o.weight), rng)];
  const cells: number[] = [];
  for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) cells.push(rr * cols + cc);
  return cells;
}

/** A freeform patch grown from the first cell not yet taken, or null if none that is not a rectangle came out. */
function carveFree(start: number, rows: number, cols: number, taken: Uint8Array, profile: Profile, rng: Rng): number[] | null {
  for (let attempt = 0; attempt < 12; attempt++) {
    const size = profile.freeArea[0] + Math.floor(rng() * (profile.freeArea[1] - profile.freeArea[0] + 1));
    const cells = [start];
    const inShape = new Set(cells);
    while (cells.length < size) {
      const frontier: number[] = [];
      for (const cell of cells) {
        const c = cell % cols;
        for (const m of [cell - cols, cell + cols, c > 0 ? cell - 1 : -1, c < cols - 1 ? cell + 1 : -1]) {
          if (m >= 0 && m < rows * cols && taken[m] === 0 && !inShape.has(m)) frontier.push(m);
        }
      }
      if (frontier.length === 0) break;
      const next = frontier[Math.floor(rng() * frontier.length)];
      cells.push(next);
      inShape.add(next);
    }
    if (cells.length === size && !isRectangle(cells, cols)) return cells.sort((a, b) => a - b);
  }
  return null;
}

/** Divides the board into pieces, scanning cell by cell; `freeSlots` are the pieces (by order) that should be freeform. */
function carve(rows: number, cols: number, profile: Profile, freeSlots: ReadonlySet<number>, rng: Rng): Piece[] {
  const taken = new Uint8Array(rows * cols);
  const pieces: Piece[] = [];
  for (let start = 0; start < rows * cols; start++) {
    if (taken[start]) continue;
    const free = freeSlots.has(pieces.length) ? carveFree(start, rows, cols, taken, profile, rng) : null;
    const cells = free ?? carveRectangle(start, rows, cols, taken, profile, rng);
    for (const cell of cells) taken[cell] = 1;
    pieces.push({ cells, free: free !== null });
  }
  return pieces;
}

/** A patch of the known solution, and how much of what is true of it its clue says. */
interface Slot {
  cells: number[];
  clueCell: number;
  area: number;
  shape: Shape;
  showArea: boolean;
  showShape: boolean;
}

interface Built {
  puzzle: PatchesPuzzle;
  /** For every cell, the clue (index in `puzzle.clues`) that owns it in the known solution. */
  truth: number[];
  /** For each slot, its clue's index. */
  clueOf: number[];
}

function build(rows: number, cols: number, slots: readonly Slot[]): Built {
  const order = slots.map((_, i) => i).sort((a, b) => slots[a].clueCell - slots[b].clueCell);
  const clueOf = new Array<number>(slots.length);
  const clues: Clue[] = order.map((slot, rank) => {
    clueOf[slot] = rank;
    const s = slots[slot];
    return { cell: s.clueCell, area: s.showArea ? s.area : null, shape: s.showShape ? s.shape : null };
  });
  const truth = new Array<number>(rows * cols).fill(-1);
  slots.forEach((s, i) => s.cells.forEach((cell) => (truth[cell] = clueOf[i])));
  return { puzzle: { rows, cols, clues }, truth, clueOf };
}

const sameOwners = (a: readonly number[], b: readonly number[]): boolean => a.every((x, i) => x === b[i]);

/** Generates a puzzle of the given difficulty and board size, or throws `GenerationError` when the budget runs out. */
export function generatePuzzle(difficulty: Difficulty, rng: Rng = Math.random, budget: Budget = DEFAULT_BUDGET, stats?: Attempts, larger = false): Puzzle {
  const profile = PROFILES[difficulty];
  const side = sizeFor(difficulty, larger);
  const rows = side;
  const cols = side;
  const expectedPieces = Math.round((rows * cols) / profile.avgArea);
  const started = Date.now();

  for (let attempt = 0; attempt < budget.maxAttempts; attempt++) {
    if (Date.now() - started > budget.maxMs) break;
    if (stats) stats.attempts++;
    // Half way through the budget the number of lookaheads asked for is relaxed, so a stubborn level still produces a puzzle.
    const strict = attempt < budget.maxAttempts / 2;

    // 1. A complete partition.
    const wanted = profile.free[0] + Math.floor(rng() * (profile.free[1] - profile.free[0] + 1));
    const freeSlots = new Set(shuffle(Array.from({ length: Math.max(expectedPieces, wanted) }, (_, i) => i), rng).slice(0, wanted));
    const pieces = carve(rows, cols, profile, freeSlots, rng);
    const freeCount = pieces.filter((p) => p.free).length;
    if (freeCount < profile.free[0] || freeCount > profile.free[1]) continue;
    if (pieces.length < 3 || pieces.filter((p) => p.cells.length === 1).length > profile.maxSingles) continue;

    // 2. One clue in each, saying as much as the level shows.
    const slots: Slot[] = pieces.map((piece) => {
      const [both, area, shape] = [profile.info[0], profile.info[1], profile.info[2]];
      const mode = piece.free ? 0 : pick([both, area, shape, profile.info[3]], rng);
      return {
        cells: piece.cells,
        clueCell: piece.cells[Math.floor(rng() * piece.cells.length)],
        area: piece.cells.length,
        shape: shapeOf(piece.cells, cols),
        showArea: mode === 0 || mode === 1,
        showShape: mode === 0 || mode === 2,
      };
    });

    const solve = (limit: number, nodes: number): SolveResult => {
      if (stats) stats.solves++;
      const model = buildModel(build(rows, cols, slots).puzzle);
      return model ? solveModel(model, { limit, budget: nodes }) : { count: 0, exceeded: true, first: null, second: null, nodes: 0, byDeduction: false };
    };

    // 3. Remove every other solution.
    let unique = false;
    for (let round = 0; round < 60; round++) {
      const result = solve(2, GENERATION_NODES);
      const built = build(rows, cols, slots);
      const others = [result.first, result.second].filter((s): s is number[] => s !== null && !sameOwners(s, built.truth));
      if (!result.exceeded && result.count === 1 && others.length === 0) {
        unique = true;
        break;
      }
      const other = others[0] ?? null;

      // Say more on a clue that the other solution gets wrong.
      const reveals: { slot: number; field: "area" | "shape" }[] = [];
      if (other) {
        slots.forEach((s, i) => {
          if (s.shape === "free") return;
          const theirs = other.flatMap((owner, cell) => (owner === built.clueOf[i] ? [cell] : []));
          if (!s.showArea && theirs.length !== s.area) reveals.push({ slot: i, field: "area" });
          if (!s.showShape && shapeOf(theirs, cols) !== s.shape) reveals.push({ slot: i, field: "shape" });
        });
      } else {
        // The search ran out of nodes: anything more that a clue could say helps.
        slots.forEach((s, i) => {
          if (s.shape === "free") return;
          if (!s.showArea) reveals.push({ slot: i, field: "area" });
          if (!s.showShape) reveals.push({ slot: i, field: "shape" });
        });
      }

      // Or move a clue to a cell the other solution gives to a different patch, which leaves that solution with two clues in one patch.
      const moves: { slot: number; cell: number }[] = [];
      if (other) {
        slots.forEach((s, i) => {
          for (const cell of s.cells) if (other[cell] !== built.clueOf[i]) moves.push({ slot: i, cell });
        });
      }

      if (reveals.length > 0 && (moves.length === 0 || rng() < profile.revealBias)) {
        const { slot, field } = reveals[Math.floor(rng() * reveals.length)];
        if (field === "area") slots[slot].showArea = true;
        else slots[slot].showShape = true;
      } else if (moves.length > 0) {
        const { slot, cell } = moves[Math.floor(rng() * moves.length)];
        slots[slot].clueCell = cell;
      } else break;
    }
    if (!unique) continue;

    // 4. Take back what the puzzle does not need.
    if (profile.minimise > 0) {
      for (const i of shuffle(slots.map((_, k) => k), rng)) {
        const slot = slots[i];
        if (slot.shape === "free" || rng() >= profile.minimise) continue;
        for (const field of shuffle(["showArea", "showShape"] as const, rng)) {
          if (!slot[field]) continue;
          slot[field] = false;
          const r = solve(2, GENERATION_NODES);
          if (r.exceeded || r.count !== 1) slot[field] = true;
        }
      }
    }

    // 5. Rate how a person would solve it; where that is harder than the level allows, say more again until it is not.
    const rate = (): Logic | null => {
      const model = buildModel(build(rows, cols, slots).puzzle);
      return model ? rateLogic(model) : null;
    };
    let logic = rate();
    while (logic === null || logic.level > profile.maxLevel) {
      const hidden: { slot: number; field: "showArea" | "showShape" }[] = [];
      slots.forEach((s, i) => {
        if (s.shape === "free") return;
        if (!s.showArea) hidden.push({ slot: i, field: "showArea" });
        if (!s.showShape) hidden.push({ slot: i, field: "showShape" });
      });
      if (hidden.length === 0) break;
      const { slot, field } = hidden[Math.floor(rng() * hidden.length)];
      slots[slot][field] = true;
      logic = rate();
    }
    if (logic === null || logic.level > profile.maxLevel) continue;
    if (strict && logic.rounds < profile.minRounds) continue;

    // 6. Accept only a puzzle the solver proves unique.
    const final = solve(2, GENERATION_NODES);
    if (final.exceeded || final.count !== 1 || !final.first) continue;
    const built = build(rows, cols, slots);
    if (!sameOwners(final.first, built.truth)) continue;
    if (stats) {
      stats.nodes.push(final.nodes);
      stats.clues.push(built.puzzle.clues.length);
      stats.free.push(freeCount);
      stats.blank.push(built.puzzle.clues.filter((c) => c.area === null && c.shape === null).length);
      stats.rounds.push(logic.rounds);
      if (logic.level === 1) stats.byDeduction++;
    }
    return { difficulty, puzzle: formatPuzzle(built.puzzle), solution: final.first };
  }
  throw new GenerationError(`No ${difficulty} Patches puzzle within the budget.`);
}
