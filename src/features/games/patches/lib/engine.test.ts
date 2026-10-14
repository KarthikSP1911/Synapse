import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seededRng, type Rng } from "@/lib/random";
import { DIFFICULTIES } from "@/features/games/shared/lib/puzzle-session";
import { GENERATION_NODES, PROFILES, generatePuzzle, sizeFor } from "./generator";
import { MAX_FREE_AREA, MIN_FREE_AREA, cellCount, clueIndexByCell, describeClue, formatPuzzle, parsePuzzle } from "./puzzle-format";
import { checkDraft, ownerMap, validateBoard } from "./rules";
import { boundingBox, fitsClue, fitsShape, isConnected, isRectangle, rectangleBetween, shapeOf } from "./shapes";
import { NODE_BUDGET, buildModel, hasUniqueSolution, rateLogic, solveModel, solvePuzzle } from "./solver";
import { PALETTE_SIZE, patchColors } from "./colors";
import type { Clue, PatchesPuzzle, Shape } from "./types";

const puzzle = (text: string): PatchesPuzzle => {
  const p = parsePuzzle(text);
  assert.ok(p, `not a puzzle: ${text}`);
  return p;
};

describe("the puzzle text format", () => {
  it("round-trips every kind of clue, in cell order", () => {
    const text = "6x6;0:4s,5,9:6w,14:6t,20:5f,25:3,30s,35";
    const p = puzzle(text);
    assert.equal(p.rows, 6);
    assert.deepEqual(p.clues[0], { cell: 0, area: 4, shape: "square" });
    assert.deepEqual(p.clues[1], { cell: 5, area: null, shape: null });
    assert.deepEqual(p.clues[4], { cell: 20, area: 5, shape: "free" });
    assert.deepEqual(p.clues[6], { cell: 30, area: null, shape: "square" });
    assert.equal(formatPuzzle(p), text);
    assert.equal(describeClue(p.clues[0]), "4 cells, a square");
    assert.equal(describeClue(p.clues[1]), "any rectangle");
    assert.equal(describeClue(p.clues[5]), "3 cells");
  });

  it("refuses anything that is not written the one way it is written", () => {
    const bad = [
      null,
      42,
      "",
      "6x6",
      "6x6;",
      "2x6;0",
      "11x6;0",
      "6x6;36", // off the board
      "6x6;5,0", // not in cell order
      "6x6;0,0", // twice
      "6x6;00", // leading zero
      "6x6;0:", // an area with no number
      "6x6;0:0", // no cells
      "6x6;0:37", // more than the board
      "6x6;0:5s", // 5 cells are no square
      "6x6;0:7w", // 7 cells fit no rectangle on a 6 x 6 board
      "6x6;0f", // a freeform clue shows its area
      "6x6;0:2f", // and it is at least three cells
      `6x6;0:${MAX_FREE_AREA + 1}f`,
      "6x6;0:4x",
      "6x6;0:30,1:30", // clues that cannot all fit
      "6x6;0 ,1",
      `6x6;${Array.from({ length: 4 }, () => "0").join(",")}`,
    ];
    for (const text of bad) assert.equal(parsePuzzle(text), null, String(text));
    assert.ok(parsePuzzle(`6x6;0:${MIN_FREE_AREA}f`));
    assert.ok(parsePuzzle(`6x6;0:${MAX_FREE_AREA}f`));
  });

  it("finds a clue by its cell", () => {
    const p = puzzle("3x3;0,4:3w,8");
    assert.deepEqual([...clueIndexByCell(p)], [0, -1, -1, -1, 1, -1, -1, -1, 2]);
    assert.equal(cellCount(p), 9);
  });
});

describe("shapes", () => {
  const cols = 5;
  it("tells rectangles, squares, wide and tall apart", () => {
    assert.equal(shapeOf([0], cols), "square");
    assert.equal(shapeOf([0, 1, 5, 6], cols), "square");
    assert.equal(shapeOf([0, 1, 2], cols), "wide");
    assert.equal(shapeOf([0, 1, 2, 5, 6, 7], cols), "wide");
    assert.equal(shapeOf([0, 5, 10], cols), "tall");
    assert.equal(shapeOf([0, 1, 5], cols), "free");
    assert.equal(shapeOf([0, 2], cols), "free", "a rectangle must be full");
  });

  it("knows what is connected: edges join cells, corners do not", () => {
    assert.ok(isConnected([0, 1, 6], cols));
    assert.ok(!isConnected([0, 6], cols));
    assert.ok(!isConnected([0, 4], cols), "the ends of a row are not neighbours");
    assert.ok(!isConnected([4, 5], cols), "the end of a row and the start of the next are not neighbours");
    assert.ok(!isConnected([], cols));
    assert.ok(isRectangle([0, 1, 5, 6], cols));
    assert.ok(!isRectangle([0, 1, 5], cols));
  });

  it("measures boxes and rectangles between corners from either direction", () => {
    assert.deepEqual(boundingBox([6, 7, 11], cols), { r0: 1, c0: 1, r1: 2, c1: 2, h: 2, w: 2 });
    assert.deepEqual(rectangleBetween(6, 13, cols), [6, 7, 8, 11, 12, 13]);
    assert.deepEqual(rectangleBetween(13, 6, cols), rectangleBetween(6, 13, cols));
    assert.deepEqual(rectangleBetween(7, 7, cols), [7]);
    assert.equal(rectangleBetween(4, 10, cols).length, 15, "opposite corners of three full rows");
  });

  it("applies a clue's area and shape together", () => {
    const four: Pick<Clue, "area" | "shape"> = { area: 4, shape: "square" };
    assert.ok(fitsClue(four, [0, 1, 5, 6], cols));
    assert.ok(!fitsClue(four, [0, 1, 2, 3], cols));
    assert.ok(!fitsClue(four, [0, 1, 5], cols));
    assert.ok(fitsClue({ area: 4, shape: null }, [0, 1, 2, 3], cols), "an area alone takes any rectangle");
    assert.ok(!fitsClue({ area: 4, shape: null }, [0, 1, 5, 10], cols), "but not a bent shape");
    assert.ok(fitsClue({ area: 4, shape: "free" }, [0, 1, 5, 10], cols));
    assert.ok(fitsClue({ area: 4, shape: "free" }, [0, 1, 5, 6], cols), "freeform takes a rectangle too");
    assert.ok(fitsClue({ area: null, shape: "free" }, [0, 1, 5, 10, 15], cols));
    assert.ok(fitsClue({ area: null, shape: null }, [0], cols));
    assert.ok(fitsShape("wide", [0, 1], cols) && !fitsShape("tall", [0, 1], cols));
  });
});

// ---------------------------------------------------------------------------
// The solver against a brute force that shares none of its code
// ---------------------------------------------------------------------------

/** Every way to divide the board, by trying all subsets of cells. Only for boards of up to 16 cells. */
function bruteForce(p: PatchesPuzzle): { count: number; candidates: string[][] } {
  const n = cellCount(p);
  const clueAt = clueIndexByCell(p);
  const candidates: string[][] = p.clues.map(() => []);
  const masks: { clue: number; mask: number }[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const cells: number[] = [];
    let clue = -1;
    let clues = 0;
    for (let c = 0; c < n; c++) {
      if (mask & (1 << c)) {
        cells.push(c);
        if (clueAt[c] >= 0) {
          clues++;
          clue = clueAt[c];
        }
      }
    }
    if (clues !== 1 || !isConnected(cells, p.cols) || !fitsClue(p.clues[clue], cells, p.cols)) continue;
    masks.push({ clue, mask });
    candidates[clue].push(cells.join(","));
  }
  const full = (1 << n) - 1;
  const count = (covered: number, used: number): number => {
    if (covered === full) return used === (1 << p.clues.length) - 1 ? 1 : 0;
    let first = 0;
    while (covered & (1 << first)) first++;
    let total = 0;
    for (const m of masks) {
      if ((m.mask & (1 << first)) !== 0 && (m.mask & covered) === 0 && (used & (1 << m.clue)) === 0) total += count(covered | m.mask, used | (1 << m.clue));
    }
    return total;
  };
  return { count: count(0, 0), candidates: candidates.map((list) => list.sort()) };
}

/** A random board with random clues derived from a random division of it, so that most have at least one solution. */
function randomPuzzle(rng: Rng, rows: number, cols: number): PatchesPuzzle {
  const taken = new Uint8Array(rows * cols);
  const clues: Clue[] = [];
  for (let start = 0; start < rows * cols; start++) {
    if (taken[start]) continue;
    const r = Math.floor(start / cols);
    const c = start % cols;
    let h = 1 + Math.floor(rng() * 2);
    let w = 1 + Math.floor(rng() * 3);
    h = Math.min(h, rows - r);
    w = Math.min(w, cols - c);
    const cells: number[] = [];
    for (;;) {
      cells.length = 0;
      let free = true;
      for (let rr = r; rr < r + h && free; rr++) {
        for (let cc = c; cc < c + w; cc++) {
          if (taken[rr * cols + cc]) free = false;
          else cells.push(rr * cols + cc);
        }
      }
      if (free) break;
      if (w > 1) w--;
      else h--;
    }
    for (const cell of cells) taken[cell] = 1;
    const clueCell = cells[Math.floor(rng() * cells.length)];
    const shape = shapeOf(cells, cols);
    const mode = Math.floor(rng() * 4);
    // A freeform clue is sometimes written on a rectangle of three cells or more, which it also allows.
    const asFree = cells.length >= MIN_FREE_AREA && rng() < 0.25;
    clues.push({
      cell: clueCell,
      area: asFree || mode === 0 || mode === 1 ? cells.length : null,
      shape: asFree ? "free" : mode === 0 || mode === 2 ? shape : null,
    });
  }
  return { rows, cols, clues: clues.sort((a, b) => a.cell - b.cell) };
}

describe("the solver", () => {
  it("agrees with brute force on candidates and on how many solutions there are", () => {
    const rng = seededRng(2024);
    const seen = new Set<number>();
    for (let i = 0; i < 160; i++) {
      const [rows, cols] = i % 8 === 0 ? [4, 4] : i % 2 === 0 ? [3, 4] : [4, 3];
      const p = randomPuzzle(rng, rows, cols);
      const text = formatPuzzle(p);
      const brute = bruteForce(p);
      const model = buildModel(p);
      assert.ok(model, text);
      assert.deepEqual(
        model.cands.map((list) => list.map((c) => c.cells.join(",")).sort()),
        brute.candidates,
        `candidates of ${text}`
      );
      const result = solveModel(model, { limit: 100_000, budget: NODE_BUDGET });
      assert.equal(result.exceeded, false, text);
      assert.equal(result.count, brute.count, `solutions of ${text}`);
      seen.add(Math.min(result.count, 3));
    }
    assert.ok(seen.has(1) && seen.has(3), "the sample holds unique and ambiguous puzzles");
  });

  it("counts a puzzle with no solution as none, and fixtures solved by hand as one", () => {
    // Two 2-cell clues leave most of the board with no patch to belong to.
    assert.equal(solvePuzzle(puzzle("3x3;0:2,1:2")).count, 0);
    // A 2 x 2 square, a tall domino and a wide row can only be placed one way.
    const solved = solvePuzzle(puzzle("3x3;0:4s,2:2t,6:3w"));
    assert.equal(solved.count, 1);
    assert.deepEqual(solved.first, [0, 0, 1, 0, 0, 1, 2, 2, 2]);
    assert.equal(solved.byDeduction, true);
    assert.ok(hasUniqueSolution(puzzle("3x3;0:3w,3:3w,6:3w")));
    assert.equal(solvePuzzle(puzzle("3x3;0:3w,3:3w,6:3w")).first?.join(""), "000111222");
  });

  it("finds more than one solution when the clues say too little", () => {
    // Two blank clues in opposite corners can split a 3 x 3 board four ways.
    const p = puzzle("3x3;0,8");
    assert.equal(solvePuzzle(p, { limit: 100 }).count, 4);
    const two = solvePuzzle(p);
    assert.equal(two.count, 2, "counting stops at the limit");
    assert.notDeepEqual(two.first, two.second);
    assert.ok(!hasUniqueSolution(p));
  });

  it("enumerates freeform shapes exactly once each", () => {
    // Fixed polyominoes through a cell in the middle of a board with room to spare (11 x 11): 4 x 19 tetrominoes, 5 x 63 pentominoes.
    for (const [area, expected] of [
      [3, 3 * 6],
      [4, 4 * 19],
      [5, 5 * 63],
      [6, 6 * 216],
    ] as const) {
      const model = buildModel({ rows: 11, cols: 11, clues: [{ cell: 60, area, shape: "free" }] });
      assert.ok(model);
      assert.equal(model.cands[0].length, expected, `area ${area}`);
      const keys = new Set(model.cands[0].map((c) => c.cells.join(",")));
      assert.equal(keys.size, expected, "no shape is listed twice");
      for (const c of model.cands[0]) assert.ok(isConnected(c.cells, 11) && c.cells.length === area && c.cells.includes(60));
    }
  });

  it("keeps other clues out of a candidate, and refuses to enumerate an unbounded one", () => {
    const model = buildModel(puzzle("4x4;0:4s,5,10:6f"));
    assert.ok(model);
    for (const list of model.cands) for (const c of list) assert.equal(c.cells.filter((cell) => [0, 5, 10].includes(cell)).length, 1);
    assert.equal(buildModel({ rows: 6, cols: 6, clues: [{ cell: 0, area: null, shape: "free" }] }), null);
    assert.equal(buildModel({ rows: 9, cols: 9, clues: [{ cell: 40, area: 8, shape: "free" }] }, 100), null, "over the candidate bound");
    assert.equal(solvePuzzle({ rows: 9, cols: 9, clues: [{ cell: 40, area: 8, shape: "free" }, { cell: 0, area: 8, shape: "free" }, { cell: 80, area: 8, shape: "free" }, { cell: 8, area: 8, shape: "free" }, { cell: 72, area: 8, shape: "free" }] }, { budget: 5 }).exceeded, true);
  });

  it("stops at the node budget and says so", () => {
    const result = solvePuzzle(puzzle("5x5;0,2,4,6,8,10,12,14,16,18,20,22,24"), { budget: 3 });
    assert.equal(result.exceeded, true);
  });

  it("rates how a puzzle has to be solved", () => {
    const easy = buildModel(puzzle("3x3;0:3w,3:3w,6:3w"))!;
    assert.deepEqual(rateLogic(easy), { level: 1, lookaheads: 0, rounds: 0 });
    const ambiguous = rateLogic(buildModel(puzzle("3x3;0,8"))!);
    assert.equal(ambiguous?.level, 3, "several solutions cannot be reached by logic alone");
    // 5 x 5 with a clue that only a lookahead settles is covered by the generated Hard and Expert puzzles below.
  });
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

describe("drawing a patch", () => {
  // 5 x 5: a 2 x 2 square clue, a wide 6, a tall 4, a freeform 5 and an unrestricted clue.
  const p = puzzle("5x5;0:4s,2:6w,10:4t,14:5f,24");
  const none = new Int16Array(25).fill(-1);
  const reason = (cells: number[], owner: Int16Array = none) => checkDraft(p, owner, cells).reason;

  it("accepts a patch that fits its clue exactly", () => {
    assert.equal(checkDraft(p, none, [0, 1, 5, 6]).ok, true);
    assert.equal(checkDraft(p, none, [0, 1, 5, 6]).clue, 0);
    assert.equal(reason([2, 3, 4, 7, 8, 9]), null, "a wide 2 x 3");
    assert.equal(reason([5, 10, 15, 20]), null, "a tall 4 x 1");
  });

  it("says why a patch is refused", () => {
    assert.equal(reason([]), "empty");
    assert.equal(reason([1, 6]), "no-clue");
    assert.equal(reason([0, 1, 2, 5, 6, 7]), "many-clues", "covers the 2 x 2 clue and the wide clue");
    assert.equal(reason([0, 6]), "disconnected", "corners do not join cells");
    assert.equal(reason([10, 11, 15, 16]), "shape", "a square where a tall rectangle is asked");
    assert.equal(reason([10, 15, 20, 21]), "shape", "bent");
    assert.equal(reason([10, 15, 20]), "area", "a tall rectangle, but of 3 cells");
    assert.equal(reason([0, 1, 5]), "shape", "an L is no rectangle");
    assert.equal(reason([0, 1]), "shape", "wide where a square is asked");
    assert.equal(reason([14, 13]), "area");
    const owned = new Int16Array(25).fill(-1);
    owned[1] = 3;
    assert.equal(reason([0, 1, 5, 6], owned), "overlap");
  });

  it("explains in words, naming the clue by its place", () => {
    assert.match(checkDraft(p, none, [0, 1]).message, /square/);
    assert.match(checkDraft(p, none, [10, 15, 20]).message, /needs 4 cells, but this patch has 3/);
    assert.match(checkDraft(p, none, [10, 15, 20]).message, /row 3, column 1/);
    assert.match(checkDraft(p, none, [1]).message, /exactly one clue/);
  });

  it("takes a freeform shape for a freeform clue and any rectangle for a blank one", () => {
    assert.equal(checkDraft(p, none, [14, 19, 18, 13, 12]).ok, true, "five connected cells, bent");
    assert.equal(checkDraft(p, none, [14, 9, 4, 3, 8]).ok, true, "or one that wanders up the side");
    assert.equal(reason([14, 9, 4, 3, 2]), "many-clues", "this one reaches the wide clue");
    assert.equal(checkDraft(p, none, [24]).ok, true, "a blank clue may be a single cell");
    assert.equal(checkDraft(p, none, [19, 24]).ok, true, "or a domino");
    assert.equal(checkDraft(p, none, [18, 19, 23, 24]).ok, true);
    assert.equal(reason([19, 24, 23]), "shape", "but not bent");
  });

  it("maps patches to the cells they own", () => {
    assert.deepEqual([...ownerMap([{ clue: 1, cells: [2, 3] }], 5)], [-1, -1, 1, 1, -1]);
  });
});

describe("a whole board", () => {
  const p = puzzle("3x3;0:3w,3:3w,6:3w");
  const rows = [
    { clue: 0, cells: [0, 1, 2] },
    { clue: 1, cells: [3, 4, 5] },
    { clue: 2, cells: [6, 7, 8] },
  ];

  it("is solved only when every cell is covered by valid patches, one per clue", () => {
    assert.equal(validateBoard(p, rows).solved, true);
    assert.equal(validateBoard(p, rows.slice(0, 2)).solved, false);
    assert.equal(validateBoard(p, rows.slice(0, 2)).uncovered, 3);
    assert.equal(validateBoard(p, []).uncovered, 9);
  });

  it("is not solved by patches that overlap, repeat a clue or break their clue", () => {
    assert.equal(validateBoard(p, [...rows, { clue: 0, cells: [0, 1, 2] }]).solved, false);
    assert.equal(validateBoard(p, [{ clue: 0, cells: [0, 3, 6] }, rows[1], rows[2]]).solved, false);
    assert.equal(validateBoard(p, [{ clue: 1, cells: [0, 1, 2] }, rows[1], rows[2]]).solved, false, "filed under the wrong clue");
    assert.ok(validateBoard(p, [{ clue: 0, cells: [0, 1] }, rows[1], rows[2]]).problems.length > 0);
  });
});

describe("colours", () => {
  it("never give touching patches of the solution the same colour", () => {
    const colors = patchColors([0, 0, 0, 1, 1, 1, 2, 2, 2], 3, 3, 3);
    assert.notEqual(colors[0], colors[1]);
    assert.notEqual(colors[1], colors[2]);
    assert.ok(colors.every((c) => c >= 0 && c < PALETTE_SIZE));
  });

  it("hold on generated boards", () => {
    for (const difficulty of DIFFICULTIES) {
      const generated = generatePuzzle(difficulty, seededRng(11), undefined, undefined, true);
      const p = puzzle(generated.puzzle);
      const colors = patchColors(generated.solution, p.clues.length, p.rows, p.cols);
      for (let r = 0; r < p.rows; r++) {
        for (let c = 0; c < p.cols; c++) {
          const a = generated.solution[r * p.cols + c];
          for (const b of [c + 1 < p.cols ? generated.solution[r * p.cols + c + 1] : a, r + 1 < p.rows ? generated.solution[(r + 1) * p.cols + c] : a]) {
            if (a !== b) assert.notEqual(colors[a], colors[b], `${difficulty}: neighbouring patches share a colour`);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

describe("generated puzzles", () => {
  const cases: { difficulty: (typeof DIFFICULTIES)[number]; larger: boolean; seed: number }[] = [];
  for (const difficulty of DIFFICULTIES) for (const larger of [false, true]) for (const seed of [3, 4]) cases.push({ difficulty, larger, seed });

  for (const { difficulty, larger, seed } of cases) {
    it(`builds a valid ${larger ? "larger " : ""}${difficulty} puzzle (seed ${seed})`, () => {
      const generated = generatePuzzle(difficulty, seededRng(seed * 977), undefined, undefined, larger);
      const p = puzzle(generated.puzzle);
      const profile = PROFILES[difficulty];
      const side = sizeFor(difficulty, larger);
      assert.equal(p.rows, side);
      assert.equal(p.cols, side);
      assert.equal(formatPuzzle(p), generated.puzzle, "one text form");

      // The stored solution is a real division of the board: every cell in exactly one patch with exactly one clue, meeting its clue.
      assert.equal(generated.solution.length, cellCount(p));
      const patches = p.clues.map((clue, index) => ({ clue: index, cells: generated.solution.flatMap((owner, cell) => (owner === index ? [cell] : [])) }));
      const board = validateBoard(p, patches);
      assert.deepEqual(board.problems, []);
      assert.equal(board.solved, true);
      for (const patch of patches) {
        const clue = p.clues[patch.clue];
        assert.ok(patch.cells.includes(clue.cell), "the clue sits in its own patch");
        assert.ok(isConnected(patch.cells, p.cols), "connected");
        assert.ok(fitsClue(clue, patch.cells, p.cols), "area and shape match the clue");
        if (clue.shape === "free") assert.ok(!isRectangle(patch.cells, p.cols), "a freeform clue is only put on a bent shape");
      }

      // Exactly one solution, found within the budgets, and it is the stored one.
      const result = solvePuzzle(p, { budget: GENERATION_NODES });
      assert.equal(result.exceeded, false);
      assert.equal(result.count, 1);
      assert.deepEqual(result.first, generated.solution);
      assert.ok(result.nodes <= GENERATION_NODES && GENERATION_NODES < NODE_BUDGET);

      // The level's character.
      const free = p.clues.filter((c) => c.shape === "free").length;
      assert.ok(free >= profile.free[0] && free <= profile.free[1], `${free} freeform clues`);
      for (const clue of p.clues) if (clue.shape === "free") assert.ok(clue.area !== null && clue.area >= profile.freeArea[0] && clue.area <= profile.freeArea[1]);
      if (difficulty === "easy") assert.ok(p.clues.every((c) => c.area !== null), "Easy shows every area");
      const model = buildModel(p)!;
      const logic = rateLogic(model);
      assert.ok(logic && logic.level <= profile.maxLevel, `needs more logic than ${difficulty} allows`);
    });
  }

  it("is repeatable for a seed and varies between seeds", () => {
    const a = generatePuzzle("medium", seededRng(5)).puzzle;
    assert.equal(generatePuzzle("medium", seededRng(5)).puzzle, a);
    assert.notEqual(generatePuzzle("medium", seededRng(6)).puzzle, a);
  });

  it("gives up with an error when the budget is nothing", () => {
    assert.throws(() => generatePuzzle("expert", seededRng(1), { maxAttempts: 0, maxMs: 1000 }), /No expert Patches puzzle/);
  });

  it("leaves harder levels with less written on their clues", () => {
    const written = (difficulty: (typeof DIFFICULTIES)[number]) => {
      let said = 0;
      let clues = 0;
      for (let seed = 1; seed <= 6; seed++) {
        for (const clue of puzzle(generatePuzzle(difficulty, seededRng(seed * 31)).puzzle).clues) {
          clues++;
          said += (clue.area !== null ? 1 : 0) + (clue.shape !== null ? 1 : 0);
        }
      }
      return said / clues;
    };
    assert.ok(written("easy") > written("medium"), "Medium says less than Easy");
    assert.ok(written("medium") > written("expert"), "Expert says less than Medium");
  });

  it("uses every kind of clue across the levels", () => {
    const kinds = new Set<string>();
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 6; seed++) {
        for (const clue of puzzle(generatePuzzle(difficulty, seededRng(seed * 17), undefined, undefined, seed % 2 === 0).puzzle).clues) {
          kinds.add(`${clue.area === null ? "-" : "area"}/${clue.shape ?? "-"}`);
        }
      }
    }
    for (const kind of ["area/-", "area/square", "-/square", "area/free", "-/-"] as const) assert.ok(kinds.has(kind), `no ${kind} clue was ever generated`);
    for (const shape of ["square", "wide", "tall", "free"] as Shape[]) assert.ok([...kinds].some((k) => k.endsWith(`/${shape}`)), `no ${shape} clue`);
  });
});
