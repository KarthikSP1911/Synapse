import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seededRng } from "@/lib/random";
import { loadActivityDays } from "@/features/offline/lib/activity-days";
import { GUEST_STORE, type LocalStore } from "@/features/offline/lib/guest/api";
import { localActivityDays } from "@/features/progress/lib/local-activity";
import { puzzleHintScope } from "@/features/rewards/components/use-paid-hint";
import { balanceOf } from "@/features/rewards/lib/ledger";
import { awardGrants, hintCooldownLeft, requestHint } from "@/features/rewards/lib/service";
import { loadWallet } from "@/features/rewards/lib/wallet-store";
import { cellsAlong, pointToCell, type BoardRect } from "@/features/games/shared/lib/board-geometry";
import { beginDraft, draftCells, extendDraft } from "./draw";
import {
  MAX_HISTORY,
  checkBoard,
  commitPatch,
  conflicts,
  elapsedAt,
  freezeForStorage,
  hasProgress,
  isComplete,
  modelFor,
  newGame,
  pauseGame,
  redo,
  remaining,
  removePatch,
  resetPatches,
  restartGame,
  resumeGame,
  toSessionData,
  undo,
} from "./game";
import { generatePuzzle } from "./generator";
import { deliverHint, giveHint, wrongPatches } from "./hints";
import { cascadeSteps, cellsPath, outlinePath } from "./outline";
import { isConnected } from "./shapes";
import { parsePuzzle } from "./puzzle-format";
import { MIN_MS_PER_CLUE, parseSessionData } from "./records";
import { sessionGrants } from "./rewards";
import { ownerMap } from "./rules";
import { BASE_POINTS, scoreGame } from "./scoring";
import { computeStats } from "./stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, parseGame, saveDifficulty, saveGame, saveSession, saveSettings } from "./storage";
import { DEFAULT_SETTINGS, type GameState, type Puzzle } from "./types";

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const realNow = Date.now;
let clock = 1_800_000_000_000;
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  clock = 1_800_000_000_000;
  Date.now = () => clock;
});
afterEach(() => {
  Date.now = realNow;
});

const guest = GUEST_STORE;
const account: LocalStore = { key: "mathz:user:v1:7", syncable: true };

/** A 2 x 2 square, a tall domino and a wide row: one way to place them. */
const TINY: Puzzle = { difficulty: "easy", puzzle: "3x3;0:4s,2:2t,6:3w", solution: [0, 0, 1, 0, 0, 1, 2, 2, 2] };
const MEDIUM = generatePuzzle("medium", seededRng(42));
const EXPERT = generatePuzzle("expert", seededRng(7));

const fresh = (puzzle: Puzzle = TINY, id = "patches-0001") => newGame(puzzle, id, clock);
const cellsOf = (puzzle: Puzzle, clue: number): number[] => puzzle.solution.flatMap((owner, cell) => (owner === clue ? [cell] : []));
const clueCount = (puzzle: Puzzle): number => parsePuzzle(puzzle.puzzle)!.clues.length;

/** Places every patch of the solution (in clue order), asserting each is accepted. */
function solve(state: GameState, puzzle: Puzzle, skip: number[] = []): GameState {
  let g = state;
  for (let clue = 0; clue < clueCount(puzzle); clue++) {
    if (skip.includes(clue)) continue;
    const result = commitPatch(g, cellsOf(puzzle, clue), clock);
    assert.equal(result.refused, null, `clue ${clue} refused`);
    g = result.state;
  }
  return g;
}

describe("placing patches", () => {
  it("accepts a valid patch, files one undo step and clears the hint", () => {
    const g = fresh();
    const placed = commitPatch(g, [4, 1, 3, 0], clock);
    assert.equal(placed.refused, null);
    assert.deepEqual(placed.state.patches, [{ clue: 0, cells: [0, 1, 3, 4] }], "cells are stored sorted");
    assert.equal(placed.state.undoStack.length, 1);
    assert.equal(remaining(placed.state), 5);
    assert.ok(hasProgress(placed.state) && !hasProgress(g));
  });

  it("refuses an invalid patch with a reason and leaves the very same state", () => {
    const g = fresh();
    const cases: [number[], string][] = [
      [[0, 1], "shape"], // wide where a square is asked
      [[2, 5, 8], "area"], // a tall rectangle, but three cells
      [[0, 4], "disconnected"],
      [[1], "no-clue"],
      [[0, 1, 2], "many-clues"],
      [[2, 4], "disconnected"],
      [[], "empty"],
    ];
    for (const [cells, reason] of cases) {
      const result = commitPatch(g, cells, clock);
      assert.equal(result.refused?.reason, reason, cells.join(","));
      assert.equal(result.state, g, "nothing changes");
    }
  });

  it("never lets patches overlap, and never shows a half-valid patch", () => {
    let g = commitPatch(fresh(), [0, 1, 3, 4], clock).state;
    const again = commitPatch(g, [0, 1, 3, 4], clock);
    assert.equal(again.refused?.reason, "overlap");
    assert.equal(again.state.patches.length, 1);
    assert.equal(commitPatch(g, [1, 2], clock).refused?.reason, "overlap");
    g = commitPatch(g, [2, 5], clock).state;
    assert.equal(g.patches.length, 2);
    for (const patch of g.patches) assert.ok(patch.cells.length > 0);
  });

  it("takes a clue that says nothing as any rectangle, and an area-only clue as a rectangle of that area", () => {
    const blank = newGame({ difficulty: "easy", puzzle: "3x3;0,8", solution: [0, 0, 0, 0, 0, 0, 1, 1, 1] }, "patches-blank", clock);
    assert.equal(commitPatch(blank, [0], clock).refused, null, "one cell");
    assert.equal(commitPatch(blank, [0, 1, 2, 3, 4, 5], clock).refused, null, "two rows");
    assert.equal(commitPatch(blank, [0, 1, 3], clock).refused?.reason, "shape", "not bent");
    const area = newGame({ difficulty: "easy", puzzle: "3x3;0:4", solution: [0, 0, 0, 0, 0, 0, 0, 0, 0] }, "patches-area", clock);
    assert.equal(commitPatch(area, [0, 1, 3, 4], clock).refused, null);
    assert.equal(commitPatch(area, [0, 1, 2, 3], clock).refused?.reason, "shape", "four cells, but bent");
  });

  it("takes any connected shape for a freeform clue, and only connected ones", () => {
    const puzzle = parsePuzzle(EXPERT.puzzle)!;
    const clue = puzzle.clues.findIndex((c) => c.shape === "free");
    assert.ok(clue >= 0);
    const g = fresh(EXPERT, "patches-free");
    assert.equal(commitPatch(g, cellsOf(EXPERT, clue), clock).refused, null);
    const cells = cellsOf(EXPERT, clue);
    // Take away a cell whose loss leaves the rest in one piece: the shape is still joined, but a cell short.
    const spare = cells.find((cell) => cell !== puzzle.clues[clue].cell && isConnected(cells.filter((c) => c !== cell), puzzle.cols))!;
    assert.equal(commitPatch(g, cells.filter((c) => c !== spare), clock).refused?.reason, "area", "a cell short");
    // Take away a cell in the middle of a thin part: what is left is in two pieces.
    const cut = cells.find((cell) => cell !== puzzle.clues[clue].cell && !isConnected(cells.filter((c) => c !== cell), puzzle.cols));
    if (cut !== undefined) assert.equal(commitPatch(g, cells.filter((c) => c !== cut), clock).refused?.reason, "disconnected");
  });

  it("ignores everything while the game is paused or finished", () => {
    const paused = pauseGame(fresh(), clock);
    assert.equal(commitPatch(paused, [0, 1, 3, 4], clock).state, paused);
    assert.equal(undo(paused), paused);
    const done = solve(fresh(), TINY);
    assert.equal(done.status, "completed");
    assert.equal(commitPatch(done, [0, 1, 3, 4], clock).state, done);
    assert.equal(removePatch(done, 0, clock), done);
    assert.equal(undo(done), done, "a solved board is final");
  });
});

describe("removing, undo, redo and reset", () => {
  it("removes a patch and brings it back with undo", () => {
    let g = solve(fresh(), TINY, [2]);
    const before = g.patches;
    g = removePatch(g, 1, clock);
    assert.deepEqual(g.patches.map((p) => p.clue), [0]);
    g = undo(g);
    assert.equal(g.patches, before, "the same patches come back, not copies");
    g = redo(g);
    assert.deepEqual(g.patches.map((p) => p.clue), [0]);
    assert.equal(removePatch(g, 2, clock), g, "removing what is not there changes nothing");
  });

  it("redo is cleared by a new move and undo/redo walk the whole history", () => {
    let g = fresh();
    g = commitPatch(g, [0, 1, 3, 4], clock).state;
    g = commitPatch(g, [2, 5], clock).state;
    g = undo(undo(g));
    assert.equal(g.patches.length, 0);
    assert.equal(g.redoStack.length, 2);
    g = redo(g);
    assert.equal(g.patches.length, 1);
    g = commitPatch(g, [6, 7, 8], clock).state;
    assert.equal(g.redoStack.length, 0);
    assert.equal(undo(fresh()).patches.length, 0);
  });

  it("resets to an empty board in one step that undo takes back, keeping the puzzle, clock and hints", () => {
    let g = solve(fresh(), TINY, [2]);
    g = { ...g, hintsUsed: 2 };
    const reset = resetPatches(g, clock);
    assert.deepEqual(reset.patches, []);
    assert.equal(reset.puzzle, g.puzzle);
    assert.deepEqual(reset.solution, g.solution);
    assert.equal(reset.hintsUsed, 2);
    assert.equal(reset.startedAt, g.startedAt);
    assert.deepEqual(undo(reset).patches, g.patches);
    assert.equal(resetPatches(fresh(), clock).patches.length, 0);
  });

  it("restarts the same puzzle with a clean slate and the same id", () => {
    const g = { ...solve(fresh(), TINY, [2]), hintsUsed: 3 };
    const again = restartGame(g, clock + 10);
    assert.equal(again.clientId, g.clientId);
    assert.deepEqual(again.patches, []);
    assert.equal(again.hintsUsed, 0);
    assert.equal(again.startedAt, clock + 10, "a restart is a new attempt");
    assert.equal(again.puzzle, g.puzzle);
  });

  it("keeps a bounded history", () => {
    let g = fresh();
    for (let i = 0; i < MAX_HISTORY + 20; i++) {
      g = commitPatch(g, [0, 1, 3, 4], clock).state;
      g = removePatch(g, 0, clock);
    }
    assert.ok(g.undoStack.length <= MAX_HISTORY);
  });

  it("keeps only the board in the state: what is drawn or animating can never be saved with it", () => {
    const g = solve(fresh(), TINY, [2]);
    assert.deepEqual(Object.keys(g).sort(), ["clientId", "difficulty", "elapsedMs", "endedAt", "hint", "hintsUsed", "patches", "puzzle", "redoStack", "resumedAt", "solution", "startedAt", "status", "undoStack"]);
    assert.deepEqual(JSON.parse(JSON.stringify(g)), g, "plain data, nothing that does not survive being saved");
  });
});

describe("solving", () => {
  it("is complete only when every cell is in a valid patch with its own clue", () => {
    for (const puzzle of [TINY, MEDIUM, EXPERT]) {
      const n = clueCount(puzzle);
      let g = fresh(puzzle, `patches-${n}-0001`);
      for (let clue = 0; clue < n; clue++) {
        assert.equal(isComplete(g), false);
        assert.equal(g.status, "playing");
        g = commitPatch(g, cellsOf(puzzle, clue), clock).state;
      }
      assert.equal(isComplete(g), true);
      assert.equal(g.status, "completed");
      assert.equal(g.endedAt, clock);
      assert.equal(remaining(g), 0);
    }
  });

  it("does not finish on a board that is full of patches but misses a clue", () => {
    const g = solve(fresh(MEDIUM, "patches-miss-1"), MEDIUM, [0]);
    assert.equal(g.status, "playing");
    assert.ok(remaining(g) > 0);
  });

  it("stops the clock when solved and counts only playing time", () => {
    let g = fresh();
    g = pauseGame(commitPatch(g, [0, 1, 3, 4], clock).state, clock + 1000);
    clock += 60_000;
    g = resumeGame(g, clock);
    clock += 500;
    g = commitPatch(commitPatch(g, [2, 5], clock).state, [6, 7, 8], clock).state;
    assert.equal(g.status, "completed");
    assert.equal(g.elapsedMs, 1500);
    assert.equal(elapsedAt(g, clock + 99_999), 1500);
  });
});

describe("dead ends and the Check button", () => {
  it("marks a cell no patch can cover, from the clues and placed patches alone", () => {
    // Two 1-cell clues leave seven cells that no patch could ever take.
    const dead = conflicts({ puzzle: "3x3;0:1,8:1", patches: [] });
    assert.deepEqual(dead.cells, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(dead.clues, []);
    assert.deepEqual(conflicts({ puzzle: "3x3;0,8", patches: [] }), { clues: [], cells: [] });
    assert.deepEqual(conflicts({ puzzle: "3x3;0,8", patches: [{ clue: 0, cells: [0] }] }), { clues: [], cells: [] }, "every cell can still be reached by some patch");
  });

  it("marks a clue that has lost every place", () => {
    // The 2 x 2 square at the corner has exactly one place, and a 3 x 3 block for the other clue takes its bottom-right cell.
    const block = [5, 6, 7, 9, 10, 11, 13, 14, 15];
    assert.deepEqual(conflicts({ puzzle: "4x4;0:4s,15", patches: [] }), { clues: [], cells: [] });
    const dead = conflicts({ puzzle: "4x4;0:4s,15", patches: [{ clue: 1, cells: block }] });
    assert.deepEqual(dead.clues, [0]);
  });

  it("says what is missing, what is stuck and when the board is solved", () => {
    const g = fresh();
    assert.match(checkBoard(g).message, /9 cells are still to cover/);
    const stuck = checkBoard({ ...g, puzzle: "3x3;0:1,8:1" });
    assert.match(stuck.message, /can no longer be covered/);
    assert.equal(checkBoard(g).solved, false);
    assert.equal(checkBoard(solve(g, TINY)).solved, true);
  });
});

// ---------------------------------------------------------------------------
// Drawing: the gesture rules behind the pointer, touch and keyboard handlers
// ---------------------------------------------------------------------------

describe("the drawing gesture", () => {
  const puzzle = parsePuzzle("4x4;0:4s,3:4f,12:6w,15")!;
  const none = new Int16Array(16).fill(-1);

  it("starts a rectangle on a free cell, a paint on a freeform clue, and nothing on a patch", () => {
    assert.deepEqual(beginDraft(puzzle, none, 5), { mode: "rect", anchor: 5, head: 5 });
    assert.deepEqual(beginDraft(puzzle, none, 0), { mode: "rect", anchor: 0, head: 0 });
    assert.deepEqual(beginDraft(puzzle, none, 3), { mode: "free", cells: [3], head: 3 });
    const taken = ownerMap([{ clue: 0, cells: [0, 1, 4, 5] }], 16);
    assert.equal(beginDraft(puzzle, taken, 5), null, "a patch cannot be drawn over");
  });

  it("follows a drag corner to corner, from any direction, and keeps the same draft when nothing moved", () => {
    let d = beginDraft(puzzle, none, 5)!;
    d = extendDraft(d, none, 10);
    assert.deepEqual(draftCells(d, 4), [5, 6, 9, 10]);
    assert.equal(extendDraft(d, none, 10), d);
    d = extendDraft(d, none, 0);
    assert.deepEqual(draftCells(d, 4), [0, 1, 4, 5], "dragging back past the start flips the rectangle");
    d = extendDraft(d, none, 5);
    assert.deepEqual(draftCells(d, 4), [5], "and back to one cell");
  });

  it("paints a freeform patch cell by cell, skipping patches and repeats", () => {
    const taken = ownerMap([{ clue: 2, cells: [7] }], 16);
    let d = beginDraft(puzzle, taken, 3)!;
    for (const cell of [2, 6, 7, 6, 10, 2]) d = extendDraft(d, taken, cell);
    assert.deepEqual(draftCells(d, 4), [2, 3, 6, 10], "7 belongs to a patch, repeats add nothing");
    assert.equal(d.head, 2);
  });

  it("commits a finished drag and throws a cancelled one away", () => {
    const g = newGame({ difficulty: "easy", puzzle: "4x4;0:4s,3:4f,12:6w,15", solution: new Array(16).fill(0) }, "patches-draw-1", clock);
    // A touch drag from the corner of the square to its opposite corner, then release: the patch is placed.
    let d = beginDraft(puzzle, ownerMap(g.patches, 16), 0)!;
    d = extendDraft(d, ownerMap(g.patches, 16), 5);
    const placed = commitPatch(g, draftCells(d, 4), clock);
    assert.equal(placed.refused, null);
    // A cancelled pointer drops the draft and never calls commit: the board is the one it was.
    const cancelled = beginDraft(puzzle, ownerMap(placed.state.patches, 16), 12)!;
    assert.equal(draftCells(cancelled, 4).length, 1);
    assert.equal(placed.state.patches.length, 1);
  });

  it("refuses a painted shape whose cells only touch at a corner", () => {
    const g = newGame({ difficulty: "easy", puzzle: "4x4;0:4s,3:4f,12:6w,15", solution: new Array(16).fill(0) }, "patches-draw-2", clock);
    let d = beginDraft(puzzle, none, 3)!;
    for (const cell of [2, 5, 9]) d = extendDraft(d, none, cell);
    const result = commitPatch(g, draftCells(d, 4), clock);
    assert.equal(result.refused?.reason, "disconnected");
  });

  it("sees the same cells on a 320px and a 360px phone", () => {
    for (const width of [296, 328]) {
      const rect: BoardRect = { left: 12, top: 80, width, height: width, rows: 9, cols: 9 };
      const size = width / 9;
      for (let cell = 0; cell < 81; cell++) {
        const x = rect.left + (cell % 9) * size + size / 2;
        const y = rect.top + Math.floor(cell / 9) * size + size / 2;
        assert.equal(pointToCell(rect, x, y, 1), cell);
      }
      assert.ok(size >= 32, "a cell stays big enough to hit");
      // A quick swipe across a row delivers two events and still passes through every cell between.
      const swipe = cellsAlong(rect, [rect.left + size / 2, rect.top + size / 2], [rect.left + 8.5 * size, rect.top + size / 2]);
      assert.deepEqual(swipe, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });

  it("draws outlines on the cell edges and fills cells in outwards from the clue", () => {
    assert.equal(outlinePath([0, 1, 3, 4], 3).split("M").length - 1, 8, "a 2 x 2 patch has eight unit sides");
    assert.equal(outlinePath([4], 3), "M1 1h1M2 1v1M1 2h1M1 1v1");
    assert.equal(cellsPath([0, 4], 3), "M0 0h1v1h-1zM1 1h1v1h-1z");
    assert.deepEqual(cascadeSteps([0, 1, 2, 4], 1, 3), [1, 0, 1, 1]);
    assert.deepEqual(cascadeSteps([0, 8], 0, 3), [0, 1], "an unreachable cell simply comes last");
  });
});

describe("motion", () => {
  const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const section = css.slice(css.indexOf(".pt-board {"));

  it("switches off every Patches animation for people who prefer reduced motion", () => {
    const reduced = section.slice(section.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    const animated = [...section.matchAll(/([^{}@]+)\{([^}]*)\banimation:/g)].map((m) => m[1].trim().split("\n").pop()!.trim());
    assert.ok(animated.length >= 10, "found the animated rules");
    for (const selector of animated) assert.ok(reduced.includes(selector), `${selector} still animates with reduced motion`);
  });

  it("keeps the win wave, the sweep and the pop on their own selectors so a missing class is noticed", () => {
    for (const name of ["pt-fill-in", "pt-pop", "pt-sweep", "pt-win", "pt-shake", "pt-hint"]) assert.ok(section.includes(`@keyframes ${name}`), name);
  });
});

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

describe("hints", () => {
  /** A candidate patch of some clue that is valid on its own but is not the solution's. */
  function validButWrong(puzzle: Puzzle, state: GameState) {
    const model = modelFor(puzzle.puzzle);
    const owner = ownerMap(state.patches, model.n);
    for (let clue = 0; clue < model.cands.length; clue++) {
      if (state.patches.some((p) => p.clue === clue)) continue;
      const right = cellsOf(puzzle, clue).join(",");
      for (const c of model.cands[clue]) if (c.cells.join(",") !== right && c.cells.every((cell) => owner[cell] < 0)) return { clue, cells: c.cells };
    }
    throw new Error("no wrong candidate");
  }

  it("points at a clue first and shows its patch only when asked again, changing nothing on the board", () => {
    const g = fresh(MEDIUM, "patches-hint-1");
    const first = giveHint(g);
    assert.equal(first.hintsUsed, 1);
    assert.equal(first.hint?.kind, "focus");
    assert.deepEqual(first.patches, g.patches);
    assert.ok(first.hint!.cells.length <= 2, "a focus hint points at a clue and at most one more cell");
    const second = giveHint(first);
    assert.equal(second.hint?.kind, "reveal");
    assert.deepEqual(second.hint?.cells, cellsOf(MEDIUM, first.hint!.clue), "the reveal is the solution's patch for that clue");
    assert.equal(second.hintsUsed, 2);
    assert.equal(giveHint(second), second, "nothing more to give until the board changes");
  });

  it("goes away when the board changes", () => {
    const g = giveHint(fresh(TINY, "patches-hint-2"));
    assert.ok(g.hint);
    assert.equal(commitPatch(g, [0, 1, 3, 4], clock).state.hint, null);
    assert.equal(undo(commitPatch(g, [0, 1, 3, 4], clock).state).hint, null);
  });

  it("calls a wrong patch wrong, says why, and then helps with the right one", () => {
    let g = fresh(MEDIUM, "patches-hint-3");
    const wrong = validButWrong(MEDIUM, g);
    g = commitPatch(g, wrong.cells, clock).state;
    assert.equal(g.patches.length, 1, "it is a legal patch, so the board accepts it");
    assert.equal(wrongPatches(g).length, 1);
    const hinted = giveHint(g);
    assert.equal(hinted.hint?.kind, "wrong");
    assert.deepEqual(hinted.hint?.cells, wrong.cells);
    assert.match(hinted.hint!.text, /not part of the solution/);
    assert.equal(giveHint(hinted), hinted, "the same patch is not pointed at twice for the price of two");
    const removed = removePatch(hinted, wrong.clue, clock);
    assert.equal(removed.hintsUsed, 1);
    assert.notEqual(giveHint(removed).hint?.kind, "wrong");
  });

  it("finishes a whole puzzle from hints alone, every hint agreeing with the unique solution", () => {
    for (const puzzle of [MEDIUM, EXPERT]) {
      let g = fresh(puzzle, `patches-walk-${puzzle.difficulty}`);
      for (let guard = 0; guard < 80 && g.status === "playing"; guard++) {
        const focus = giveHint(g);
        assert.equal(focus.hintsUsed, g.hintsUsed + 1);
        assert.ok(focus.hint && focus.hint.kind === "focus", focus.hint?.kind);
        assert.ok(!g.patches.some((p) => p.clue === focus.hint!.clue), "it points at a clue that still needs a patch");
        const reveal = giveHint(focus);
        assert.equal(reveal.hint?.kind, "reveal");
        g = commitPatch(reveal, reveal.hint!.cells, clock).state;
        assert.equal(wrongPatches(g).length, 0);
      }
      assert.equal(g.status, "completed");
      assert.ok(g.hintsUsed >= 2);
    }
  });

  it("gives nothing for a solved or paused game", () => {
    const done = solve(fresh(), TINY);
    assert.equal(giveHint(done), done);
    const paused = pauseGame(fresh(), clock);
    assert.equal(giveHint(paused), paused);
  });
});

describe("paying for hints", () => {
  const scopeOf = (g: GameState) => puzzleHintScope("patches", g);
  const balance = (store: LocalStore = guest) => balanceOf(loadWallet(store));
  const fund = (coins: number, store: LocalStore = guest) => awardGrants(store, [{ key: `fund:${store.key}`, amount: coins, reason: "test", ref: "r", at: clock }]);
  const payer = (g: GameState, store: LocalStore = guest) => (ordinal: number) => requestHint(store, { chargeScope: scopeOf(g), cooldownScope: scopeOf(g), ordinal }, clock);

  it("charges five coins, shows the hint and starts a five second cooldown that survives a reload", () => {
    fund(20);
    const g = fresh(MEDIUM, "patches-pay-1");
    const result = deliverHint(g, payer(g));
    assert.equal(result.outcome, "given");
    assert.equal(result.state.hintsUsed, 1);
    assert.ok(result.state.hint);
    assert.equal(balance(), 15);
    assert.equal(hintCooldownLeft(guest, scopeOf(g), clock), 5000, "read back from storage, not from React state");
    clock += 4000;
    assert.equal(hintCooldownLeft(guest, scopeOf(g), clock), 1000);
  });

  it("refuses a second hint during the cooldown, however it is asked, without charging or showing anything", () => {
    fund(20);
    const g = fresh(MEDIUM, "patches-pay-2");
    const first = deliverHint(g, payer(g)).state;
    const results = [1, 2, 3, 4].map(() => deliverHint(first, payer(g)));
    for (const r of results) {
      assert.equal(r.outcome, "refused");
      assert.equal(r.state, first, "no hint, no hint counted");
    }
    assert.equal(balance(), 15);
    clock += 5000;
    assert.equal(deliverHint(first, payer(g)).outcome, "given");
    assert.equal(balance(), 10);
  });

  it("charges nothing, shows nothing and starts no cooldown without enough coins", () => {
    fund(3);
    const g = fresh(MEDIUM, "patches-pay-3");
    const result = deliverHint(g, payer(g));
    assert.equal(result.outcome, "refused");
    assert.equal(result.state, g);
    assert.equal(balance(), 3);
    assert.equal(hintCooldownLeft(guest, scopeOf(g), clock), 0);
  });

  it("never asks for payment when there is no hint to give", () => {
    fund(20);
    const g = giveHint(giveHint(fresh(MEDIUM, "patches-pay-4")));
    let asked = 0;
    const result = deliverHint(g, () => {
      asked++;
      return { ok: true };
    });
    assert.equal(result.outcome, "none");
    assert.equal(asked, 0);
    assert.equal(balance(), 20);
  });

  it("keeps the cooldown to this puzzle: another puzzle, or another game, can still be asked", () => {
    fund(30);
    const a = fresh(MEDIUM, "patches-pay-5");
    const b = fresh(MEDIUM, "patches-pay-6");
    assert.equal(deliverHint(a, payer(a)).outcome, "given");
    assert.equal(deliverHint(b, payer(b)).outcome, "given");
    assert.ok(requestHint(guest, { chargeScope: "zip:other0001:1", cooldownScope: "zip:other0001:1", ordinal: 1 }, clock).ok);
    assert.equal(balance(), 15);
    assert.notEqual(scopeOf(a), scopeOf(restartGame(a, clock + 1)), "a restart is a new attempt");
  });

  it("charges the same hint once even when it is retried, so a crash between charge and display costs nothing the second time", () => {
    fund(20);
    const g = fresh(MEDIUM, "patches-pay-7");
    assert.equal(deliverHint(g, payer(g)).outcome, "given");
    clock += 10_000;
    assert.equal(deliverHint(g, payer(g)).outcome, "given");
    assert.equal(balance(), 15);
  });
});

// ---------------------------------------------------------------------------
// Saving, restoring, history and rewards
// ---------------------------------------------------------------------------

describe("the unfinished game", () => {
  it("is restored exactly: the puzzle, the patches, the history, the hints and the played time", () => {
    let g = fresh(MEDIUM, "patches-save-1");
    g = commitPatch(g, cellsOf(MEDIUM, 0), clock).state;
    g = commitPatch(g, cellsOf(MEDIUM, 1), clock).state;
    g = undo(g);
    g = giveHint(g);
    clock += 7000;
    const frozen = freezeForStorage(g, clock);
    assert.equal(saveGame(guest, frozen), true);
    const back = loadGame(guest)!;
    assert.ok(back);
    assert.equal(back.puzzle, MEDIUM.puzzle);
    assert.deepEqual(back.solution, MEDIUM.solution);
    assert.deepEqual(back.patches, g.patches);
    assert.deepEqual(back.undoStack, g.undoStack);
    assert.deepEqual(back.redoStack, g.redoStack);
    assert.equal(back.hintsUsed, 1);
    assert.equal(back.hint, null, "a pointed-at hint is not kept");
    assert.equal(back.status, "paused", "it comes back paused");
    assert.equal(back.elapsedMs, 7000);
    assert.equal(back.startedAt, g.startedAt);
    assert.equal(resumeGame(back, clock).status, "playing");
  });

  it("keeps a guest's game and an account's apart, and forgets a cleared one", () => {
    saveGame(guest, fresh(MEDIUM, "patches-save-2"));
    assert.equal(loadGame(account), null);
    saveGame(account, fresh(TINY, "patches-save-3"));
    assert.equal(loadGame(account)?.clientId, "patches-save-3");
    assert.equal(loadGame(guest)?.clientId, "patches-save-2");
    clearGame(guest);
    assert.equal(loadGame(guest), null);
    assert.equal(loadGame(account)?.clientId, "patches-save-3");
  });

  it("refuses anything that was edited into something else", () => {
    const good = JSON.parse(JSON.stringify(commitPatch(fresh(TINY, "patches-save-4"), [0, 1, 3, 4], clock).state));
    assert.ok(parseGame(good));
    const edit = (change: (g: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(good));
      change(copy);
      return parseGame(copy);
    };
    assert.equal(edit((g) => (g.puzzle = "3x3;0:4s,2:2t,6:2w")), null, "another puzzle");
    assert.equal(edit((g) => (g.solution = [0, 0, 1, 0, 0, 1, 2, 2, 1])), null, "another solution");
    assert.equal(edit((g) => (g.patches = [{ clue: 0, cells: [0, 1] }])), null, "a patch that breaks its clue");
    assert.equal(edit((g) => (g.patches = [{ clue: 0, cells: [0, 1, 3, 4] }, { clue: 1, cells: [4, 5] }])), null, "overlapping patches");
    assert.equal(edit((g) => (g.patches = [{ clue: 0, cells: [4, 3, 1, 0] }])), null, "cells out of order");
    assert.equal(edit((g) => (g.patches = [{ clue: 1, cells: [0, 1, 3, 4] }])), null, "under the wrong clue");
    assert.equal(edit((g) => (g.undoStack = [[{ clue: 9, cells: [0] }]])), null);
    assert.equal(edit((g) => (g.hintsUsed = -1)), null);
    assert.equal(edit((g) => (g.status = "completed")), null);
    assert.equal(edit((g) => (g.clientId = "x")), null);
    assert.equal(parseGame(null), null);
    assert.equal(parseGame("nope"), null);
  });

  it("is not an unfinished game once the board is solved", () => {
    const solved = JSON.parse(JSON.stringify({ ...solve(fresh(), TINY), status: "paused" }));
    assert.equal(parseGame(solved), null);
  });

  it("survives broken storage", () => {
    storage.items.set(`${guest.key}:patches:game`, "{not json");
    assert.equal(loadGame(guest), null);
    storage.items.set("mathz:patches:settings", "[1]");
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  });
});

describe("remembered choices", () => {
  it("remembers the difficulty and the settings, and falls back to defaults", () => {
    assert.equal(loadDifficulty(), "easy");
    saveDifficulty("hard");
    assert.equal(loadDifficulty(), "hard");
    storage.items.set("mathz:patches:difficulty", "nightmare");
    assert.equal(loadDifficulty(), "easy");
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    saveSettings({ autoCheck: false, showRemaining: false, larger: true });
    assert.deepEqual(loadSettings(), { autoCheck: false, showRemaining: false, larger: true });
    storage.items.set("mathz:patches:settings", JSON.stringify({ autoCheck: "yes", larger: true }));
    assert.deepEqual(loadSettings(), { ...DEFAULT_SETTINGS, larger: true });
  });
});

describe("a finished game", () => {
  const T0 = Date.parse("2026-10-13T12:00:00Z");
  const solvedAt = (id: string, at: number) => {
    clock = at - 20_000;
    let g = fresh(MEDIUM, id);
    clock = at - 10_000;
    g = solve(g, MEDIUM);
    assert.equal(g.status, "completed");
    return toSessionData(g, at);
  };

  it("pays the difficulty's coins once and records one day of activity, however often it is saved", () => {
    const data = solvedAt("patches-win-0001", T0);
    assert.equal(data.completed, true);
    assert.equal(sessionGrants(data)[0].amount, 15);
    for (let i = 0; i < 3; i++) assert.equal(saveSession(guest, data), true);
    assert.equal(loadHistory(guest).length, 1);
    assert.equal(balanceOf(loadWallet(guest)), 15, "a repeat does not pay again");
    assert.deepEqual(loadActivityDays(guest.key).length, 1);
    saveSession(account, data);
    saveSession(account, data);
    assert.equal(balanceOf(loadWallet(account)), 15);
    assert.deepEqual([...localActivityDays(account, "UTC")], ["2026-10-13"]);
  });

  it("pays nothing and counts no day for a game that was opened, played a little or given up", () => {
    let g = fresh(MEDIUM, "patches-win-0002");
    saveGame(guest, g);
    g = commitPatch(g, cellsOf(MEDIUM, 0), clock).state;
    saveGame(guest, g);
    assert.deepEqual(loadActivityDays(guest.key), []);
    const gaveUp = toSessionData(g, clock + 5000);
    assert.equal(gaveUp.completed, false);
    saveSession(guest, gaveUp);
    assert.equal(balanceOf(loadWallet(guest)), 0);
    assert.deepEqual(loadActivityDays(guest.key), []);
    assert.deepEqual([...localActivityDays(guest, "UTC")], []);
    assert.equal(scoreGame(gaveUp).total, 0);
  });

  it("counts attempts, completions and best time per difficulty", () => {
    const a = solvedAt("patches-win-0003", T0);
    const b = { ...solvedAt("patches-win-0004", T0 + 100_000), elapsedMs: 5000, hintsUsed: 2 };
    const gaveUp = { ...a, clientId: "patches-win-0005", completed: false };
    const stats = computeStats([a, b, gaveUp], "hard");
    assert.equal(stats.byDifficulty.medium.attempted, 3);
    assert.equal(stats.byDifficulty.medium.completed, 2);
    assert.equal(stats.byDifficulty.medium.bestTimeMs, 5000);
    assert.equal(stats.byDifficulty.medium.hintsUsed, 2);
    assert.equal(stats.byDifficulty.hard.attempted, 1, "the unfinished game counts as an attempt");
    assert.ok(stats.byDifficulty.medium.bestScore >= BASE_POINTS.medium * 0.75);
  });

  it("scores by difficulty, with a time bonus and a small hint penalty", () => {
    const quick = scoreGame({ difficulty: "hard", completed: true, elapsedMs: 0, hintsUsed: 0 });
    assert.equal(quick.base, BASE_POINTS.hard);
    assert.equal(quick.timeBonus, BASE_POINTS.hard / 2);
    const slow = scoreGame({ difficulty: "hard", completed: true, elapsedMs: 3_000_000, hintsUsed: 2 });
    assert.equal(slow.timeBonus, 0);
    assert.equal(slow.hintPenalty, Math.round(BASE_POINTS.hard * 0.06));
  });
});

describe("uploaded records", () => {
  const T0 = 1_800_000_000_000;
  const record = (patch: Record<string, unknown> = {}) => ({
    clientId: "patches-up-0001",
    startedAt: T0,
    endedAt: T0 + 600_000,
    difficulty: "medium",
    puzzle: MEDIUM.puzzle,
    completed: true,
    elapsedMs: 60_000,
    hintsUsed: 1,
    ...patch,
  });
  const parse = (raw: unknown) => parseSessionData(raw, { now: T0 + 700_000, verify: true });

  it("accepts a good record and checks the puzzle has one solution", () => {
    assert.equal(parse(record()).ok, true);
    assert.equal(parse(record({ puzzle: "3x3;0,8" })).ok, false, "four solutions");
    assert.equal(parse(record({ puzzle: "3x3;0:2,1:2" })).ok, false, "none");
    assert.equal(parseSessionData(record({ puzzle: "3x3;0,8" }), { now: T0 + 700_000 }).ok, true, "only uploads are searched");
  });

  it("rejects what cannot be true, keeping the id so the device stops retrying", () => {
    const bad: Record<string, unknown>[] = [
      { difficulty: "nightmare" },
      { puzzle: "9x9;" },
      { completed: "yes" },
      { elapsedMs: -1 },
      { elapsedMs: 9_999_999 },
      { hintsUsed: 5000 },
      { hintsUsed: 1.5 },
      { elapsedMs: 100, completed: true },
      { endedAt: T0 + 10_000_000 },
    ];
    for (const patch of bad) {
      const result = parse(record(patch));
      assert.equal(result.ok, false, JSON.stringify(patch));
      if (!result.ok) assert.equal(result.clientId, "patches-up-0001");
    }
    assert.equal(parse(record({ elapsedMs: 100, completed: false })).ok, true, "a quick give-up is fine");
    assert.ok(MIN_MS_PER_CLUE * clueCount(MEDIUM) > 100);
  });
});
