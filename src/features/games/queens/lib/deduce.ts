import type { Board } from "./grid";
import { neighbors8 } from "./grid";

/**
 * A model of how a person solves Queens, used to rate puzzles (difficulty is the deepest technique a puzzle
 * needs, not its size) and to explain hints.
 *
 * Units are the 3n lines and regions that each need exactly one queen: rows 0..n-1, columns n..2n-1 and regions
 * 2n..3n-1. A cell is "alive" while a queen could still go there. Techniques, from simplest (the number is the tier):
 *
 *   1  single     a unit with one alive cell left: that is its queen
 *   2  confine 1  every alive cell of a unit lies in one unit of another kind (a region inside a row, a row inside
 *                 a region ...): the rest of that other unit is out
 *   3  wipeout    a queen here would leave a unit with nowhere to go
 *   4  confine 2  two units whose alive cells fit in exactly two units of another kind (two regions inside two rows ...)
 *   5  confine 3  the same with three units
 *   6  trial      pretend a queen is here and follow tier 1-2 deductions to a contradiction
 *   7  confine 4  the same with four units
 *   8  deep trial the trial again, following tier 1-4 deductions
 *
 * The solver always uses the simplest technique that makes progress, so the highest tier it needed is the lowest
 * tier that can solve the puzzle: its rating.
 */

export type Technique = "single" | "confine" | "wipeout" | "trial";

export interface Step {
  level: number;
  technique: Technique;
  /** The units behind the step, as unit ids ("r3", "c0", "g5"); `from` are the confined ones, `into` the ones they fit in. */
  from: string[];
  into: string[];
  /** Cells to cross out. */
  eliminate: number[];
  /** The cell that must hold a queen (singles only). */
  place: number | null;
}

export const MAX_LEVEL = 8;

/** Unit ids for messages and for the board to highlight. */
export const unitId = (kind: "r" | "c" | "g", index: number): string => `${kind}${index}`;

interface Geometry {
  n: number;
  /** The cells of every unit. */
  unitCells: number[][];
  /** The three units a cell belongs to. */
  cellUnits: number[][];
  neighbors: number[][];
}

function geometryOf(board: Board): Geometry {
  const { n, reg } = board;
  const unitCells: number[][] = Array.from({ length: 3 * n }, () => []);
  const cellUnits: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    const units = [Math.floor(i / n), n + (i % n), 2 * n + reg[i]];
    cellUnits.push(units);
    for (const u of units) unitCells[u].push(i);
  }
  return { n, unitCells, cellUnits, neighbors: Array.from({ length: n * n }, (_, i) => neighbors8(i, n)) };
}

const KIND_OF = (u: number, n: number): "r" | "c" | "g" => (u < n ? "r" : u < 2 * n ? "c" : "g");
const NAME = (u: number, n: number): string => unitId(KIND_OF(u, n), u % n);

/** What is still possible: which cells can hold a queen, which units already have theirs. */
interface Sim {
  alive: Uint8Array;
  done: Uint8Array;
  queens: number[];
}

const cloneSim = (s: Sim): Sim => ({ alive: s.alive.slice(), done: s.done.slice(), queens: s.queens.slice() });

function placeQueen(g: Geometry, s: Sim, cell: number): void {
  for (const u of g.cellUnits[cell]) {
    s.done[u] = 1;
    for (const c of g.unitCells[u]) s.alive[c] = 0;
  }
  for (const c of g.neighbors[cell]) s.alive[c] = 0;
  s.queens.push(cell);
}

const aliveIn = (g: Geometry, s: Sim, u: number): number[] => g.unitCells[u].filter((c) => s.alive[c] === 1);

/** A unit still needing a queen with no cell left to put it in. */
function contradiction(g: Geometry, s: Sim): boolean {
  for (let u = 0; u < g.unitCells.length; u++) {
    if (s.done[u] === 0 && !g.unitCells[u].some((c) => s.alive[c] === 1)) return true;
  }
  return false;
}

const KIND_RANGES = (n: number): [number, number][] => [
  [0, n],
  [n, 2 * n],
  [2 * n, 3 * n],
];

const CONFINE_TIER = [0, 2, 4, 5, 7];

const popcount = (x: number): number => {
  let count = 0;
  for (; x; x &= x - 1) count++;
  return count;
};

/**
 * k units of one kind whose alive cells all sit inside exactly k units of another kind: those k units hold the k
 * queens, so their other cells are out. Returns a step if some cell can be crossed out; "contradiction" if more
 * units need queens than the units they fit in can hold. Units are compared as bit masks (n <= 9), so this stays
 * cheap enough to run for every candidate puzzle.
 */
function confine(g: Geometry, s: Sim, k: number): Step | "contradiction" | null {
  const { n } = g;
  const alive: number[][] = g.unitCells.map((cells) => cells.filter((c) => s.alive[c] === 1));
  for (const [fromLo, fromHi] of KIND_RANGES(n)) {
    const open: number[] = [];
    for (let u = fromLo; u < fromHi; u++) if (s.done[u] === 0) open.push(u);
    if (open.length < k) continue;
    for (const [intoLo] of KIND_RANGES(n)) {
      if (intoLo === fromLo) continue;
      // The units of the other kind that each open unit's alive cells touch, one bit per unit.
      const touches = open.map((u) => {
        let mask = 0;
        for (const c of alive[u]) mask |= 1 << (g.cellUnits[c][intoLo / n] - intoLo);
        return mask;
      });
      const chosen: number[] = [];
      const walk = (start: number, mask: number): Step | "contradiction" | null => {
        if (chosen.length === k) {
          const size = popcount(mask);
          if (size < k) return "contradiction";
          if (size !== k) return null;
          const group = chosen.map((i) => open[i]);
          const covered = new Set<number>();
          for (const u of group) for (const c of alive[u]) covered.add(c);
          const into: number[] = [];
          const eliminate: number[] = [];
          for (let b = 0; b < n; b++) {
            if (!(mask & (1 << b))) continue;
            into.push(intoLo + b);
            for (const c of alive[intoLo + b]) if (!covered.has(c)) eliminate.push(c);
          }
          if (eliminate.length === 0) return null;
          return { level: CONFINE_TIER[k], technique: "confine", from: group.map((u) => NAME(u, n)), into: into.map((u) => NAME(u, n)), eliminate: [...new Set(eliminate)].sort((a, b) => a - b), place: null };
        }
        for (let i = start; i <= open.length - (k - chosen.length); i++) {
          chosen.push(i);
          const found = walk(i + 1, mask | touches[i]);
          chosen.pop();
          if (found) return found;
        }
        return null;
      };
      const found = walk(0, 0);
      if (found) return found;
    }
  }
  return null;
}

function findSingle(g: Geometry, s: Sim): Step | null {
  for (let u = 0; u < g.unitCells.length; u++) {
    if (s.done[u] === 1) continue;
    const cells = aliveIn(g, s, u);
    if (cells.length === 1) return { level: 1, technique: "single", from: [NAME(u, g.n)], into: [], eliminate: [], place: cells[0] };
  }
  return null;
}

function findWipeout(g: Geometry, s: Sim): Step | null {
  for (let c = 0; c < g.n * g.n; c++) {
    if (s.alive[c] === 0) continue;
    const t = cloneSim(s);
    placeQueen(g, t, c);
    if (contradiction(g, t)) return { level: 3, technique: "wipeout", from: [], into: [], eliminate: [c], place: null };
  }
  return null;
}

type Outcome = "solved" | "stuck" | "contradiction";

function findTrial(g: Geometry, s: Sim, depth: number, level: number): Step | null {
  for (let c = 0; c < g.n * g.n; c++) {
    if (s.alive[c] === 0) continue;
    const t = cloneSim(s);
    placeQueen(g, t, c);
    if (propagate(g, t, depth) === "contradiction") return { level, technique: "trial", from: [], into: [], eliminate: [c], place: null };
  }
  return null;
}

/** The simplest step available using techniques up to `cap`, or null when stuck. "contradiction" means the position is impossible. */
function nextStep(g: Geometry, s: Sim, cap: number): Step | "contradiction" | null {
  if (contradiction(g, s)) return "contradiction";
  const single = findSingle(g, s);
  if (single) return single;
  const ladder: (() => Step | "contradiction" | null)[] = [
    () => confine(g, s, 1),
    () => findWipeout(g, s),
    () => confine(g, s, 2),
    () => confine(g, s, 3),
    () => findTrial(g, s, 2, 6),
    () => confine(g, s, 4),
    () => findTrial(g, s, 4, 8),
  ];
  const tiers = [2, 3, 4, 5, 6, 7, 8];
  for (const [i, attempt] of ladder.entries()) {
    if (tiers[i] > cap) break;
    const found = attempt();
    if (found) return found;
  }
  return null;
}

function applyStep(g: Geometry, s: Sim, step: Step): void {
  if (step.place !== null) placeQueen(g, s, step.place);
  for (const c of step.eliminate) s.alive[c] = 0;
}

/** Applies techniques up to `cap` until the board is solved, impossible, or no technique helps. */
function propagate(g: Geometry, s: Sim, cap: number): Outcome {
  for (let guard = 0; guard < 4 * g.n * g.n; guard++) {
    if (s.queens.length === g.n) return contradiction(g, s) ? "contradiction" : "solved";
    const step = nextStep(g, s, cap);
    if (step === "contradiction") return "contradiction";
    if (step === null) return "stuck";
    applyStep(g, s, step);
  }
  return "stuck";
}

function freshSim(g: Geometry): Sim {
  return { alive: new Uint8Array(g.n * g.n).fill(1), done: new Uint8Array(3 * g.n), queens: [] };
}

/** The board after the given queens are on it (every cell they rule out is no longer alive). */
function simWith(g: Geometry, queens: readonly number[]): Sim {
  const s = freshSim(g);
  for (const q of queens) placeQueen(g, s, q);
  return s;
}

export interface Rating {
  /** The deepest technique needed (1-5), or null if the techniques here cannot finish the puzzle. */
  level: number | null;
  /** The steps taken, in order. */
  steps: number;
}

/** Solves the puzzle the way a person would, simplest technique first, and reports the deepest one it needed. */
export function rate(board: Board, cap = MAX_LEVEL): Rating {
  const g = geometryOf(board);
  const s = freshSim(g);
  let level = 1;
  let steps = 0;
  while (s.queens.length < g.n) {
    const step = nextStep(g, s, cap);
    if (step === null || step === "contradiction") return { level: null, steps };
    level = Math.max(level, step.level);
    steps++;
    applyStep(g, s, step);
  }
  return { level, steps };
}

/** Whether techniques up to `cap` are enough to solve the puzzle. */
export const solvableWithin = (board: Board, cap: number): boolean => rate(board, cap).level !== null;

/**
 * The next logical step from a position holding the given (correct) queens: the simplest technique that crosses
 * something out the player has not crossed out already, or a single. `skip` lists the cells the player has already
 * crossed out, so a hint is never a step they have taken.
 */
export function hintStep(board: Board, queens: readonly number[], skip: ReadonlySet<number> = new Set()): { step: Step; queen: number | null } | null {
  const g = geometryOf(board);
  const s = simWith(g, queens);
  let firstUseful: Step | null = null;
  for (let guard = 0; guard < 4 * g.n * g.n && s.queens.length < g.n; guard++) {
    const step = nextStep(g, s, MAX_LEVEL);
    if (step === null || step === "contradiction") return null;
    const useful = step.place !== null || step.eliminate.some((c) => !skip.has(c));
    if (useful && firstUseful === null) firstUseful = step;
    applyStep(g, s, step);
    // The next forced queen: the first single reached from here.
    if (step.place !== null) return { step: firstUseful as Step, queen: step.place };
  }
  return null;
}
