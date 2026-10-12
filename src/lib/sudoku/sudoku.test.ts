import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBoard, clearCell, digitCounts, elapsedAt, enterDigit, fillCandidates, freezeForStorage, hasProgress, hintTarget, isComplete, newGame, pauseGame, redo, restartGame, resumeGame, revealSolution, toSessionData, undo, giveHint, MAX_HISTORY } from "./game";
import { generatePuzzle } from "./generator";
import { PEERS, UNITS, bit, boxOf, colOf, findConflicts, formatGrid, isSolved, parseGrid, rowOf } from "./grid";
import { ratePuzzle } from "./rating";
import { parseSessionData } from "./records";
import { BASE_POINTS, PAR_MS, formatTime, scoreGame } from "./scoring";
import { countSolutions, randomSolution, seededRng, solve } from "./solver";
import { computeStats } from "./stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, parseGame, saveDifficulty, saveGame, saveSession, saveSettings } from "./storage";
import { DIFFICULTIES, DEFAULT_SETTINGS, type GameState, type Puzzle, type SessionData } from "./types";

/** A complete valid grid (the one on Wikipedia's Sudoku page) and a puzzle made from it. */
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const puzzle: Puzzle = { difficulty: "easy", puzzle: PUZZLE, solution: SOLUTION };
const T0 = 1_700_000_000_000;
const OPTS = { notes: false, trackMistakes: true };
const NOTES = { notes: true, trackMistakes: true };

const fresh = (): GameState => newGame(puzzle, "client-0001", T0);
/** Index of the first empty cell, and the digit that belongs there. */
const firstEmpty = (g: GameState): number => g.cells.findIndex((c) => c.value === 0);
const right = (g: GameState, i: number): number => Number(g.solution[i]);
const wrong = (g: GameState, i: number): number => (right(g, i) % 9) + 1;

/** Fills every empty cell correctly except the last one, returning the game and that last cell. */
function nearlySolved(): { game: GameState; last: number } {
  let game = fresh();
  const empties = game.cells.flatMap((c, i) => (c.value === 0 ? [i] : []));
  const last = empties[empties.length - 1];
  for (const i of empties.slice(0, -1)) game = enterDigit(game, i, right(game, i), T0, OPTS);
  return { game, last };
}

describe("grid rules", () => {
  it("builds 27 units of 9 cells and 20 peers per cell", () => {
    assert.equal(UNITS.length, 27);
    assert.ok(UNITS.every((u) => u.length === 9 && new Set(u).size === 9));
    assert.ok(PEERS.every((p) => p.length === 20));
  });

  it("knows rows, columns and 3x3 boxes", () => {
    assert.equal(rowOf(40), 4);
    assert.equal(colOf(40), 4);
    assert.equal(boxOf(40), 4);
    assert.equal(boxOf(0), 0);
    assert.equal(boxOf(80), 8);
    assert.equal(boxOf(29), 3); // row 3, column 2
  });

  it("parses and formats grids, and rejects anything else", () => {
    const grid = parseGrid(PUZZLE);
    assert.ok(grid);
    assert.equal(formatGrid(grid), PUZZLE);
    assert.equal(parseGrid(PUZZLE.slice(1)), null);
    assert.equal(parseGrid("x".repeat(81)), null);
    assert.equal(parseGrid(null), null);
    assert.deepEqual(parseGrid(".".repeat(81)), new Array(81).fill(0));
  });

  it("accepts a valid solution and rejects every kind of violation", () => {
    const grid = parseGrid(SOLUTION)!;
    assert.ok(isSolved(grid));
    const rowDup = [...grid];
    rowDup[1] = rowDup[0]; // two equal digits in row 0
    assert.ok(!isSolved(rowDup));
    const swapped = [...grid];
    [swapped[0], swapped[9]] = [swapped[9], swapped[0]]; // rows still hold 1-9... but columns and boxes break
    assert.ok(!isSolved(swapped));
    assert.ok(!isSolved(parseGrid(PUZZLE)!), "an incomplete grid is not solved");
  });

  it("finds conflicts in a row, a column and a box", () => {
    const grid = new Array<number>(81).fill(0);
    grid[0] = 5;
    grid[8] = 5; // same row
    grid[72] = 5; // same column as cell 0
    grid[10] = 5; // same box as cell 0
    grid[40] = 5; // unrelated
    const flags = findConflicts(grid);
    assert.deepEqual(
      flags.flatMap((f, i) => (f ? [i] : [])),
      [0, 8, 10, 72]
    );
  });
});

describe("solver", () => {
  it("solves a puzzle to its known solution", () => {
    assert.equal(formatGrid(solve(parseGrid(PUZZLE)!)!), SOLUTION);
  });

  it("counts one solution for a proper puzzle and several for an under-determined one", () => {
    assert.equal(countSolutions(parseGrid(PUZZLE)!), 1);
    const sparse = parseGrid(SOLUTION)!.map((d, i) => (i < 40 ? 0 : d));
    assert.equal(countSolutions(sparse, 5), 5, "stops counting at the limit");
    assert.ok(countSolutions(sparse, 2) === 2);
  });

  it("reports no solution for contradictory grids", () => {
    const duplicate = parseGrid(PUZZLE)!;
    duplicate[2] = 5; // 5 twice in row 0
    assert.equal(countSolutions(duplicate), 0);
    assert.equal(solve(duplicate), null);
    // No rule is broken by the digits placed, but the first cell has no digit left that fits.
    const dead = new Array<number>(81).fill(0);
    [1, 2, 3, 4].forEach((d, k) => (dead[k + 1] = d)); // row 0, columns 1-4
    [5, 6, 7, 8].forEach((d, k) => (dead[9 * (k + 1)] = d)); // column 0, rows 1-4
    dead[10] = 9; // box 0 now has 9; row 0 + column 0 + box 0 together hold 1-9
    assert.ok(!findConflicts(dead).some(Boolean));
    assert.equal(solve(dead), null);
    assert.equal(countSolutions(dead), 0);
  });

  it("builds valid random solutions, reproducibly from a seed", () => {
    for (const seed of [1, 2, 3]) assert.ok(isSolved(randomSolution(seededRng(seed))));
    assert.deepEqual(randomSolution(seededRng(7)), randomSolution(seededRng(7)));
    assert.notDeepEqual(randomSolution(seededRng(7)), randomSolution(seededRng(8)));
  });
});

describe("difficulty rating", () => {
  it("rates a singles-only puzzle as easy", () => {
    const r = ratePuzzle(parseGrid(PUZZLE)!);
    assert.ok(r.solved);
    assert.equal(r.difficulty, "easy");
    assert.ok(r.techniques.every((t) => t === "naked-single" || t === "hidden-single"));
  });

  it("rates a puzzle that singles cannot finish as harder, and a capped search gives up as 'expert'", () => {
    const grid = parseGrid(generatePuzzle("hard", seededRng(2)).puzzle)!;
    assert.equal(ratePuzzle(grid).difficulty, "hard");
    for (const cap of [1, 2] as const) {
      const capped = ratePuzzle(grid, cap);
      assert.ok(!capped.solved);
      assert.equal(capped.difficulty, "expert");
    }
  });

  it("does not claim to have solved a puzzle that has an empty board", () => {
    const r = ratePuzzle(new Array<number>(81).fill(0));
    assert.ok(!r.solved);
    assert.equal(r.difficulty, "expert");
  });
});

describe("puzzle generation", () => {
  for (const difficulty of DIFFICULTIES) {
    it(`makes valid ${difficulty} puzzles with exactly one solution, rated ${difficulty}`, () => {
      for (const seed of [11, 12, 13]) {
        const p = generatePuzzle(difficulty, seededRng(seed));
        const grid = parseGrid(p.puzzle)!;
        const solution = parseGrid(p.solution)!;
        assert.ok(isSolved(solution), "solution is a valid grid");
        assert.equal(countSolutions(grid), 1, "exactly one solution");
        assert.equal(formatGrid(solve(grid)!), p.solution, "solver agrees with the stored solution");
        grid.forEach((d, i) => assert.ok(d === 0 || d === solution[i], "every clue matches the solution"));
        assert.ok(!findConflicts(grid).some(Boolean), "clues do not conflict");
        assert.equal(p.difficulty, difficulty);
        assert.equal(ratePuzzle(grid).difficulty, difficulty, "the rating, not the clue count, decides");
      }
    });
  }

  it("is reproducible from a seed and differs between seeds", () => {
    assert.deepEqual(generatePuzzle("medium", seededRng(5)), generatePuzzle("medium", seededRng(5)));
    assert.notEqual(generatePuzzle("medium", seededRng(5)).puzzle, generatePuzzle("medium", seededRng(6)).puzzle);
  });

  it("gets harder: harder puzzles need harder techniques and have fewer clues on average", () => {
    const clues = (d: (typeof DIFFICULTIES)[number]) => {
      const counts = [21, 22, 23, 24].map((s) => generatePuzzle(d, seededRng(s)).puzzle.replace(/0/g, "").length);
      return counts.reduce((a, b) => a + b, 0) / counts.length;
    };
    assert.ok(clues("easy") > clues("hard"));
    assert.ok(clues("hard") >= clues("expert"));
    const medium = ratePuzzle(parseGrid(generatePuzzle("medium", seededRng(3)).puzzle)!);
    assert.ok(medium.techniques.some((t) => !["naked-single", "hidden-single"].includes(t)), "a medium puzzle needs a technique beyond singles");
  });
});

describe("entering digits", () => {
  it("starts with the clues in place, running, with nothing counted", () => {
    const g = fresh();
    assert.equal(g.status, "playing");
    assert.equal(g.cells[0].value, 5);
    assert.equal(g.cells[2].value, 0);
    assert.equal(g.mistakes, 0);
    assert.equal(g.hintsUsed, 0);
  });

  it("never changes a clue", () => {
    const g = fresh();
    assert.equal(enterDigit(g, 0, 9, T0, OPTS), g);
    assert.equal(enterDigit(g, 0, 9, T0, NOTES), g);
    assert.equal(clearCell(g, 0, T0), g);
  });

  it("rejects digits outside 1-9", () => {
    const g = fresh();
    const i = firstEmpty(g);
    for (const d of [0, 10, -1, 1.5, NaN]) assert.equal(enterDigit(g, i, d, T0, OPTS), g);
  });

  it("places a digit, replaces it, and clears it", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = enterDigit(g, i, right(g, i), T0, OPTS);
    assert.equal(g.cells[i].value, right(g, i));
    g = enterDigit(g, i, wrong(g, i), T0, OPTS);
    assert.equal(g.cells[i].value, wrong(g, i));
    g = clearCell(g, i, T0);
    assert.equal(g.cells[i].value, 0);
  });

  it("ignores typing the digit that is already there", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = enterDigit(g, i, right(g, i), T0, OPTS);
    assert.equal(enterDigit(g, i, right(g, i), T0, OPTS), g);
  });

  it("counts a wrong digit as a mistake only when tracking is on", () => {
    const g = fresh();
    const i = firstEmpty(g);
    assert.equal(enterDigit(g, i, wrong(g, i), T0, OPTS).mistakes, 1);
    assert.equal(enterDigit(g, i, wrong(g, i), T0, { notes: false, trackMistakes: false }).mistakes, 0);
    assert.equal(enterDigit(g, i, right(g, i), T0, OPTS).mistakes, 0);
  });

  it("does nothing while paused or finished", () => {
    const g = fresh();
    const i = firstEmpty(g);
    assert.equal(enterDigit(pauseGame(g, T0), i, 1, T0, OPTS).cells[i].value, 0);
    assert.equal(enterDigit(revealSolution(g, T0), i, 1, T0, OPTS).cells[i].value, right(g, i));
  });
});

describe("conflicts and checking", () => {
  it("flags a digit repeated in a row, column or box, and clears the flag when it is removed", () => {
    let g = fresh();
    // Cell 2 is empty in row 0, which already has a 5 at cell 0.
    g = enterDigit(g, 2, 5, T0, OPTS);
    let flags = findConflicts(g.cells.map((c) => c.value));
    assert.ok(flags[0] && flags[2]);
    g = clearCell(g, 2, T0);
    flags = findConflicts(g.cells.map((c) => c.value));
    assert.ok(!flags.some(Boolean));
  });

  it("check separates conflicts from entries that merely differ from the solution", () => {
    let g = fresh();
    const i = firstEmpty(g);
    assert.ok(checkBoard(g).ok);
    assert.equal(checkBoard(g).empty, 51);
    // A digit that breaks no rule yet is still not the solution's: pick one allowed by the row/col/box.
    const values = g.cells.map((c) => c.value);
    const allowed = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== right(g, i) && PEERS[i].every((p) => values[p] !== d))!;
    if (allowed) {
      g = enterDigit(g, i, allowed, T0, OPTS);
      const r = checkBoard(g);
      assert.deepEqual(r.conflicts, []);
      assert.deepEqual(r.incorrect, [i]);
      assert.ok(!r.ok);
    }
  });
});

describe("pencil marks", () => {
  it("toggles a note on and off, with several in one cell", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = enterDigit(g, i, 3, T0, NOTES);
    g = enterDigit(g, i, 7, T0, NOTES);
    assert.equal(g.cells[i].notes, bit(3) | bit(7));
    assert.equal(g.cells[i].value, 0, "a note is never an answer");
    g = enterDigit(g, i, 3, T0, NOTES);
    assert.equal(g.cells[i].notes, bit(7));
  });

  it("cannot add notes to a filled cell or a clue", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = enterDigit(g, i, right(g, i), T0, OPTS);
    assert.equal(enterDigit(g, i, 2, T0, NOTES), g);
    assert.equal(enterDigit(g, 0, 2, T0, NOTES), g);
  });

  it("clears a cell's notes when it is filled and strikes the digit from its peers' notes", () => {
    let g = fresh();
    const i = 2; // row 0, empty
    g = enterDigit(g, i, 4, T0, NOTES);
    g = enterDigit(g, 3, 4, T0, NOTES); // same row, empty
    g = enterDigit(g, 3, 9, T0, NOTES);
    g = enterDigit(g, i, 4, T0, OPTS);
    assert.equal(g.cells[i].notes, 0);
    assert.equal(g.cells[3].notes, bit(9), "the 4 is struck from the peer, other notes stay");
  });

  it("clears notes in an empty cell with erase", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = enterDigit(g, i, 3, T0, NOTES);
    g = clearCell(g, i, T0);
    assert.equal(g.cells[i].notes, 0);
  });

  it("fills in candidates for every empty cell as a single undoable step", () => {
    let g = fresh();
    const before = g.undoStack.length;
    g = fillCandidates(g, T0);
    assert.equal(g.undoStack.length, before + 1);
    const values = g.cells.map((c) => c.value);
    for (const [i, c] of g.cells.entries()) {
      if (c.value !== 0) assert.equal(c.notes, 0);
      else assert.ok(c.notes & bit(right(g, i)), "the right digit is always among the candidates");
    }
    assert.ok(values.length === 81);
    g = undo(g);
    assert.ok(g.cells.every((c) => c.notes === 0));
  });
});

describe("undo and redo", () => {
  it("restores values and notes, including notes struck from peers", () => {
    let g = fresh();
    g = enterDigit(g, 2, 4, T0, NOTES);
    g = enterDigit(g, 3, 4, T0, NOTES);
    const marked = g;
    g = enterDigit(g, 2, 4, T0, OPTS);
    assert.equal(g.cells[3].notes, 0);
    g = undo(g);
    assert.deepEqual(g.cells, marked.cells);
    g = undo(g);
    assert.equal(g.cells[3].notes, 0);
    g = redo(g);
    assert.equal(g.cells[3].notes, bit(4));
  });

  it("undoes and redoes in order, and a new move forgets redo", () => {
    let g = fresh();
    const [a, b] = g.cells.flatMap((c, i) => (c.value === 0 ? [i] : [])).slice(0, 2);
    g = enterDigit(g, a, right(g, a), T0, OPTS);
    g = enterDigit(g, b, right(g, b), T0, OPTS);
    g = undo(g);
    assert.equal(g.cells[b].value, 0);
    assert.equal(g.cells[a].value, right(g, a));
    g = redo(g);
    assert.equal(g.cells[b].value, right(g, b));
    g = undo(undo(g));
    g = enterDigit(g, b, wrong(g, b), T0, OPTS);
    assert.equal(g.redoStack.length, 0);
    assert.equal(redo(g), g);
  });

  it("does nothing with an empty history, and keeps the mistake count", () => {
    const g = fresh();
    assert.equal(undo(g), g);
    assert.equal(redo(g), g);
    const i = firstEmpty(g);
    const mistaken = undo(enterDigit(g, i, wrong(g, i), T0, OPTS));
    assert.equal(mistaken.mistakes, 1, "taking a move back does not erase the mistake");
  });

  it("keeps the history bounded", () => {
    let g = fresh();
    const i = firstEmpty(g);
    for (let n = 0; n < MAX_HISTORY + 50; n++) g = enterDigit(g, i, (n % 2) + 1, T0, NOTES);
    assert.equal(g.undoStack.length, MAX_HISTORY);
  });
});

describe("hints", () => {
  it("reveals the right digit in the selected cell, locks it and counts the hint", () => {
    let g = fresh();
    const i = firstEmpty(g);
    const result = giveHint(g, i, T0);
    g = result.state;
    assert.equal(result.index, i);
    assert.equal(g.cells[i].value, right(g, i));
    assert.ok(g.cells[i].hinted);
    assert.equal(g.hintsUsed, 1);
    assert.equal(g.mistakes, 0);
    assert.equal(enterDigit(g, i, wrong(g, i), T0, OPTS), g, "a hinted cell cannot be changed");
    assert.equal(clearCell(g, i, T0), g);
  });

  it("replaces a wrong entry in the selected cell", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = enterDigit(g, i, wrong(g, i), T0, OPTS);
    g = giveHint(g, i, T0).state;
    assert.equal(g.cells[i].value, right(g, i));
  });

  it("suggests the most constrained unsolved cell when nothing useful is selected", () => {
    const g = fresh();
    const target = hintTarget(g, 0); // a clue is selected: not a valid target
    assert.notEqual(target, null);
    assert.equal(g.cells[target!].value, 0);
    const result = giveHint(g, null, T0);
    assert.equal(result.state.cells[result.index!].value, right(g, result.index!));
  });

  it("never reveals a wrong digit, however the board looks", () => {
    let g = fresh();
    for (let n = 0; n < 51; n++) {
      const r = giveHint(g, null, T0);
      assert.notEqual(r.index, null);
      assert.equal(r.state.cells[r.index!].value, right(g, r.index!));
      g = r.state;
    }
    assert.equal(g.status, "completed");
    assert.equal(g.hintsUsed, 51);
  });

  it("does nothing once the game is over", () => {
    const g = revealSolution(fresh(), T0);
    assert.equal(giveHint(g, null, T0).index, null);
  });

  it("can be undone along with the hint's digit", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = giveHint(g, i, T0).state;
    g = undo(g);
    assert.equal(g.cells[i].value, 0);
    assert.ok(!g.cells[i].hinted);
  });
});

describe("completion", () => {
  it("is not complete until every cell is filled correctly", () => {
    const { game, last } = nearlySolved();
    assert.equal(game.status, "playing");
    assert.ok(!isComplete(game));
    const done = enterDigit(game, last, right(game, last), T0 + 5000, OPTS);
    assert.equal(done.status, "completed");
    assert.equal(done.endedAt, T0 + 5000);
    assert.equal(done.elapsedMs, 5000);
    assert.equal(done.resumedAt, null);
  });

  it("does not finish on a full board that breaks the rules", () => {
    const { game, last } = nearlySolved();
    const full = enterDigit(game, last, wrong(game, last), T0, OPTS);
    assert.equal(full.status, "playing", "all cells filled, but not a solution");
    assert.ok(!isComplete(full));
    assert.deepEqual(checkBoard(full).incorrect, [last]);
    // Fixing it completes the game.
    assert.equal(enterDigit(full, last, right(full, last), T0, OPTS).status, "completed");
  });

  it("stops accepting moves after completion", () => {
    const { game, last } = nearlySolved();
    const done = enterDigit(game, last, right(game, last), T0, OPTS);
    assert.equal(clearCell(done, last, T0), done);
    assert.equal(undo(done), done);
  });

  it("reveals the whole solution without counting it as solved", () => {
    const g = revealSolution(fresh(), T0 + 1000);
    assert.equal(g.status, "revealed");
    assert.equal(formatGrid(g.cells.map((c) => c.value)), SOLUTION);
    const data = toSessionData(g, T0 + 9000);
    assert.equal(data.completed, false);
    assert.equal(data.endedAt, T0 + 1000);
    assert.equal(scoreGame(data).total, 0);
  });
});

describe("restart and new games", () => {
  it("restart restores the puzzle and clears entries, notes, hints, mistakes and time", () => {
    let g = fresh();
    const i = firstEmpty(g);
    g = enterDigit(g, i, wrong(g, i), T0 + 1000, OPTS);
    g = enterDigit(g, i + 1 < 81 && g.cells[i + 1].value === 0 ? i + 1 : i, 2, T0 + 1000, NOTES);
    g = giveHint(g, null, T0 + 2000).state;
    const again = restartGame(g, T0 + 60_000);
    assert.equal(again.puzzle, PUZZLE);
    assert.equal(again.solution, SOLUTION);
    assert.ok(again.cells.every((c, k) => c.value === Number(PUZZLE[k]) && c.notes === 0 && !c.hinted));
    assert.equal(again.mistakes, 0);
    assert.equal(again.hintsUsed, 0);
    assert.equal(again.undoStack.length, 0);
    assert.equal(again.status, "playing");
    assert.equal(elapsedAt(again, T0 + 60_000), 0);
  });

  it("a new game is a different attempt with its own id and a fresh puzzle", () => {
    const p = generatePuzzle("easy", seededRng(40));
    const a = newGame(p, "client-aaaa", T0);
    const b = newGame(generatePuzzle("easy", seededRng(41)), "client-bbbb", T0);
    assert.notEqual(a.clientId, b.clientId);
    assert.notEqual(a.puzzle, b.puzzle);
  });

  it("only counts a game as an attempt once it has progress", () => {
    const g = fresh();
    assert.ok(!hasProgress(g));
    assert.ok(hasProgress(enterDigit(g, firstEmpty(g), 1, T0, OPTS)));
    assert.ok(hasProgress(giveHint(g, null, T0).state));
  });
});

describe("timer", () => {
  it("counts only the time the game is running", () => {
    let g = fresh();
    assert.equal(elapsedAt(g, T0 + 10_000), 10_000);
    g = pauseGame(g, T0 + 10_000);
    assert.equal(g.status, "paused");
    assert.equal(elapsedAt(g, T0 + 500_000), 10_000, "paused time is not counted");
    g = resumeGame(g, T0 + 500_000);
    assert.equal(elapsedAt(g, T0 + 505_000), 15_000);
  });

  it("ignores pause and resume in the wrong state", () => {
    const g = fresh();
    assert.equal(resumeGame(g, T0), g);
    const paused = pauseGame(g, T0 + 1000);
    assert.equal(pauseGame(paused, T0 + 9000), paused);
  });

  it("stops the clock at completion", () => {
    const { game, last } = nearlySolved();
    const done = enterDigit(game, last, right(game, last), T0 + 42_000, OPTS);
    assert.equal(elapsedAt(done, T0 + 999_999), 42_000);
  });

  it("does not let moves be made while paused", () => {
    const paused = pauseGame(fresh(), T0 + 1000);
    const i = firstEmpty(paused);
    assert.equal(enterDigit(paused, i, right(paused, i), T0 + 2000, OPTS), paused);
    assert.equal(giveHint(paused, i, T0).index, null);
  });

  it("formats times", () => {
    assert.equal(formatTime(0), "0:00");
    assert.equal(formatTime(65_000), "1:05");
    assert.equal(formatTime(3_725_000), "1:02:05");
  });
});

describe("scoring", () => {
  const solved = (over: Partial<SessionData> = {}): SessionData => ({ clientId: "client-0001", startedAt: T0, endedAt: T0 + 1, difficulty: "medium", puzzle: PUZZLE, completed: true, elapsedMs: 0, mistakes: 0, hintsUsed: 0, ...over });

  it("scores nothing for a game that was not solved", () => {
    assert.equal(scoreGame(solved({ completed: false })).total, 0);
  });

  it("gives the full time bonus for an instant solve and none at twice the par time", () => {
    const fast = scoreGame(solved());
    assert.equal(fast.total, BASE_POINTS.medium * 1.5);
    const slow = scoreGame(solved({ elapsedMs: PAR_MS.medium * 2 }));
    assert.equal(slow.timeBonus, 0);
    assert.equal(slow.total, BASE_POINTS.medium);
    assert.equal(scoreGame(solved({ elapsedMs: PAR_MS.medium * 10 })).timeBonus, 0);
  });

  it("takes off a fixed share per mistake and per hint, capped", () => {
    const base = scoreGame(solved({ elapsedMs: PAR_MS.medium * 2 })).total;
    assert.equal(base - scoreGame(solved({ elapsedMs: PAR_MS.medium * 2, mistakes: 1 })).total, 40);
    assert.equal(base - scoreGame(solved({ elapsedMs: PAR_MS.medium * 2, hintsUsed: 1 })).total, 30);
    assert.equal(scoreGame(solved({ mistakes: 100 })).mistakePenalty, 300);
    assert.equal(scoreGame(solved({ hintsUsed: 100 })).hintPenalty, 250);
  });

  it("always pays more for a harder puzzle solved the same way", () => {
    const totals = DIFFICULTIES.map((difficulty) => scoreGame(solved({ difficulty, elapsedMs: PAR_MS[difficulty] })).total);
    assert.deepEqual([...totals].sort((a, b) => a - b), totals);
  });

  it("a hint-assisted solve still earns a solid score", () => {
    const withHints = scoreGame(solved({ hintsUsed: 3, elapsedMs: PAR_MS.medium }));
    assert.ok(withHints.total > BASE_POINTS.medium * 0.9);
  });
});

describe("saved records", () => {
  const record = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    clientId: "client-0001",
    startedAt: T0,
    endedAt: T0 + 600_000,
    difficulty: "easy",
    puzzle: PUZZLE,
    completed: true,
    elapsedMs: 300_000,
    mistakes: 1,
    hintsUsed: 0,
    ...over,
  });

  it("accepts a good record, and the verified form for uploads", () => {
    assert.ok(parseSessionData(record()).ok);
    assert.ok(parseSessionData(record(), { now: T0 + 700_000, verify: true }).ok);
  });

  it("rejects bad ids, difficulties, puzzles and counters", () => {
    for (const bad of [
      { clientId: "x" },
      { difficulty: "legendary" },
      { puzzle: PUZZLE.slice(1) },
      { puzzle: "0".repeat(81) },
      { completed: "yes" },
      { mistakes: -1 },
      { hintsUsed: 1.5 },
      { elapsedMs: -5 },
      { endedAt: T0 - 1 },
    ]) {
      assert.ok(!parseSessionData(record(bad)).ok, JSON.stringify(bad));
    }
    assert.ok(!parseSessionData(null).ok);
  });

  it("rejects more playing time than the game lasted, and games from the future", () => {
    assert.ok(!parseSessionData(record({ elapsedMs: 700_000 })).ok);
    assert.ok(!parseSessionData(record({ endedAt: T0 + 900_000_000 }), { now: T0 }).ok);
  });

  it("rejects a puzzle without a unique solution when verifying", () => {
    const grid = parseGrid(PUZZLE)!;
    const clueCells = grid.flatMap((d, i) => (d ? [i] : []));
    for (const i of clueCells) {
      grid[i] = 0;
      if (countSolutions(grid) > 1) break;
    }
    assert.ok(countSolutions(grid) > 1 && grid.filter(Boolean).length >= 17);
    const ambiguous = formatGrid(grid);
    assert.ok(parseSessionData(record({ puzzle: ambiguous })).ok, "the cheap check on read-back does not search");
    assert.ok(!parseSessionData(record({ puzzle: ambiguous }), { verify: true }).ok);
  });
});

describe("statistics", () => {
  const game = (over: Partial<SessionData>): SessionData => ({ clientId: `client-${Math.random().toString(36).slice(2, 10)}`, startedAt: T0, endedAt: T0 + 1000, difficulty: "easy", puzzle: PUZZLE, completed: true, elapsedMs: 100_000, mistakes: 0, hintsUsed: 0, ...over });

  it("counts attempts, completion rate and best time per difficulty", () => {
    const stats = computeStats([game({ elapsedMs: 200_000 }), game({ elapsedMs: 150_000, hintsUsed: 2 }), game({ completed: false, elapsedMs: 30_000 }), game({ difficulty: "hard", elapsedMs: 900_000 })]);
    const easy = stats.byDifficulty.easy;
    assert.equal(easy.attempted, 3);
    assert.equal(easy.completed, 2);
    assert.equal(easy.completionRate, 66);
    assert.equal(easy.bestTimeMs, 150_000);
    assert.equal(easy.averageTimeMs, 175_000);
    assert.equal(easy.independent, 1);
    assert.equal(stats.byDifficulty.hard.bestTimeMs, 900_000);
    assert.equal(stats.byDifficulty.medium.bestTimeMs, null);
    assert.equal(stats.attempted, 4);
    assert.equal(stats.completed, 3);
  });

  it("counts the unfinished game as an attempt", () => {
    const stats = computeStats([game({})], "easy");
    assert.equal(stats.byDifficulty.easy.attempted, 2);
    assert.equal(stats.byDifficulty.easy.completionRate, 50);
    assert.equal(stats.byDifficulty.hard.attempted, 0);
    assert.equal(stats.byDifficulty.hard.completionRate, 0);
  });

  it("lists recent games newest first", () => {
    const stats = computeStats([game({ endedAt: 5 }), game({ endedAt: 9 }), game({ endedAt: 7 })]);
    assert.deepEqual(stats.recent.map((s) => s.endedAt), [9, 7, 5]);
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

  const session = (n: number): SessionData => ({ clientId: `client-${String(n).padStart(4, "0")}`, startedAt: T0 + n, endedAt: T0 + n + 1000, difficulty: "easy", puzzle: PUZZLE, completed: true, elapsedMs: 500, mistakes: 0, hintsUsed: 0 });

  it("keeps finished games and flags an account's as waiting for upload", () => {
    assert.ok(saveSession(guest, session(1)));
    assert.ok(saveSession(guest, session(1)), "saving twice is harmless");
    assert.equal(loadHistory(guest).length, 1);
    assert.ok(saveSession(account, session(2)));
    assert.equal(loadHistory(account)[0].synced, false);
    assert.equal(loadHistory(guest).length, 1, "stores do not mix");
  });

  it("restores an unfinished game exactly as it was, stopped", () => {
    let g = fresh();
    const [a, b] = g.cells.flatMap((c, i) => (c.value === 0 ? [i] : [])).slice(0, 2);
    g = enterDigit(g, a, wrong(g, a), T0 + 1000, OPTS);
    g = enterDigit(g, b, 4, T0 + 2000, NOTES);
    g = giveHint(g, null, T0 + 3000).state;
    const saved = freezeForStorage(g, T0 + 9000);
    assert.equal(saved.status, "paused");
    assert.ok(saveGame(guest, saved));

    const back = loadGame(guest)!;
    assert.ok(back);
    assert.deepEqual(back.cells, g.cells);
    assert.equal(back.puzzle, g.puzzle);
    assert.equal(back.solution, g.solution);
    assert.equal(back.difficulty, g.difficulty);
    assert.equal(back.mistakes, 1);
    assert.equal(back.hintsUsed, 1);
    assert.equal(back.status, "paused");
    assert.equal(back.elapsedMs, 9000);
    assert.equal(back.undoStack.length, g.undoStack.length);
    // Closed for a day: the clock has not moved.
    assert.equal(elapsedAt(back, T0 + 86_400_000), 9000);
    // And the history still works.
    assert.deepEqual(undo(resumeGame(back, T0 + 86_400_000)).cells.length, 81);
  });

  it("clears the saved game, and keeps stores apart", () => {
    saveGame(guest, freezeForStorage(fresh(), T0));
    assert.ok(loadGame(guest));
    assert.equal(loadGame(account), null);
    clearGame(guest);
    assert.equal(loadGame(guest), null);
  });

  it("refuses corrupt or tampered saved games", () => {
    const g = freezeForStorage(fresh(), T0);
    const bad = (patch: (o: Record<string, unknown>) => void) => {
      const o = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
      patch(o);
      return parseGame(o);
    };
    assert.ok(parseGame(JSON.parse(JSON.stringify(g))));
    assert.equal(bad((o) => (o.solution = "1".repeat(81))), null, "solution must be a valid grid");
    assert.equal(bad((o) => ((o.cells as { value: number }[])[0].value = 9)), null, "a clue cannot be altered");
    assert.equal(bad((o) => (o.puzzle = "x")), null);
    assert.equal(bad((o) => (o.mistakes = -1)), null);
    assert.equal(bad((o) => (o.difficulty = "nope")), null);
    assert.equal(bad((o) => (o.cells = [])), null);
    assert.equal(bad((o) => (o.status = "completed")), null);
    assert.equal(parseGame("nonsense"), null);
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:guest:v1:sudoku:game", "{broken");
    assert.equal(loadGame(guest), null);
  });

  it("does not restore a game whose board is already solved", () => {
    const { game, last } = nearlySolved();
    const finishedBoard = { ...game, cells: game.cells.map((c, i) => (i === last ? { ...c, value: right(game, i) } : c)) };
    assert.equal(parseGame(JSON.parse(JSON.stringify(freezeForStorage(finishedBoard, T0)))), null);
  });

  it("remembers settings and difficulty, with safe defaults", () => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.equal(loadDifficulty(), "easy");
    saveSettings({ highlight: "check", trackMistakes: false });
    saveDifficulty("hard");
    assert.deepEqual(loadSettings(), { highlight: "check", trackMistakes: false });
    assert.equal(loadDifficulty(), "hard");
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:sudoku:settings", "7");
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  });

  it("copes with storage that refuses to save", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    assert.equal(saveGame(guest, fresh()), false);
    assert.equal(saveSession(guest, session(1)), false);
  });
});

describe("digit counts", () => {
  it("counts each digit on the board", () => {
    const counts = digitCounts(fresh().cells);
    assert.equal(counts[0], 51);
    assert.equal(counts.reduce((a, b) => a + b, 0), 81);
  });
});
