import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { seededRng } from "@/lib/random";
import { MAX_PLAYED_MS } from "@/lib/records";
import { rate, hintStep } from "./deduce";
import { GenerationError, PROFILES, generatePuzzle } from "./generator";
import { MIN_MS_PER_ROW, parseSessionData } from "./records";
import {
  boardOf,
  checkBoard,
  clearBoard,
  elapsedAt,
  freezeForStorage,
  giveHint,
  hasProgress,
  isComplete,
  markCells,
  newGame,
  pauseGame,
  queensOn,
  redo,
  restartGame,
  resumeGame,
  setCell,
  tapCell,
  toSessionData,
  undo,
  DOUBLE_TAP_MS,
  MAX_HISTORY,
} from "./game";
import { conflictingQueens, findConflicts, isSolution, neighbors8, parseRegions, regionCells, sizeOf } from "./grid";
import { BASE_POINTS, PAR_MS, scoreGame } from "./scoring";
import { countSolutions, solve, solveOtherThan } from "./solver";
import { computeStats } from "./stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, parseGame, saveDifficulty, saveGame, saveSession, saveSettings } from "./storage";
import { CROSS, DEFAULT_SETTINGS, EMPTY, HINTED, QUEEN, type GameState, type Mark, type Puzzle, type SessionData } from "./types";
import { DIFFICULTIES, type Difficulty } from "@/features/games/shared/lib/puzzle-session";

/** Puzzles frozen from `generatePuzzle(d, seededRng(seed))`; each is checked below, not trusted. */
const EASY: Puzzle = { difficulty: "easy", regions: "100004110004512300522330523330223333", solution: "514203" };
const MEDIUM: Puzzle = { difficulty: "medium", regions: "0033666033333600315560331155001115140441114442111", solution: "6415203" };
const HARD: Puzzle = { difficulty: "hard", regions: "3333366633720066377222623722222277772222774772225544421155555111", solution: "04615273" };
const EXPERT: Puzzle = { difficulty: "expert", regions: "885553333485555533485555511484555511444555112444455122444007122400077177000677777", solution: "074268513" };

/** Five rows as five regions: many solutions. */
const ROWS5 = "0000011111222223333344444";
/** Two one-cell regions in the same row: both need a queen in that row, so there is no solution. */
const IMPOSSIBLE5 = "0122222222333334444444444";

const T0 = 1_700_000_000_000;
const fresh = (p: Puzzle = EASY): GameState => newGame(p, "client-0001", T0);
const cellOf = (g: GameState, row: number): number => row * g.size + Number(g.solution[row]);
/** A cell that is not a queen of the solution. */
const nonSolution = (g: GameState): number => g.cells.findIndex((_, i) => String(i % g.size) !== g.solution[Math.floor(i / g.size)]);

function solved(p: Puzzle = EASY): GameState {
  let g = fresh(p);
  for (let r = 0; r < g.size; r++) {
    g = setCell(g, cellOf(g, r), QUEEN, T0 + 1000 + r);
  }
  return g;
}

describe("grid", () => {
  it("accepts supported sizes only", () => {
    assert.equal(sizeOf("0".repeat(25)), 5);
    assert.equal(sizeOf("0".repeat(81)), 9);
    assert.equal(sizeOf("0".repeat(16)), null);
    assert.equal(sizeOf("0".repeat(100)), null);
    assert.equal(sizeOf("0".repeat(26)), null);
  });

  it("parses a valid board and rejects broken ones", () => {
    const board = parseRegions(EASY.regions);
    assert.ok(board);
    assert.equal(board.n, 6);
    assert.equal(parseRegions(ROWS5)?.n, 5);
    assert.equal(parseRegions(null), null);
    assert.equal(parseRegions(EASY.regions.slice(1)), null, "wrong length");
    assert.equal(parseRegions("x".repeat(36)), null, "not digits");
    assert.equal(parseRegions(EASY.regions.replace("1", "7")), null, "digit beyond n");
    assert.equal(parseRegions(ROWS5.replaceAll("4", "3")), null, "a region is missing");
    // Region 0 split into two separate pieces.
    assert.equal(parseRegions("0100110011222223333344444".replace("0100110011", "0111001001")), null, "a region is in two pieces");
  });

  it("finds a cell's neighbours including diagonals, clipped at the edges", () => {
    assert.deepEqual(neighbors8(0, 5).sort((a, b) => a - b), [1, 5, 6]);
    assert.equal(neighbors8(12, 5).length, 8);
    assert.equal(neighbors8(4, 5).length, 3);
  });

  it("groups the cells of each region", () => {
    const board = parseRegions(ROWS5)!;
    const cells = regionCells(board.reg, board.n);
    assert.deepEqual(cells[2], [10, 11, 12, 13, 14]);
  });

  it("reports row, column, region and touching conflicts, diagonals included", () => {
    const board = parseRegions(ROWS5)!;
    const marks = (...queens: number[]): Mark[] => Array.from({ length: 25 }, (_, i) => (queens.includes(i) ? QUEEN : EMPTY));
    assert.deepEqual(findConflicts(marks(0, 7, 14), board), []);
    assert.deepEqual(findConflicts(marks(0, 3), board).map((c) => c.kind), ["row", "region"]);
    assert.deepEqual(findConflicts(marks(0, 15), board).map((c) => c.kind), ["column"]);
    // (0,0) and (1,1) touch diagonally, though row, column and region all differ.
    const diagonal = findConflicts(marks(0, 6), board);
    assert.deepEqual(diagonal.map((c) => c.kind), ["touch"]);
    assert.deepEqual(diagonal[0].cells, [0, 6]);
    // Straight neighbours touch too, and cross-outs never conflict.
    assert.deepEqual(findConflicts(marks(0, 5), board).map((c) => c.kind).sort(), ["column", "touch"]);
    const crosses: Mark[] = Array.from({ length: 25 }, () => CROSS);
    assert.deepEqual(findConflicts(crosses, board), []);
    assert.deepEqual([...conflictingQueens(diagonal)].sort(), [0, 6]);
  });

  it("recognises a complete rule-abiding placement", () => {
    const board = parseRegions(EASY.regions)!;
    assert.ok(isSolution(board, Array.from(EASY.solution, Number)));
    assert.equal(isSolution(board, [0, 1, 2, 3, 4, 5]), false);
    assert.equal(isSolution(board, [5, 1, 4]), false);
  });
});

describe("solver", () => {
  it("counts zero, one and several solutions", () => {
    assert.equal(countSolutions(parseRegions(ROWS5)!, 2), 2, "stops at the limit");
    assert.ok(countSolutions(parseRegions(ROWS5)!, 100) > 2);
    for (const p of [EASY, MEDIUM, HARD, EXPERT]) assert.equal(countSolutions(parseRegions(p.regions)!, 5), 1, p.difficulty);
  });

  it("finds the stored solution of each fixture", () => {
    for (const p of [EASY, MEDIUM, HARD, EXPERT]) assert.equal(solve(parseRegions(p.regions)!)!.join(""), p.solution, p.difficulty);
  });

  it("finds a second solution only when there is one", () => {
    const rows = parseRegions(ROWS5)!;
    const first = solve(rows)!;
    const other = solveOtherThan(rows, first);
    assert.ok(other);
    assert.notDeepEqual(other, first);
    assert.ok(isSolution(rows, other));
    const board = parseRegions(EASY.regions)!;
    assert.equal(solveOtherThan(board, Array.from(EASY.solution, Number)), null);
  });

  it("returns nothing for a board with no solution", () => {
    const board = parseRegions(IMPOSSIBLE5);
    assert.ok(board);
    assert.equal(countSolutions(board, 2), 0);
    assert.equal(solve(board), null);
  });
});

describe("deduction and rating", () => {
  it("rates the fixtures at the tiers they were generated for", () => {
    assert.equal(rate(parseRegions(EASY.regions)!).level, 2);
    assert.equal(rate(parseRegions(MEDIUM.regions)!).level, 3);
    assert.equal(rate(parseRegions(HARD.regions)!).level, 4);
    assert.ok((rate(parseRegions(EXPERT.regions)!).level ?? 0) >= 5);
  });

  it("is stuck, not wrong, when the techniques are capped too low", () => {
    assert.equal(rate(parseRegions(HARD.regions)!, 3).level, null);
    assert.equal(rate(parseRegions(MEDIUM.regions)!, 2).level, null);
  });

  it("only ever places queens of the real solution", () => {
    for (const p of [EASY, MEDIUM, HARD, EXPERT]) {
      const board = parseRegions(p.regions)!;
      const found = hintStep(board, []);
      assert.ok(found, p.difficulty);
      assert.equal(found.queen !== null && String(found.queen % board.n) === p.solution[Math.floor(found.queen / board.n)], true, `${p.difficulty}: the next forced queen is part of the solution`);
    }
  });

  it("a hint never repeats a cross-out the player already made", () => {
    const board = parseRegions(EASY.regions)!;
    const first = hintStep(board, [])!;
    const skip = new Set(first.step.eliminate);
    const second = hintStep(board, [], skip)!;
    if (first.step.place === null && second.step.place === null) assert.ok(second.step.eliminate.some((c) => !skip.has(c)));
  });
});

describe("generator", () => {
  const seeds = [1, 2, 3];

  it("builds valid, uniquely solvable puzzles at the rating each difficulty asks for", () => {
    for (const difficulty of DIFFICULTIES) {
      const profile = PROFILES[difficulty];
      for (const seed of seeds) {
        const p = generatePuzzle(difficulty, seededRng(seed * 31));
        const board = parseRegions(p.regions);
        assert.ok(board, `${difficulty} #${seed}: valid regions (connected, all present)`);
        assert.equal(board.n, profile.size);
        assert.equal(countSolutions(board, 2), 1, `${difficulty} #${seed}: exactly one solution`);
        const columns = Array.from(p.solution, Number);
        assert.ok(isSolution(board, columns), `${difficulty} #${seed}: one queen per row, column and region, none touching`);
        assert.deepEqual(solve(board), columns);
        const { level } = rate(board);
        assert.ok(level !== null && level >= profile.minLevel && level <= profile.maxLevel, `${difficulty} #${seed}: rating ${level}`);
        assert.equal(p.difficulty, difficulty);
      }
    }
  });

  it("is repeatable for a seed, and different across seeds", () => {
    assert.deepEqual(generatePuzzle("medium", seededRng(5)), generatePuzzle("medium", seededRng(5)));
    assert.notEqual(generatePuzzle("medium", seededRng(5)).regions, generatePuzzle("medium", seededRng(6)).regions);
  });

  it("does not let region numbers hint at the solution", () => {
    // Regions are grown from the queens row by row; relabelling must break the link in at least some puzzles.
    const linked = [1, 2, 3, 4, 5, 6].filter((seed) => {
      const p = generatePuzzle("easy", seededRng(seed));
      return Array.from(p.solution, Number).every((c, r) => p.regions[r * 6 + c] === String(r));
    });
    assert.ok(linked.length < 6);
  });

  it("gives up with an error instead of returning a puzzle it could not verify", () => {
    assert.throws(() => generatePuzzle("expert", seededRng(1), { maxAttempts: 1, maxMs: 1000 }), GenerationError);
    assert.throws(() => generatePuzzle("hard", seededRng(1), { maxAttempts: 0, maxMs: 1000 }), GenerationError);
  });
});

describe("playing", () => {
  it("starts empty, running, with the puzzle's size and no hints", () => {
    const g = fresh();
    assert.equal(g.cells.length, 36);
    assert.ok(g.cells.every((m) => m === EMPTY));
    assert.equal(g.status, "playing");
    assert.equal(g.hintsUsed, 0);
    assert.equal(boardOf(g).n, 6);
    assert.throws(() => newGame({ ...EASY, regions: "nope" }, "client-0001", T0));
  });

  it("taps through empty, cross-out and queen, and back to empty", () => {
    let g = fresh();
    g = tapCell(g, 5, T0);
    assert.equal(g.cells[5], CROSS);
    g = tapCell(g, 5, T0 + 1000);
    assert.equal(g.cells[5], QUEEN);
    g = tapCell(g, 5, T0 + 2000);
    assert.equal(g.cells[5], EMPTY);
  });

  it("ignores a fast extra tap that would take a queen away again", () => {
    let g = fresh();
    g = tapCell(tapCell(g, 5, T0), 5, T0 + 100);
    assert.equal(g.cells[5], QUEEN);
    const quick = tapCell(g, 5, T0 + 100 + DOUBLE_TAP_MS - 1);
    assert.equal(quick, g, "too soon: nothing changes");
    assert.equal(tapCell(g, 5, T0 + 100 + DOUBLE_TAP_MS).cells[5], EMPTY);
    // Tapping a different cell in between does not matter for another cell.
    assert.equal(tapCell(g, 6, T0 + 101).cells[6], CROSS);
  });

  it("sets cells directly and refuses bad indices", () => {
    let g = setCell(fresh(), 3, QUEEN, T0);
    assert.equal(g.cells[3], QUEEN);
    g = setCell(g, 3, EMPTY, T0);
    assert.equal(g.cells[3], EMPTY);
    assert.equal(setCell(g, 99, QUEEN, T0), g);
    assert.equal(tapCell(g, -1, T0), g);
  });

  it("crosses out and clears cross-outs by dragging, but never touches a queen", () => {
    let g = fresh();
    g = setCell(g, 1, QUEEN, T0);
    const dragged = markCells(g, [0, 1, 2, 2, 3], CROSS, T0 + 10);
    assert.deepEqual(dragged.cells.slice(0, 4), [CROSS, QUEEN, CROSS, CROSS]);
    assert.equal(dragged.undoStack.length, 2, "the whole drag is one step");
    const cleared = markCells(dragged, [0, 1, 2], EMPTY, T0 + 20);
    assert.deepEqual(cleared.cells.slice(0, 4), [EMPTY, QUEEN, EMPTY, CROSS]);
    assert.equal(markCells(g, [1], EMPTY, T0), g, "nothing to change returns the same state");
  });

  it("undoes and redoes, and a new move forgets what was undone", () => {
    let g = fresh();
    g = tapCell(g, 0, T0);
    g = tapCell(g, 1, T0);
    g = undo(g);
    assert.equal(g.cells[1], EMPTY);
    assert.equal(g.redoStack.length, 1);
    g = redo(g);
    assert.equal(g.cells[1], CROSS);
    g = undo(undo(g));
    assert.deepEqual(g.cells.slice(0, 2), [EMPTY, EMPTY]);
    assert.equal(undo(g), g, "nothing left to undo");
    g = tapCell(g, 4, T0);
    assert.equal(g.redoStack.length, 0);
    assert.equal(redo(g), g);
  });

  it("keeps only the latest moves", () => {
    let g = fresh();
    for (let i = 0; i < MAX_HISTORY + 20; i++) g = tapCell(g, i % 2, T0 + i * 1000);
    assert.equal(g.undoStack.length, MAX_HISTORY);
  });

  it("clears the board in one step and keeps revealed queens", () => {
    let g = fresh();
    g = setCell(g, 0, CROSS, T0);
    g = setCell(g, 7, QUEEN, T0);
    g = { ...g, cells: g.cells.map((m, i) => (i === 20 ? HINTED : m)) as Mark[] };
    const cleared = clearBoard(g, T0 + 5);
    assert.deepEqual(cleared.cells.filter((m) => m !== EMPTY), [HINTED]);
    assert.equal(cleared.undoStack.length, g.undoStack.length + 1);
    assert.deepEqual(undo(cleared).cells, g.cells, "undo brings everything back");
    const empty = fresh();
    assert.equal(clearBoard(empty, T0), empty, "an empty board has nothing to clear");
  });

  it("restarts the same puzzle with the same id and a clean slate", () => {
    let g = fresh();
    g = giveHint(tapCell(g, 0, T0), T0 + 1);
    const again = restartGame(g, T0 + 5000);
    assert.equal(again.clientId, g.clientId);
    assert.equal(again.regions, g.regions);
    assert.equal(again.hintsUsed, 0);
    assert.ok(again.cells.every((m) => m === EMPTY));
    assert.equal(again.elapsedMs, 0);
    assert.equal(again.startedAt, T0 + 5000);
    assert.equal(again.undoStack.length, 0);
  });

  it("does not accept moves while paused or after the game is solved", () => {
    const paused = pauseGame(fresh(), T0 + 1000);
    assert.equal(tapCell(paused, 0, T0), paused);
    assert.equal(markCells(paused, [0], CROSS, T0), paused);
    assert.equal(giveHint(paused, T0), paused);
    const done = solved();
    assert.equal(tapCell(done, 0, T0), done);
    assert.equal(undo(done), done);
  });
});

describe("rules and completion", () => {
  it("is complete only with every queen right: n queens, no conflicts", () => {
    const g = solved();
    assert.equal(g.status, "completed");
    assert.ok(isComplete(g));
    assert.equal(queensOn(g.cells).length, 6);
    assert.ok(g.endedAt !== null);
  });

  it("is not complete with too few queens, or with rule breaks", () => {
    let g = fresh();
    for (let r = 0; r < 5; r++) g = setCell(g, cellOf(g, r), QUEEN, T0 + r);
    assert.equal(isComplete(g), false);
    assert.equal(g.status, "playing");
    // Six queens in the wrong places never complete the puzzle.
    let bad = fresh();
    for (let r = 0; r < 6; r++) bad = setCell(bad, r * 6, QUEEN, T0 + r);
    assert.equal(queensOn(bad.cells).length, 6);
    assert.equal(isComplete(bad), false);
    assert.equal(bad.status, "playing");
  });

  it("completes through any queen kind, including a revealed one", () => {
    let g = fresh();
    for (let r = 0; r < 5; r++) g = setCell(g, cellOf(g, r), QUEEN, T0 + r);
    g = { ...g, cells: g.cells.map((m, i) => (i === cellOf(g, 5) ? HINTED : m)) as Mark[] };
    assert.ok(isComplete(g));
  });

  it("checks the rules without revealing the solution", () => {
    let g = fresh();
    assert.deepEqual(checkBoard(g), { conflicts: [], queens: 0, ok: true });
    // A queen in a wrong but rule-abiding place is not a "conflict": Check does not know the answer.
    const wrongSpot = nonSolution(g);
    g = setCell(g, wrongSpot, QUEEN, T0);
    assert.equal(checkBoard(g).ok, true);
    g = setCell(g, wrongSpot + 1 < 36 ? wrongSpot + 1 : wrongSpot - 1, QUEEN, T0);
    const result = checkBoard(g);
    assert.equal(result.ok, false);
    assert.ok(result.conflicts.some((c) => c.kind === "touch"));
  });
});

describe("hints", () => {
  it("points at a wrong queen first and does not charge twice for the same one", () => {
    let g = fresh();
    const bad = nonSolution(g);
    g = setCell(g, bad, QUEEN, T0);
    const hinted = giveHint(g, T0 + 1);
    assert.equal(hinted.hint?.kind, "wrong");
    assert.deepEqual(hinted.hint?.cells, [bad]);
    assert.equal(hinted.hintsUsed, 1);
    assert.equal(giveHint(hinted, T0 + 2), hinted, "asking again about the same queen is free");
  });

  it("grows over three presses: reason, then cells, then the queen itself", () => {
    let g = fresh();
    g = giveHint(g, T0);
    assert.equal(g.hint?.kind, "reason");
    assert.ok(g.hint!.units.length > 0);
    assert.ok(g.hint!.text.length > 10);
    assert.equal(g.hintsUsed, 1);
    g = giveHint(g, T0 + 1);
    assert.equal(g.hint?.kind, "cells");
    assert.ok(g.hint!.cells.length > 0);
    assert.equal(g.hintsUsed, 2);
    const queen = g.hint!.queen!;
    assert.ok(queen !== null);
    g = giveHint(g, T0 + 2);
    assert.equal(g.hintsUsed, 3);
    assert.equal(g.hint, null);
    assert.equal(g.cells[queen], HINTED);
    assert.equal(String(queen % g.size), g.solution[Math.floor(queen / g.size)], "the queen it places is part of the solution");
  });

  it("goes away when the board changes, then starts again from the reason", () => {
    let g = giveHint(fresh(), T0);
    assert.ok(g.hint);
    g = tapCell(g, 0, T0 + 1);
    assert.equal(g.hint, null);
    assert.equal(giveHint(g, T0 + 2).hint?.kind, "reason");
  });

  it("locks a revealed queen", () => {
    let g = fresh();
    for (let i = 0; i < 3; i++) g = giveHint(g, T0 + i);
    const at = g.cells.findIndex((m) => m === HINTED);
    assert.ok(at >= 0);
    assert.equal(tapCell(g, at, T0 + 99_999), g);
    assert.equal(setCell(g, at, EMPTY, T0), g);
    assert.equal(markCells(g, [at], CROSS, T0), g);
  });

  it("can play a whole puzzle out of hints, every queen logical", () => {
    let g = fresh(MEDIUM);
    let guard = 0;
    while (g.status === "playing" && guard++ < 200) g = giveHint(g, T0 + guard);
    assert.equal(g.status, "completed");
    assert.ok(g.hintsUsed >= 3 * 1);
    assert.deepEqual(queensOn(g.cells).map((i) => i % g.size), Array.from(g.solution, Number).map((c) => c));
  });

  it("never suggests a cross-out the player already made", () => {
    let g = fresh();
    const first = giveHint(giveHint(g, T0), T0 + 1);
    const asked = first.hint!.cells.filter((c) => first.hint!.eliminate.includes(c));
    if (asked.length > 0) {
      for (const c of asked) g = setCell(g, c, CROSS, T0 + 5);
      const second = giveHint(giveHint(g, T0 + 10), T0 + 11).hint!;
      assert.ok(second.cells.some((c) => !asked.includes(c)) || second.cells.length === 0 || second.eliminate.every((c) => !asked.includes(c)));
    }
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

  it("stops at the moment of the last queen", () => {
    const g = solved();
    assert.equal(g.elapsedMs, 1005);
    assert.equal(elapsedAt(g, T0 + 99_999_999), g.elapsedMs);
  });
});

describe("records and scoring", () => {
  it("turns a finished game into a record", () => {
    const g = solved();
    const data = toSessionData(g, T0 + 99_999);
    assert.equal(data.completed, true);
    assert.equal(data.puzzle, EASY.regions);
    assert.equal(data.hintsUsed, 0);
    assert.equal(data.endedAt, g.endedAt);
    const abandoned = toSessionData(tapCell(fresh(), 0, T0 + 500), T0 + 7000);
    assert.equal(abandoned.completed, false);
    assert.equal(abandoned.endedAt, T0 + 7000);
    assert.equal(hasProgress(fresh()), false);
    assert.equal(hasProgress(tapCell(fresh(), 0, T0)), true);
    assert.equal(hasProgress(giveHint(fresh(), T0)), true);
  });

  it("scores by difficulty, time and hints, and nothing when not solved", () => {
    const base = { difficulty: "medium", completed: true, elapsedMs: 0, hintsUsed: 0 } as const;
    assert.deepEqual(scoreGame(base), { base: 800, timeBonus: 400, hintPenalty: 0, total: 1200 });
    assert.equal(scoreGame({ ...base, elapsedMs: PAR_MS.medium }).timeBonus, 200);
    assert.equal(scoreGame({ ...base, elapsedMs: 2 * PAR_MS.medium }).timeBonus, 0);
    assert.equal(scoreGame({ ...base, elapsedMs: 10 * PAR_MS.medium }).total, 800);
    assert.equal(scoreGame({ ...base, hintsUsed: 2 }).hintPenalty, 48);
    assert.equal(scoreGame({ ...base, hintsUsed: 99 }).hintPenalty, 200, "capped at 25%");
    assert.equal(scoreGame({ ...base, completed: false }).total, 0);
    for (const d of DIFFICULTIES) assert.ok(BASE_POINTS[d] > 0 && PAR_MS[d] > 0);
    assert.ok(BASE_POINTS.easy < BASE_POINTS.medium && BASE_POINTS.medium < BASE_POINTS.hard && BASE_POINTS.hard < BASE_POINTS.expert);
  });

  const record = (patch: Partial<Record<keyof SessionData, unknown>> = {}) => ({
    clientId: "client-0001",
    startedAt: T0,
    endedAt: T0 + 60_000,
    difficulty: "easy",
    puzzle: EASY.regions,
    completed: true,
    elapsedMs: 30_000,
    hintsUsed: 1,
    ...patch,
  });

  it("accepts a good record and rejects bad ones with a reason", () => {
    const ok = parseSessionData(record(), { now: T0 + 120_000, verify: true });
    assert.equal(ok.ok, true);
    const bad = (patch: Partial<Record<keyof SessionData, unknown>>, options?: { now?: number; verify?: boolean }) => parseSessionData(record(patch), options);
    assert.equal(bad({ difficulty: "nope" }).ok, false);
    assert.equal(bad({ puzzle: "123" }).ok, false);
    assert.equal(bad({ completed: "yes" }).ok, false);
    assert.equal(bad({ elapsedMs: -1 }).ok, false);
    assert.equal(bad({ elapsedMs: MAX_PLAYED_MS + 1, endedAt: T0 + MAX_PLAYED_MS * 2 }).ok, false);
    assert.equal(bad({ elapsedMs: 70_000 }).ok, false, "more playing time than the game lasted");
    assert.equal(bad({ hintsUsed: -1 }).ok, false);
    assert.equal(bad({ hintsUsed: 1.5 }).ok, false);
    assert.equal(bad({ clientId: "x" }).ok, false);
    assert.equal(bad({ endedAt: T0 - 1 }).ok, false);
    assert.equal(bad({}, { now: T0 - 600_000 }).ok, false, "ends in the future");
    assert.equal(bad({ elapsedMs: MIN_MS_PER_ROW * 6 - 1 }).ok, false, "solved implausibly fast");
    assert.equal(bad({ elapsedMs: 100, completed: false }).ok, true, "an abandoned game may be short");
    assert.equal(parseSessionData(null).ok, false);
  });

  it("keeps the client id of a rejected record, so a device can stop retrying it", () => {
    const rejected = parseSessionData(record({ difficulty: "nope" }));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.clientId, "client-0001");
  });

  it("only on upload checks that the puzzle has exactly one solution", () => {
    const loose = record({ puzzle: ROWS5, elapsedMs: 30_000 });
    assert.equal(parseSessionData(loose).ok, true, "the structure is fine");
    const verified = parseSessionData(loose, { verify: true });
    assert.equal(verified.ok, false);
    if (!verified.ok) assert.match(verified.reason, /exactly one solution/);
  });
});

describe("stats", () => {
  const game = (patch: Partial<SessionData> = {}): SessionData => ({ clientId: `c-${Math.random()}`, startedAt: T0, endedAt: T0 + 1000, difficulty: "easy", puzzle: EASY.regions, completed: true, elapsedMs: 60_000, hintsUsed: 0, ...patch });

  it("works out each difficulty on its own", () => {
    const stats = computeStats([game({ elapsedMs: 90_000 }), game({ elapsedMs: 50_000, hintsUsed: 2 }), game({ completed: false }), game({ difficulty: "hard" })]);
    const easy = stats.byDifficulty.easy;
    assert.equal(easy.attempted, 3);
    assert.equal(easy.completed, 2);
    assert.equal(easy.completionRate, 66);
    assert.equal(easy.bestTimeMs, 50_000);
    assert.equal(easy.averageTimeMs, 70_000);
    assert.equal(easy.independent, 1);
    assert.equal(easy.hintsUsed, 2);
    assert.ok(easy.bestScore > 0);
    assert.equal(stats.byDifficulty.medium.attempted, 0);
    assert.equal(stats.byDifficulty.medium.bestTimeMs, null);
    assert.equal(stats.attempted, 4);
    assert.equal(stats.hintsUsed, 2);
  });

  it("counts the unfinished game as an attempt at its difficulty", () => {
    const stats = computeStats([game()], "medium");
    assert.equal(stats.byDifficulty.medium.attempted, 1);
    assert.equal(stats.byDifficulty.medium.completionRate, 0);
    assert.equal(stats.attempted, 2);
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

  const session = (n: number, patch: Partial<SessionData> = {}): SessionData => ({
    clientId: `client-${String(n).padStart(4, "0")}`,
    startedAt: T0 + n,
    endedAt: T0 + n + 1000,
    difficulty: "easy",
    puzzle: EASY.regions,
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
    let g = tapCell(fresh(), 0, T0);
    g = restartGame(g, T0 + 1000);
    for (let r = 0; r < g.size; r++) g = setCell(g, cellOf(g, r), QUEEN, T0 + 5000 + r * 400);
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
    let g = fresh();
    g = tapCell(g, 0, T0 + 1000);
    g = setCell(g, cellOf(g, 2), QUEEN, T0 + 2000);
    g = giveHint(g, T0 + 3000);
    g = giveHint(g, T0 + 3500);
    g = giveHint(g, T0 + 4000);
    const saved = freezeForStorage(g, T0 + 9000);
    assert.equal(saved.status, "paused");
    assert.ok(saveGame(guest, saved));

    const back = loadGame(guest)!;
    assert.ok(back);
    assert.deepEqual(back.cells, g.cells);
    assert.equal(back.regions, g.regions);
    assert.equal(back.solution, g.solution);
    assert.equal(back.difficulty, g.difficulty);
    assert.equal(back.hintsUsed, 3);
    assert.equal(back.hint, null);
    assert.equal(back.status, "paused");
    assert.equal(back.elapsedMs, 9000);
    assert.equal(back.undoStack.length, g.undoStack.length);
    assert.equal(elapsedAt(back, T0 + 86_400_000), 9000, "closed for a day: the clock has not moved");
    assert.equal(undo(resumeGame(back, T0 + 86_400_000)).cells.length, 36);
  });

  it("clears the saved game, and keeps stores apart", () => {
    saveGame(guest, freezeForStorage(fresh(), T0));
    assert.ok(loadGame(guest));
    assert.equal(loadGame(account), null);
    clearGame(guest);
    assert.equal(loadGame(guest), null);
  });

  it("refuses corrupt or tampered saved games", () => {
    const g = tapCell(freezeForStorage(fresh(), T0), 0, T0);
    const bad = (patch: (o: Record<string, unknown>) => void) => {
      const o = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
      patch(o);
      return parseGame(o);
    };
    assert.ok(parseGame(JSON.parse(JSON.stringify(g))));
    assert.equal(bad((o) => (o.solution = "000000")), null, "the solution must be a valid placement");
    assert.equal(bad((o) => (o.regions = ROWS5)), null, "the board must have exactly one solution matching");
    assert.equal(bad((o) => (o.regions = "x")), null);
    assert.equal(bad((o) => (o.hintsUsed = -1)), null);
    assert.equal(bad((o) => (o.difficulty = "nope")), null);
    assert.equal(bad((o) => (o.cells = [])), null);
    assert.equal(bad((o) => ((o.cells as number[])[0] = 7)), null, "an unknown mark");
    assert.equal(bad((o) => (o.status = "completed")), null);
    assert.equal(bad((o) => (o.elapsedMs = -5)), null);
    assert.equal(bad((o) => (o.undoStack = [{ changes: [{ index: 99, before: 0, after: 1 }] }])), null);
    // A revealed queen outside the solution cannot be real.
    assert.equal(bad((o) => ((o.cells as number[])[nonSolution(g)] = HINTED)), null);
    assert.equal(parseGame("nonsense"), null);
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:guest:v1:queens:game", "{broken");
    assert.equal(loadGame(guest), null);
  });

  it("does not restore a game whose board is already solved", () => {
    const done = solved();
    assert.equal(parseGame(JSON.parse(JSON.stringify({ ...freezeForStorage(done, T0), status: "paused", endedAt: null }))), null);
  });

  it("remembers settings and difficulty, with safe defaults", () => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.equal(loadDifficulty(), "easy");
    saveSettings({ autoCheck: false });
    saveDifficulty("expert" satisfies Difficulty);
    assert.deepEqual(loadSettings(), { autoCheck: false });
    assert.equal(loadDifficulty(), "expert");
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:queens:settings", "7");
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
    assert.doesNotThrow(() => saveSettings({ autoCheck: true }));
    assert.doesNotThrow(() => clearGame(guest));
  });
});
