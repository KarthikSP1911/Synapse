import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { seededRng } from "@/lib/random";
import { DIFFICULTIES } from "@/features/games/shared/lib/puzzle-session";
import { advance, canStep, explain, isComplete as pathComplete, lastNumberOpen, nextNumber, reach, rulesOf, validatePath } from "./draw";
import { cellsAlong, pointToCell, samplePoints, type BoardRect } from "@/features/games/shared/lib/board-geometry";
import { GENERATION_NODES, GenerationError, PROFILES, generatePuzzle } from "./generator";
import {
  MAX_HISTORY,
  beginStroke,
  clearPath,
  dragTo,
  elapsedAt,
  endStroke,
  freezeForStorage,
  giveHint,
  hasProgress,
  isComplete,
  newGame,
  nextCheckpoint,
  pauseGame,
  redo,
  refusal,
  remaining,
  restartGame,
  resumeGame,
  stepTo,
  toSessionData,
  undo,
} from "./game";
import { randomHamiltonianPath } from "./path";
import { MAX_CELLS, cellCount, formatPuzzle, isAdjacent, numbersOf, openNeighbors, parsePuzzle, wallKey } from "./puzzle-format";
import { MIN_MS_PER_CELL, parseSessionData } from "./records";
import { BASE_POINTS, PAR_MS, scoreGame } from "./scoring";
import { NODE_BUDGET, hasUniqueSolution, solvePuzzle } from "./solver";
import { computeStats } from "./stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, parseGame, saveDifficulty, saveGame, saveSession, saveSettings } from "./storage";
import { DEFAULT_SETTINGS, type GameState, type Puzzle, type SessionData, type ZipPuzzle } from "./types";

/** Puzzles frozen from `generatePuzzle(d, seededRng(seed))`; each is checked below, not trusted. */
const EASY: Puzzle = { difficulty: "easy", puzzle: "5x5;c:8,12,7,1,19,23,17,16,11,20;w:", solution: [8, 13, 12, 7, 6, 5, 0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 18, 17, 22, 21, 16, 11, 10, 15, 20] };
const MEDIUM: Puzzle = {
  difficulty: "medium",
  puzzle: "6x6;c:12,4,16,10,29,27,25,8,13,18;w:22-28",
  solution: [12, 6, 0, 1, 2, 3, 4, 5, 11, 17, 16, 10, 9, 15, 21, 22, 23, 29, 35, 34, 28, 27, 33, 32, 31, 30, 24, 25, 26, 20, 14, 8, 7, 13, 19, 18],
};
const HARD: Puzzle = {
  difficulty: "hard",
  puzzle: "7x7;c:22,9,18,10,39,28,29,38;w:7-8,26-33,29-30,30-31,33-34",
  solution: [22, 21, 14, 7, 0, 1, 2, 9, 8, 15, 16, 17, 18, 25, 26, 19, 12, 11, 10, 3, 4, 5, 6, 13, 20, 27, 34, 41, 48, 47, 40, 33, 32, 39, 46, 45, 44, 43, 42, 35, 28, 29, 36, 37, 30, 23, 24, 31, 38],
};
const EXPERT: Puzzle = {
  difficulty: "expert",
  puzzle: "8x8;c:49,53,56,42,24,27,54,11,38;w:1-2,13-14,19-20,21-22,22-30,29-37,40-41,43-51",
  solution: [49, 50, 51, 52, 53, 61, 60, 59, 58, 57, 56, 48, 40, 32, 33, 41, 42, 34, 26, 25, 24, 16, 8, 0, 1, 9, 17, 18, 19, 27, 35, 43, 44, 36, 37, 45, 46, 54, 62, 63, 55, 47, 39, 31, 23, 22, 14, 15, 7, 6, 5, 4, 3, 2, 10, 11, 12, 13, 21, 20, 28, 29, 30, 38],
};
const ALL = [EASY, MEDIUM, HARD, EXPERT];

const T0 = 1_700_000_000_000;
const fresh = (p: Puzzle = EASY): GameState => newGame(p, "client-0001", T0);
const zp = (p: Puzzle): ZipPuzzle => parsePuzzle(p.puzzle) as ZipPuzzle;

/** Draws `cells` as one stroke (press on the first, drag through the rest, release). */
function draw(state: GameState, cells: readonly number[], now = T0 + 100): GameState {
  let g = beginStroke(state, cells[0], now).state;
  for (const c of cells.slice(1)) g = dragTo(g, c, now).state;
  return endStroke(g);
}

/** A game with the whole solution drawn except its last `left` cells. */
const almost = (p: Puzzle, left: number): GameState => draw(fresh(p), p.solution.slice(0, p.solution.length - left));

describe("puzzle text", () => {
  it("round-trips every fixture and writes walls in order", () => {
    for (const p of ALL) assert.equal(formatPuzzle(zp(p)), p.puzzle);
    assert.equal(formatPuzzle({ rows: 3, cols: 3, checkpoints: [0, 8], walls: ["4-5", "1-2"] }), "3x3;c:0,8;w:1-2,4-5");
  });

  it("rejects anything that is not a well-formed puzzle", () => {
    const bad = (s: unknown) => assert.equal(parsePuzzle(s), null, String(s));
    bad(null);
    bad(5);
    bad("");
    bad("3x3;c:0,8");
    bad("3x3;c:0,8;w:x");
    bad("2x3;c:0,5;w:", );
    bad("9x9;c:0,80;w:");
    bad("3x3;c:0;w:");
    bad("3x3;c:0,9;w:");
    bad("3x3;c:0,0;w:");
    bad("3x3;c:0,8;w:1-3");
    bad("3x3;c:0,8;w:2-3");
    bad("3x3;c:0,8;w:3-1");
    bad("3x3;c:0,8;w:1-2,1-2");
    bad("3x3;c:0,8;w:4-5,1-2");
    bad("3x3;c:0,8;w:1-9");
    bad("3x3;c:0,,8;w:");
    bad("3x3;c:0,8;w:" + "1-2,".repeat(3) + "2-3");
    bad(`3x3;c:0,8;w:;extra`);
    bad(`${"3x3;c:0,8;w:"}${"x".repeat(600)}`);
  });

  it("knows which cells are neighbours (no wrapping between rows)", () => {
    assert.equal(isAdjacent(4, 5, 5), false);
    assert.equal(isAdjacent(4, 9, 5), true);
    assert.equal(isAdjacent(6, 7, 5), true);
    assert.equal(isAdjacent(6, 12, 5), false);
    assert.equal(wallKey(5, 4), "4-5");
    assert.equal(wallKey(4, 5), "4-5");
  });

  it("numbers the checkpoints and lists the ways out of a cell, walls excluded", () => {
    const numbers = numbersOf(zp(MEDIUM));
    assert.equal(numbers[12], 1);
    assert.equal(numbers[18], 10);
    assert.equal(numbers[0], 0);
    const puzzle = zp(MEDIUM);
    assert.deepEqual(openNeighbors(puzzle, 22).sort((a, b) => a - b), [16, 21, 23]);
    assert.deepEqual(openNeighbors(puzzle, 28).sort((a, b) => a - b), [27, 29, 34]);
    assert.deepEqual(openNeighbors(puzzle, 0).sort((a, b) => a - b), [1, 6]);
    assert.equal(cellCount(puzzle), 36);
  });
});

describe("random paths", () => {
  it("visit every cell exactly once, one orthogonal step at a time", () => {
    for (const [rows, cols] of [[3, 3], [4, 5], [5, 5], [8, 8]]) {
      for (const seed of [1, 2, 3, 4]) {
        const path = randomHamiltonianPath(rows, cols, seededRng(seed));
        assert.equal(path.length, rows * cols);
        assert.equal(new Set(path).size, rows * cols);
        for (let i = 1; i < path.length; i++) assert.ok(isAdjacent(path[i - 1], path[i], cols), `${rows}x${cols} #${seed} step ${i}`);
      }
    }
  });

  it("are repeatable for a seed and differ across seeds", () => {
    assert.deepEqual(randomHamiltonianPath(6, 6, seededRng(9)), randomHamiltonianPath(6, 6, seededRng(9)));
    assert.notDeepEqual(randomHamiltonianPath(6, 6, seededRng(9)), randomHamiltonianPath(6, 6, seededRng(10)));
  });
});

describe("solver", () => {
  it("finds exactly one solution for each fixture, and it is the stored one", () => {
    for (const p of ALL) {
      const result = solvePuzzle(zp(p));
      assert.equal(result.count, 1, p.difficulty);
      assert.equal(result.exceeded, false);
      assert.deepEqual(result.first, p.solution);
      assert.ok(hasUniqueSolution(zp(p)));
    }
  });

  it("finds several solutions on an open board, and counts no further than the limit", () => {
    const open: ZipPuzzle = { rows: 3, cols: 3, checkpoints: [0, 8], walls: [] };
    assert.equal(solvePuzzle(open).count, 2);
    assert.equal(solvePuzzle(open, { limit: 1 }).count, 1);
    assert.equal(solvePuzzle(open, { limit: 10 }).count, 2, "a 3x3 board has exactly two corner-to-corner routes: along the rows and along the columns");
    assert.equal(hasUniqueSolution(open), false);
  });

  it("finds none when the board cannot be covered", () => {
    // 3x3 squares alternate colours 5 to 4: a path over all 9 starts and ends on the majority colour; cell 1 has the other.
    const impossible: ZipPuzzle = { rows: 3, cols: 3, checkpoints: [0, 1], walls: [] };
    assert.equal(solvePuzzle(impossible).count, 0);
    // A wall that cuts the board in two leaves no path either.
    const cut: ZipPuzzle = { rows: 3, cols: 3, checkpoints: [0, 8], walls: ["0-1", "0-3"] };
    assert.equal(solvePuzzle(cut).count, 0);
  });

  it("respects walls and the order of the numbers", () => {
    // Walls turn the open 3x3 into one with a single route.
    const walled: ZipPuzzle = { rows: 3, cols: 3, checkpoints: [0, 8], walls: ["1-4", "3-4", "5-8"] };
    const r = solvePuzzle(walled);
    for (const solution of [r.first, r.second]) {
      if (!solution) continue;
      for (let i = 1; i < solution.length; i++) assert.equal(walled.walls.includes(wallKey(solution[i - 1], solution[i])), false);
    }
    // Numbers must be reached in order: 1 at a corner, 3 reached before 2 cannot count.
    const ordered: ZipPuzzle = { rows: 3, cols: 3, checkpoints: [0, 2, 8], walls: [] };
    const found = solvePuzzle(ordered, { limit: 50 });
    assert.ok(found.count > 0);
    assert.equal(found.first![0], 0);
    assert.equal(found.first![8], 8);
    assert.ok(found.first!.indexOf(2) < found.first!.indexOf(8));
  });

  it("reports when its budget ran out instead of guessing, and is deterministic", () => {
    const cut = solvePuzzle(zp(EXPERT), { budget: 5 });
    assert.equal(cut.exceeded, true);
    assert.ok(cut.nodes > 5 && cut.nodes <= 6);
    assert.equal(hasUniqueSolution(zp(EXPERT), 5), false);
    const a = solvePuzzle(zp(HARD));
    const b = solvePuzzle(zp(HARD));
    assert.equal(a.nodes, b.nodes);
    assert.ok(a.nodes <= NODE_BUDGET);
  });

  it("settles every fixture well inside the budget", () => {
    for (const p of ALL) assert.ok(solvePuzzle(zp(p)).nodes <= GENERATION_NODES, p.difficulty);
  });
});

describe("drawing rules", () => {
  const easy = rulesOf(zp(EASY));
  const medium = rulesOf(zp(MEDIUM));

  it("starts only on checkpoint 1", () => {
    assert.deepEqual(canStep(easy, [], 8), { ok: true });
    assert.deepEqual(canStep(easy, [], 12), { ok: false, reason: "start" });
    assert.deepEqual(canStep(easy, [], 0), { ok: false, reason: "start" });
  });

  it("moves only to orthogonal neighbours: no diagonals, no jumps, no wrapping", () => {
    assert.deepEqual(canStep(easy, [8], 13), { ok: true });
    assert.deepEqual(canStep(easy, [8], 2), { ok: false, reason: "far" }, "diagonal");
    assert.deepEqual(canStep(easy, [8], 6), { ok: false, reason: "far" }, "two away");
    assert.deepEqual(canStep(easy, [4], 5), { ok: false, reason: "far" }, "end of a row to the start of the next");
  });

  it("will not cross a wall, in either direction, or enter a cell twice", () => {
    assert.deepEqual(canStep(medium, [22], 28), { ok: false, reason: "wall" });
    assert.deepEqual(canStep(medium, [28], 22), { ok: false, reason: "wall" });
    assert.deepEqual(canStep(medium, [22], 23), { ok: true });
    assert.deepEqual(canStep(easy, [8, 13, 12], 13), { ok: false, reason: "visited" });
  });

  it("reaches the numbers in order", () => {
    // 12 holds the number 2 and 7 the number 3 on the easy board.
    assert.deepEqual(canStep(easy, [8, 13], 12), { ok: true });
    assert.deepEqual(canStep(easy, [8, 3], 2), { ok: true });
    assert.deepEqual(canStep(easy, [8, 3, 2], 7), { ok: false, reason: "order" });
    assert.equal(nextNumber(easy, [8]), 2);
    assert.equal(nextNumber(easy, [8, 13, 12]), 3);
  });

  it("opens the last number only once every other cell is covered", () => {
    const path = EASY.solution.slice(0, -1);
    assert.equal(lastNumberOpen(easy, path), true);
    assert.deepEqual(canStep(easy, path, 20), { ok: true });
    // One cell early: 20 is a neighbour of 15 and 21, but the path is not yet full.
    const early = EASY.solution.slice(0, -2);
    assert.deepEqual(canStep(easy, [...early.slice(0, -1), 21], 20), { ok: false, reason: "last" });
    assert.equal(lastNumberOpen(easy, early), false);
    assert.match(explain("last", easy, early), /every other square/);
  });

  it("never blocks the real solution of any puzzle (the last-number rule cannot make a dead end)", () => {
    for (const p of ALL) {
      const rules = rulesOf(zp(p));
      assert.ok(validatePath(rules, p.solution), p.difficulty);
      assert.ok(pathComplete(rules, p.solution), p.difficulty);
      // Each prefix of the solution can be extended by the next cell.
      for (let i = 0; i < p.solution.length; i++) assert.deepEqual(canStep(rules, p.solution.slice(0, i), p.solution[i]), { ok: true }, `${p.difficulty} step ${i}`);
    }
  });

  it("extends by one step, erases back onto an earlier cell, and leaves illegal moves alone", () => {
    assert.deepEqual(advance(easy, [8], 13), [8, 13]);
    const path = [8, 13, 12, 7];
    assert.deepEqual(advance(easy, path, 12), [8, 13, 12], "back one step");
    assert.deepEqual(advance(easy, path, 8), [8], "back to the start, which stays");
    assert.equal(advance(easy, path, 7), path, "the head: nothing changes");
    assert.equal(advance(easy, path, 24), path, "far away: nothing changes");
  });

  it("fills in the cells a fast drag skipped, and cuts a corner by the shorter legal route", () => {
    assert.deepEqual(reach(easy, [8], 2), [8, 3, 2], "diagonal: through the plain cell, not the numbered one");
    assert.deepEqual(reach(easy, [8], 18), [8, 13, 18]);
    assert.deepEqual(reach(easy, [8, 13], 8), [8], "an earlier cell erases");
    assert.deepEqual(reach(easy, [8], 24), [8], "too far to be a drag artefact");
    assert.deepEqual(reach(easy, [], 8), [8]);
    assert.deepEqual(reach(easy, [], 3), []);
  });

  it("accepts only a complete correct path", () => {
    assert.equal(pathComplete(easy, EASY.solution), true);
    assert.equal(pathComplete(easy, EASY.solution.slice(0, -1)), false, "all but the last cell");
    assert.equal(pathComplete(easy, []), false);
    const swapped = EASY.solution.slice();
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    assert.equal(pathComplete(easy, swapped), false, "two cells swapped");
    assert.equal(pathComplete(easy, [...EASY.solution.slice(0, -1), 99]), false);
    const reversed = EASY.solution.slice().reverse();
    assert.equal(pathComplete(easy, reversed), false, "must start on 1");
    assert.equal(validatePath(easy, [8, 8]), false);
    assert.equal(validatePath(easy, [8, 2]), false);
    assert.equal(validatePath(easy, [1.5]), false);
  });

  it("describes every refusal", () => {
    for (const reason of ["start", "far", "wall", "visited", "order", "last"] as const) assert.ok(explain(reason, easy, [8]).length > 10, reason);
  });
});

describe("pointer geometry", () => {
  const rect: BoardRect = { left: 100, top: 50, width: 500, height: 500, rows: 5, cols: 5 };
  const centre = (cell: number): [number, number] => [rect.left + ((cell % 5) + 0.5) * 100, rect.top + (Math.floor(cell / 5) + 0.5) * 100];

  it("maps a point to its cell, and nothing outside the board", () => {
    assert.equal(pointToCell(rect, ...centre(0)), 0);
    assert.equal(pointToCell(rect, ...centre(12)), 12);
    assert.equal(pointToCell(rect, ...centre(24)), 24);
    assert.equal(pointToCell(rect, 99, 100), null);
    assert.equal(pointToCell(rect, 300, 49), null);
    assert.equal(pointToCell(rect, 600, 100), null);
  });

  it("treats the rim between cells as no cell at all", () => {
    assert.equal(pointToCell(rect, 200, 100 + 50), null, "exactly on a vertical edge");
    assert.equal(pointToCell(rect, 100 + 8, 50 + 50), null, "within the rim of the first cell");
    assert.equal(pointToCell(rect, 100 + 20, 50 + 50), 0);
  });

  it("samples a line densely enough that no cell can be skipped", () => {
    const points = samplePoints(rect, centre(0), centre(4));
    assert.ok(points.length >= 16);
    for (let i = 1; i < points.length; i++) assert.ok(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]) <= 25.01);
    assert.deepEqual(points[points.length - 1], centre(4));
  });

  it("lists the cells a fast straight drag crosses, in order", () => {
    assert.deepEqual(cellsAlong(rect, centre(0), centre(4)), [0, 1, 2, 3, 4]);
    assert.deepEqual(cellsAlong(rect, centre(24), centre(4)), [24, 19, 14, 9, 4]);
    assert.deepEqual(cellsAlong(rect, centre(7), centre(7)), [7]);
  });

  it("does not touch the cells beside a diagonal slide", () => {
    // From the middle of cell 0 to the middle of cell 6 the finger passes the shared corner: neither 1 nor 5 is touched.
    assert.deepEqual(cellsAlong(rect, centre(0), centre(6)), [0, 6]);
  });
});

describe("playing", () => {
  it("starts with an empty path, running", () => {
    const g = fresh();
    assert.deepEqual(g.path, []);
    assert.equal(g.status, "playing");
    assert.equal(g.hintsUsed, 0);
    assert.equal(remaining(g), 25);
    assert.equal(nextCheckpoint(g), 1);
    assert.throws(() => newGame({ ...EASY, puzzle: "nope" }, "client-0001", T0));
  });

  it("starts the path only on 1 and says why otherwise", () => {
    const g = fresh();
    const refused = beginStroke(g, 0, T0);
    assert.equal(refused.state, g);
    assert.equal(refused.refused, "start");
    assert.match(refusal(g, "start"), /marked 1/);
    const began = beginStroke(g, 8, T0);
    assert.deepEqual(began.state.path, [8]);
    assert.equal(began.refused, null);
    assert.deepEqual(began.state.stroke, [], "the stroke remembers the path it began from");
  });

  it("draws along neighbours and rejects diagonals, walls and out-of-order numbers while dragging", () => {
    let g = beginStroke(fresh(), 8, T0).state;
    g = dragTo(g, 13, T0).state;
    g = dragTo(g, 14, T0).state;
    assert.deepEqual(g.path, [8, 13, 14]);
    const diag = dragTo(g, 8 + 1 + 5 * 2, T0);
    assert.deepEqual(diag.state.path, [8, 13, 14], "no jump to a far cell");
    // On the medium board, a wall blocks the step.
    let m = draw(fresh(MEDIUM), MEDIUM.solution.slice(0, 15));
    m = beginStroke(m, MEDIUM.solution[14], T0).state;
    const blocked = dragTo({ ...m, path: [22], stroke: [] }, 28, T0);
    assert.deepEqual(blocked.state.path, [22]);
    assert.equal(blocked.refused, "wall");
    // Out of order: the easy board's 7 holds number 3 but 2 comes first.
    let o = beginStroke(fresh(), 8, T0).state;
    o = dragTo(o, 3, T0).state;
    o = dragTo(o, 2, T0).state;
    o = dragTo(o, 7, T0).state;
    assert.deepEqual(o.path, [8, 3, 2]);
  });

  it("backtracks by dragging back over the path, and the start can never be erased", () => {
    let g = beginStroke(fresh(), 8, T0).state;
    for (const c of [13, 12, 7]) g = dragTo(g, c, T0).state;
    g = dragTo(g, 12, T0).state;
    assert.deepEqual(g.path, [8, 13, 12]);
    g = dragTo(g, 8, T0).state;
    assert.deepEqual(g.path, [8]);
    assert.equal(dragTo(g, 8, T0).state.path.length, 1);
  });

  it("carries on from the end, or from an earlier cell, when pressed again", () => {
    let g = draw(fresh(), [8, 13, 12, 7]);
    g = beginStroke(g, 7, T0).state;
    assert.deepEqual(g.path, [8, 13, 12, 7]);
    g = endStroke(g);
    const back = beginStroke(g, 13, T0).state;
    assert.deepEqual(back.path, [8, 13]);
    assert.deepEqual(endStroke(back).path, [8, 13]);
  });

  it("files a whole stroke as one undo step, and a release changes nothing", () => {
    let g = draw(fresh(), [8, 13, 12, 7]);
    assert.equal(g.undoStack.length, 1);
    assert.deepEqual(g.path, [8, 13, 12, 7]);
    // A press and release without moving changes nothing and adds no step.
    const tap = endStroke(beginStroke(g, 7, T0).state);
    assert.deepEqual(tap.path, g.path);
    assert.equal(tap.undoStack.length, 1);
    g = undo(g);
    assert.deepEqual(g.path, []);
    assert.equal(g.redoStack.length, 1);
    g = redo(g);
    assert.deepEqual(g.path, [8, 13, 12, 7]);
    const back = undo(g);
    assert.equal(undo(back), back, "nothing left to undo");
    assert.equal(redo(g), g);
  });

  it("undo is not available mid-stroke, and a new stroke forgets the undone ones", () => {
    let g = draw(fresh(), [8, 13]);
    g = undo(g);
    g = draw(g, [8, 3]);
    assert.equal(g.redoStack.length, 0);
    const mid = beginStroke(g, 3, T0).state;
    assert.equal(undo(mid), mid);
    assert.equal(redo(mid), mid);
  });

  it("keeps only the latest strokes", () => {
    let g = fresh();
    for (let i = 0; i < MAX_HISTORY + 10; i++) g = i % 2 === 0 ? draw(g, [8, 13]) : draw(clearPath(g), [8]);
    assert.ok(g.undoStack.length <= MAX_HISTORY);
  });

  it("clears the path in one undoable step", () => {
    let g = draw(fresh(), [8, 13, 12]);
    const cleared = clearPath(g);
    assert.deepEqual(cleared.path, []);
    assert.deepEqual(undo(cleared).path, [8, 13, 12]);
    assert.equal(clearPath(fresh()).path.length, 0);
    g = fresh();
    assert.equal(clearPath(g), g);
  });

  it("moves by keyboard one step at a time, and back", () => {
    let g = stepTo(fresh(), 8, T0).state;
    g = stepTo(g, 13, T0).state;
    g = stepTo(g, 12, T0).state;
    assert.deepEqual(g.path, [8, 13, 12]);
    assert.equal(g.undoStack.length, 3);
    g = stepTo(g, 13, T0).state;
    assert.deepEqual(g.path, [8, 13], "stepping onto the previous cell goes back");
    const far = stepTo(g, 24, T0);
    assert.equal(far.state.path.length, 2);
    assert.equal(far.refused, "far");
  });

  it("tracks the number the path is heading for and the squares left", () => {
    let g = draw(fresh(), [8, 13, 12]);
    assert.equal(nextCheckpoint(g), 3);
    assert.equal(remaining(g), 22);
    g = draw(fresh(), EASY.solution.slice(0, -1));
    assert.equal(nextCheckpoint(g), 10);
    assert.equal(draw(fresh(), EASY.solution).status, "completed");
    assert.equal(nextCheckpoint(draw(fresh(), EASY.solution)), null);
  });

  it("completes only when the path covers every cell and ends on the last number", () => {
    for (const p of ALL) {
      const done = draw(fresh(p), p.solution);
      assert.equal(done.status, "completed", p.difficulty);
      assert.ok(isComplete(done));
      assert.ok(done.endedAt !== null);
      assert.equal(done.stroke, null);
    }
    const shortOne = almost(EASY, 1);
    assert.equal(shortOne.status, "playing");
    assert.equal(isComplete(shortOne), false);
    // Finishing off the last cell completes it in the middle of a stroke, and the stroke is still filed.
    let g = beginStroke(almost(EASY, 1), 20, T0 + 5).state;
    assert.equal(g.status, "completed");
    assert.equal(g.stroke, null);
    g = endStroke(g);
    assert.equal(g.status, "completed");
  });

  it("an interrupted stroke leaves a valid path", () => {
    let g = beginStroke(fresh(), 8, T0).state;
    g = dragTo(g, 13, T0).state;
    g = endStroke(g);
    assert.ok(validatePath(rulesOf(zp(EASY)), g.path));
    assert.equal(g.stroke, null);
  });

  it("does not accept drawing while paused or after solving", () => {
    const paused = pauseGame(fresh(), T0 + 1000);
    assert.equal(beginStroke(paused, 8, T0).state, paused);
    assert.equal(stepTo(paused, 8, T0).state, paused);
    assert.equal(giveHint(paused, T0), paused);
    const done = draw(fresh(), EASY.solution);
    assert.equal(beginStroke(done, 8, T0).state, done);
    assert.equal(undo(done), done);
    assert.equal(clearPath(done), done);
  });

  it("restarts the same puzzle with the same id and a clean slate", () => {
    let g = giveHint(draw(fresh(), [8, 13]), T0 + 1);
    g = pauseGame(g, T0 + 1000);
    const again = restartGame(g, T0 + 5000);
    assert.equal(again.clientId, g.clientId);
    assert.equal(again.puzzle, g.puzzle);
    assert.deepEqual(again.path, []);
    assert.equal(again.hintsUsed, 0);
    assert.equal(again.elapsedMs, 0);
    assert.equal(again.status, "playing");
    assert.equal(again.startedAt, T0 + 5000);
    assert.equal(again.undoStack.length, 0);
  });
});

describe("hints", () => {
  it("adds the next squares of the solution to an empty or correct path", () => {
    const g = giveHint(fresh(), T0);
    assert.deepEqual(g.path, EASY.solution.slice(0, 3));
    assert.equal(g.hintsUsed, 1);
    assert.equal(g.hint?.kind, "next");
    assert.deepEqual(g.hint?.cells, EASY.solution.slice(0, 3));
    const more = giveHint(draw(fresh(), EASY.solution.slice(0, 5)), T0);
    assert.deepEqual(more.path, EASY.solution.slice(0, 8));
  });

  it("cuts a wrong path back to the last right square and points at the first wrong one", () => {
    // Right for four squares, then up to 2 and 3 where the solution goes left.
    const wrongWay = [...EASY.solution.slice(0, 4), 2, 3];
    const g = giveHint(draw(fresh(), wrongWay), T0);
    assert.deepEqual(g.path, EASY.solution.slice(0, 4));
    assert.equal(g.hint?.kind, "wrong");
    assert.deepEqual(g.hint?.cells, [2]);
    assert.equal(g.hintsUsed, 1);
    assert.deepEqual(undo(g).path, wrongWay, "one undo step brings the wrong path back");
  });

  it("is dismissed by any change to the path", () => {
    let g = giveHint(fresh(), T0);
    assert.ok(g.hint);
    g = draw(g, [...g.path, EASY.solution[3]]);
    assert.equal(g.hint, null);
    g = undo(giveHint(g, T0));
    assert.equal(g.hint, null);
  });

  it("can play a whole puzzle out of hints, every square the solution's", () => {
    for (const p of ALL) {
      let g = fresh(p);
      let guard = 0;
      while (g.status === "playing" && guard++ < 100) g = giveHint(g, T0 + guard);
      assert.equal(g.status, "completed", p.difficulty);
      assert.deepEqual(g.path, p.solution);
      assert.equal(g.hintsUsed, Math.ceil(p.solution.length / 3));
    }
  });

  it("does nothing once the path is the solution", () => {
    const done = draw(fresh(), EASY.solution);
    assert.equal(giveHint(done, T0), done);
  });
});

describe("clock", () => {
  it("counts only playing time", () => {
    const g = fresh();
    assert.equal(elapsedAt(g, T0 + 4000), 4000);
    const paused = pauseGame(g, T0 + 4000);
    assert.equal(elapsedAt(paused, T0 + 999_000), 4000);
    const resumed = resumeGame(paused, T0 + 10_000);
    assert.equal(elapsedAt(resumed, T0 + 12_000), 6000);
    assert.equal(freezeForStorage(resumed, T0 + 12_000).status, "paused");
  });

  it("stops at the moment the last square is filled", () => {
    const done = draw(fresh(), EASY.solution, T0 + 7000);
    assert.equal(done.elapsedMs, 7000);
    assert.equal(elapsedAt(done, T0 + 99_999_999), 7000);
  });
});

describe("generator", () => {
  it("builds uniquely solvable, valid puzzles at every difficulty", () => {
    for (const difficulty of DIFFICULTIES) {
      const profile = PROFILES[difficulty];
      for (const seed of [1, 2, 3]) {
        const made = generatePuzzle(difficulty, seededRng(seed * 31));
        const puzzle = parsePuzzle(made.puzzle);
        const label = `${difficulty} #${seed}`;
        assert.ok(puzzle, `${label}: parses`);
        assert.equal(puzzle.rows, profile.rows);
        assert.equal(puzzle.cols, profile.cols);
        assert.ok(puzzle.walls.length <= profile.maxWalls, `${label}: wall cap`);
        assert.ok(puzzle.checkpoints.length >= 2 && puzzle.checkpoints.length <= profile.checkpoints + profile.extraCheckpoints, `${label}: checkpoint count`);
        const result = solvePuzzle(puzzle);
        assert.equal(result.exceeded, false, label);
        assert.equal(result.count, 1, `${label}: exactly one solution`);
        assert.ok(result.nodes <= GENERATION_NODES, `${label}: within the generation budget`);
        assert.deepEqual(result.first, made.solution, `${label}: the stored solution is the solution`);
        const rules = rulesOf(puzzle);
        assert.ok(pathComplete(rules, made.solution), `${label}: complete`);
        assert.equal(made.solution.length, profile.rows * profile.cols);
        // The first and last numbers are the ends of the path; numbers rise along it; no wall is on the path.
        assert.equal(puzzle.checkpoints[0], made.solution[0], `${label}: 1 is the start`);
        assert.equal(puzzle.checkpoints[puzzle.checkpoints.length - 1], made.solution[made.solution.length - 1], `${label}: the last number is the end`);
        const positions = puzzle.checkpoints.map((c) => made.solution.indexOf(c));
        assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${label}: ascending along the path`);
        for (let i = 1; i < made.solution.length; i++) assert.equal(puzzle.walls.includes(wallKey(made.solution[i - 1], made.solution[i])), false, `${label}: wall on the path`);
        assert.equal(made.difficulty, difficulty);
      }
    }
  });

  it("gets harder with the level: bigger boards and no fewer walls", () => {
    const sizes = DIFFICULTIES.map((d) => PROFILES[d].rows);
    assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
    assert.equal(new Set(sizes).size, 4);
    const walls = DIFFICULTIES.map((d) => PROFILES[d].maxWalls);
    assert.deepEqual(walls, [...walls].sort((a, b) => a - b));
    for (const d of DIFFICULTIES) assert.ok(PROFILES[d].rows * PROFILES[d].cols <= MAX_CELLS);
  });

  it("is repeatable for a seed, and different across seeds", () => {
    assert.deepEqual(generatePuzzle("medium", seededRng(5)), generatePuzzle("medium", seededRng(5)));
    assert.notEqual(generatePuzzle("medium", seededRng(5)).puzzle, generatePuzzle("medium", seededRng(6)).puzzle);
  });

  it("gives up with an error instead of returning a puzzle it could not verify", () => {
    assert.throws(() => generatePuzzle("expert", seededRng(1), { maxAttempts: 0, maxMs: 1000 }), GenerationError);
    assert.throws(() => generatePuzzle("hard", seededRng(1), { maxAttempts: 5, maxMs: -1 }), GenerationError);
  });
});

describe("records and scoring", () => {
  it("turns a finished game into a record", () => {
    const g = draw(fresh(), EASY.solution, T0 + 30_000);
    const data = toSessionData(g, T0 + 99_999);
    assert.equal(data.completed, true);
    assert.equal(data.puzzle, EASY.puzzle);
    assert.equal(data.elapsedMs, 30_000);
    assert.equal(data.endedAt, g.endedAt);
    const abandoned = toSessionData(draw(fresh(), [8, 13], T0 + 500), T0 + 7000);
    assert.equal(abandoned.completed, false);
    assert.equal(abandoned.endedAt, T0 + 7000);
    assert.equal(hasProgress(fresh()), false);
    assert.equal(hasProgress(draw(fresh(), [8, 13])), true);
    assert.equal(hasProgress(giveHint(fresh(), T0)), true);
    assert.equal(hasProgress(draw(fresh(), [8])), true, "starting a path is an undo step");
  });

  it("scores by difficulty, time and hints, and nothing when not solved", () => {
    const base = { difficulty: "medium", completed: true, elapsedMs: 0, hintsUsed: 0 } as const;
    assert.deepEqual(scoreGame(base), { base: 700, timeBonus: 350, hintPenalty: 0, total: 1050 });
    assert.equal(scoreGame({ ...base, elapsedMs: PAR_MS.medium }).timeBonus, 175);
    assert.equal(scoreGame({ ...base, elapsedMs: 2 * PAR_MS.medium }).timeBonus, 0);
    assert.equal(scoreGame({ ...base, hintsUsed: 2 }).hintPenalty, 42);
    assert.equal(scoreGame({ ...base, hintsUsed: 99 }).hintPenalty, 175, "capped at 25%");
    assert.equal(scoreGame({ ...base, completed: false }).total, 0);
    assert.ok(BASE_POINTS.easy < BASE_POINTS.medium && BASE_POINTS.medium < BASE_POINTS.hard && BASE_POINTS.hard < BASE_POINTS.expert);
  });

  const record = (patch: Partial<Record<keyof SessionData, unknown>> = {}) => ({
    clientId: "client-0001",
    startedAt: T0,
    endedAt: T0 + 60_000,
    difficulty: "easy",
    puzzle: EASY.puzzle,
    completed: true,
    elapsedMs: 30_000,
    hintsUsed: 1,
    ...patch,
  });

  it("accepts a good record and rejects bad ones with a reason", () => {
    assert.equal(parseSessionData(record(), { now: T0 + 120_000, verify: true }).ok, true);
    const bad = (patch: Partial<Record<keyof SessionData, unknown>>, options?: { now?: number; verify?: boolean }) => parseSessionData(record(patch), options);
    assert.equal(bad({ difficulty: "nope" }).ok, false);
    assert.equal(bad({ puzzle: "5x5;c:0;w:" }).ok, false);
    assert.equal(bad({ completed: "yes" }).ok, false);
    assert.equal(bad({ elapsedMs: -1 }).ok, false);
    assert.equal(bad({ elapsedMs: 70_000 }).ok, false, "more playing time than the game lasted");
    assert.equal(bad({ hintsUsed: -1 }).ok, false);
    assert.equal(bad({ clientId: "x" }).ok, false);
    assert.equal(bad({ endedAt: T0 - 1 }).ok, false);
    assert.equal(bad({}, { now: T0 - 600_000 }).ok, false, "ends in the future");
    assert.equal(bad({ elapsedMs: MIN_MS_PER_CELL * 25 - 1 }).ok, false, "solved implausibly fast");
    assert.equal(bad({ elapsedMs: 100, completed: false }).ok, true, "an abandoned game may be short");
    assert.equal(parseSessionData(null).ok, false);
  });

  it("keeps the client id of a rejected record, so a device can stop retrying it", () => {
    const rejected = parseSessionData(record({ difficulty: "nope" }));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.clientId, "client-0001");
  });

  it("on upload checks the puzzle has exactly one solution", () => {
    const loose = record({ puzzle: "3x3;c:0,8;w:" });
    assert.equal(parseSessionData(loose, { verify: false }).ok, true, "the structure is fine");
    const verified = parseSessionData(loose, { verify: true });
    assert.equal(verified.ok, false);
    if (!verified.ok) assert.match(verified.reason, /exactly one solution/);
    const none = parseSessionData(record({ puzzle: "3x3;c:0,1;w:" }), { verify: true });
    assert.equal(none.ok, false);
  });

  it("verifies a full upload of ten of the costliest puzzles quickly", () => {
    const started = performance.now();
    for (let i = 0; i < 10; i++) {
      const result = parseSessionData(record({ clientId: `client-big-${i}`, difficulty: "expert", puzzle: EXPERT.puzzle, elapsedMs: 600_000, endedAt: T0 + 3_600_000 }), { now: T0 + 4_000_000, verify: true });
      assert.equal(result.ok, true);
    }
    // The budget allows at most NODE_BUDGET nodes per puzzle; a generous ceiling keeps this stable on slow machines.
    assert.ok(performance.now() - started < 5000);
  });
});

describe("stats", () => {
  const game = (patch: Partial<SessionData> = {}): SessionData => ({ clientId: `c-${Math.random()}`, startedAt: T0, endedAt: T0 + 1000, difficulty: "easy", puzzle: EASY.puzzle, completed: true, elapsedMs: 60_000, hintsUsed: 0, ...patch });

  it("works out each difficulty on its own", () => {
    const stats = computeStats([game({ elapsedMs: 90_000 }), game({ elapsedMs: 50_000, hintsUsed: 2 }), game({ completed: false }), game({ difficulty: "hard" })]);
    const easy = stats.byDifficulty.easy;
    assert.equal(easy.attempted, 3);
    assert.equal(easy.completed, 2);
    assert.equal(easy.completionRate, 66);
    assert.equal(easy.bestTimeMs, 50_000);
    assert.equal(easy.independent, 1);
    assert.equal(easy.hintsUsed, 2);
    assert.ok(easy.bestScore > 0);
    assert.equal(stats.byDifficulty.medium.bestTimeMs, null);
    assert.equal(computeStats([game()], "expert").byDifficulty.expert.attempted, 1);
  });
});

class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

describe("storage", () => {
  const guest = { key: "mathz:guest:v1", syncable: false };
  const account = { key: "mathz:user:v1:7", syncable: true };

  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });

  const session = (n: number, patch: Partial<SessionData> = {}): SessionData => ({
    clientId: `client-${String(n).padStart(4, "0")}`,
    startedAt: T0 + n,
    endedAt: T0 + n + 1000,
    difficulty: "easy",
    puzzle: EASY.puzzle,
    completed: true,
    elapsedMs: 900,
    hintsUsed: 0,
    ...patch,
  });

  it("keeps finished games once, and flags an account's as waiting for upload", () => {
    assert.ok(saveSession(guest, session(1)));
    assert.ok(saveSession(guest, session(1)), "saving twice is harmless");
    assert.equal(loadHistory(guest).length, 1);
    assert.ok(saveSession(account, session(2)));
    assert.equal(loadHistory(account)[0].synced, false);
    assert.equal(loadHistory(guest).length, 1, "stores do not mix");
  });

  it("a restarted game that is then solved is recorded once", () => {
    let g = draw(fresh(), [8, 13]);
    g = restartGame(g, T0 + 1000);
    g = draw(g, EASY.solution, T0 + 9000);
    assert.equal(g.status, "completed");
    const data = toSessionData(g, T0 + 20_000);
    assert.ok(saveSession(guest, data));
    assert.ok(saveSession(guest, data));
    assert.ok(saveSession(guest, { ...data, hintsUsed: 9 }), "a second attempt with the same id changes nothing");
    const history = loadHistory(guest);
    assert.equal(history.length, 1);
    assert.equal(history[0].hintsUsed, 0);
  });

  it("restores an unfinished game exactly as it was, stopped", () => {
    let g = draw(fresh(MEDIUM), MEDIUM.solution.slice(0, 6), T0 + 2000);
    g = giveHint(g, T0 + 3000);
    g = draw(g, MEDIUM.solution.slice(0, 10), T0 + 4000);
    const saved = freezeForStorage(g, T0 + 9000);
    assert.equal(saved.status, "paused");
    assert.ok(saveGame(guest, saved));

    const back = loadGame(guest)!;
    assert.ok(back);
    assert.deepEqual(back.path, g.path);
    assert.equal(back.puzzle, g.puzzle);
    assert.deepEqual(back.solution, g.solution);
    assert.equal(back.difficulty, g.difficulty);
    assert.equal(back.hintsUsed, 1);
    assert.equal(back.hint, null);
    assert.equal(back.status, "paused");
    assert.equal(back.elapsedMs, 9000);
    assert.deepEqual(back.undoStack, g.undoStack);
    assert.equal(elapsedAt(back, T0 + 86_400_000), 9000, "closed for a day: the clock has not moved");
    assert.deepEqual(undo(resumeGame(back, T0 + 86_400_000)).path, g.undoStack[g.undoStack.length - 1]);
  });

  it("clears the saved game, and keeps stores apart", () => {
    saveGame(guest, freezeForStorage(fresh(), T0));
    assert.ok(loadGame(guest));
    assert.equal(loadGame(account), null);
    clearGame(guest);
    assert.equal(loadGame(guest), null);
  });

  it("refuses corrupt or tampered saved games", () => {
    const g = freezeForStorage(draw(fresh(), [8, 13, 12]), T0);
    const bad = (patch: (o: Record<string, unknown>) => void) => {
      const o = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
      patch(o);
      return parseGame(o);
    };
    assert.ok(parseGame(JSON.parse(JSON.stringify(g))));
    assert.equal(bad((o) => (o.puzzle = "5x5;c:8,12;w:")), null, "a puzzle with many solutions");
    assert.equal(bad((o) => (o.puzzle = "x")), null);
    assert.equal(bad((o) => (o.solution = EASY.solution.slice().reverse())), null, "the solution must be the one solution");
    assert.equal(bad((o) => (o.path = [8, 2])), null, "a path that breaks a rule");
    assert.equal(bad((o) => (o.path = [0])), null, "a path must start on 1");
    assert.equal(bad((o) => (o.path = [8, 13, 13])), null);
    assert.equal(bad((o) => (o.hintsUsed = -1)), null);
    assert.equal(bad((o) => (o.difficulty = "nope")), null);
    assert.equal(bad((o) => (o.status = "completed")), null);
    assert.equal(bad((o) => (o.elapsedMs = -5)), null);
    assert.equal(bad((o) => (o.undoStack = [[99]])), null);
    assert.equal(parseGame("nonsense"), null);
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:guest:v1:zip:game", "{broken");
    assert.equal(loadGame(guest), null);
  });

  it("does not restore a game whose board is already solved", () => {
    const done = draw(fresh(), EASY.solution);
    assert.equal(parseGame(JSON.parse(JSON.stringify({ ...freezeForStorage(done, T0), status: "paused", endedAt: null }))), null);
  });

  it("remembers settings and difficulty, with safe defaults", () => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.equal(loadDifficulty(), "easy");
    saveSettings({ showRemaining: false });
    saveDifficulty("expert");
    assert.deepEqual(loadSettings(), { showRemaining: false });
    assert.equal(loadDifficulty(), "expert");
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:zip:settings", "7");
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.equal(loadDifficulty(), "easy");
    assert.equal(saveGame(guest, fresh()), false);
    assert.doesNotThrow(() => saveSettings({ showRemaining: true }));
    assert.doesNotThrow(() => clearGame(guest));
  });
});
