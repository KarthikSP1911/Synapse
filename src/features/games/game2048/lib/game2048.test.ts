import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyCells, emptyGrid, hasMoves, highestTileOf, moveGrid, spawnTile, startingGrid, type Rng } from "./engine";
import { applyMove, continuePlaying, elapsedAt, freezeForStorage, hasProgress, liftBest, newGame, resetBest, startClock, stopClock, toSessionData, undo } from "./game";
import { MAX_SCORE, minScoreFor, parseSessionData } from "./records";
import { computeStats } from "./stats";
import { clearGame, loadBest, loadGame, loadHistory, parseGame, saveBest, saveGame, saveSession } from "./storage";
import { advanceTiles, gridOfTiles, tilesFromGrid } from "./tiles";
import { CELLS, type Direction, type GameState, type Grid, type SessionData } from "./types";

const T0 = 1_700_000_000_000;

/** A random source that returns the given numbers in turn (and repeats the last one when they run out). */
const fixed = (...values: number[]): Rng => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

/** Four rows of four, for readable boards. */
const board = (...rows: number[][]): Grid => rows.flat();
const rowsOf = (grid: Grid): number[][] => [0, 1, 2, 3].map((r) => grid.slice(r * 4, r * 4 + 4));
const move = (rows: number[][], direction: Direction) => moveGrid(board(...rows), direction);

/**
 * One move from game over: sliding left frees the top-right cell, the new 2 lands there, and then no tile has an equal
 * neighbour anywhere (top row becomes 8, 16, 32, 2).
 */
const NEARLY_OVER = board([0, 8, 16, 32], [4, 2, 4, 64], [2, 4, 2, 4], [4, 2, 4, 2]);

/** A game on a chosen board; the next spawn goes to the first empty cell as a 2 with `fixed(0, 0)`. */
function gameOn(grid: Grid, over: Partial<GameState> = {}): GameState {
  return { ...newGame("client-0001", T0, fixed(0, 0)), grid, highestTile: highestTileOf(grid), ...over };
}

describe("moving a line", () => {
  it("slides tiles to the edge", () => {
    assert.deepEqual(move([[0, 2, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left").grid.slice(0, 4), [2, 4, 0, 0]);
    assert.deepEqual(move([[2, 0, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "right").grid.slice(0, 4), [0, 0, 2, 4]);
  });

  it("merges equal neighbours: [2, 2, 4, 0] becomes [4, 4, 0, 0]", () => {
    const r = move([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left");
    assert.deepEqual(r.grid.slice(0, 4), [4, 4, 0, 0]);
    assert.equal(r.gained, 4);
  });

  it("merges [2, 2, 2, 2] into [4, 4, 0, 0], not [8, 0, 0, 0]", () => {
    const r = move([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left");
    assert.deepEqual(r.grid.slice(0, 4), [4, 4, 0, 0]);
    assert.equal(r.gained, 8);
  });

  it("merges from the edge the tiles move towards", () => {
    assert.deepEqual(move([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left").grid.slice(0, 4), [4, 2, 0, 0]);
    assert.deepEqual(move([[0, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "right").grid.slice(0, 4), [0, 0, 2, 4]);
    assert.deepEqual(move([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "right").grid.slice(0, 4), [0, 0, 2, 4]);
  });

  it("never merges a tile twice in one move", () => {
    // 4,4,8: the two 4s make an 8 that must not also merge with the existing 8.
    assert.deepEqual(move([[4, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left").grid.slice(0, 4), [8, 8, 0, 0]);
    // 2,2,4,8 -> 4,4,8: the new 4 does not merge with the 4 behind it.
    assert.deepEqual(move([[2, 2, 4, 8], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left").grid.slice(0, 4), [4, 4, 8, 0]);
    // A merged tile stays put until the next move.
    assert.deepEqual(move([[8, 4, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left").grid.slice(0, 4), [8, 8, 0, 0]);
  });

  it("does not merge unequal tiles", () => {
    const r = move([[2, 4, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left");
    assert.deepEqual(r.grid.slice(0, 4), [2, 4, 2, 4]);
    assert.equal(r.gained, 0);
    assert.ok(!r.moved);
  });
});

describe("moving the board", () => {
  const start = board([2, 0, 0, 2], [0, 4, 0, 0], [0, 0, 0, 0], [8, 0, 0, 8]);

  it("moves in all four directions", () => {
    assert.deepEqual(rowsOf(moveGrid(start, "left").grid), [[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [16, 0, 0, 0]]);
    assert.deepEqual(rowsOf(moveGrid(start, "right").grid), [[0, 0, 0, 4], [0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 16]]);
    assert.deepEqual(rowsOf(moveGrid(start, "up").grid), [[2, 4, 0, 2], [8, 0, 0, 8], [0, 0, 0, 0], [0, 0, 0, 0]]);
    assert.deepEqual(rowsOf(moveGrid(start, "down").grid), [[0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 2], [8, 4, 0, 8]]);
  });

  it("merges vertically and scores every merge once", () => {
    const g = board([2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]);
    const up = moveGrid(g, "up");
    assert.deepEqual(rowsOf(up.grid), [[4, 0, 0, 0], [8, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    assert.equal(up.gained, 12);
    const down = moveGrid(g, "down");
    assert.deepEqual(rowsOf(down.grid), [[0, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0], [8, 0, 0, 0]]);
  });

  it("handles simultaneous merges in several lines", () => {
    const r = moveGrid(board([2, 2, 0, 0], [4, 4, 0, 0], [8, 8, 0, 0], [16, 16, 0, 0]), "left");
    assert.deepEqual(rowsOf(r.grid), [[4, 0, 0, 0], [8, 0, 0, 0], [16, 0, 0, 0], [32, 0, 0, 0]]);
    assert.equal(r.gained, 4 + 8 + 16 + 32);
  });

  it("is deterministic and leaves its input alone", () => {
    const copy = [...start];
    const a = moveGrid(start, "left");
    const b = moveGrid(start, "left");
    assert.deepEqual(a, b);
    assert.deepEqual(start, copy);
  });

  it("keeps the sum of the tiles", () => {
    for (const d of ["up", "down", "left", "right"] as const) {
      assert.equal(moveGrid(start, d).grid.reduce((a, b) => a + b, 0), 2 + 2 + 4 + 8 + 8);
    }
  });

  it("reports no movement on a board that cannot change", () => {
    const g = board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]);
    for (const d of ["up", "down", "left", "right"] as const) assert.ok(!moveGrid(g, d).moved);
    assert.ok(!moveGrid(emptyGrid(), "left").moved);
    assert.ok(!moveGrid(board([2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), "left").moved, "already at the edge");
  });

  it("describes where every tile went", () => {
    const r = moveGrid(board([0, 2, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), "left");
    assert.deepEqual(r.moves, [
      { from: 1, to: 0, value: 2, merged: true },
      { from: 2, to: 0, value: 2, merged: true },
      { from: 3, to: 1, value: 4, merged: false },
    ]);
  });
});

describe("spawning tiles", () => {
  it("puts the new tile in an empty cell only", () => {
    const g = board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]);
    const s = spawnTile(g, fixed(0, 0))!;
    assert.equal(s.index, 15);
    assert.equal(s.grid.filter((v) => v === 0).length, 0);
    assert.equal(spawnTile(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]), fixed(0, 0)), null);
  });

  it("chooses uniformly among the empty cells", () => {
    const g = board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    const empties = emptyCells(g);
    assert.equal(empties.length, 15);
    assert.equal(spawnTile(g, fixed(0, 0))!.index, 1, "lowest draw: first empty cell");
    assert.equal(spawnTile(g, fixed(0.9999, 0))!.index, 15, "highest draw: last empty cell");
    assert.equal(spawnTile(g, fixed(0.5, 0))!.index, empties[7]);
  });

  it("spawns a 2 about 90% of the time and a 4 about 10%", () => {
    assert.equal(spawnTile(emptyGrid(), fixed(0, 0.8999))!.value, 2);
    assert.equal(spawnTile(emptyGrid(), fixed(0, 0.9))!.value, 4);
    // And over many draws from a real generator the share is close to 90%.
    let seed = 12345;
    const rng: Rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    let twos = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (spawnTile(emptyGrid(), rng)!.value === 2) twos++;
    assert.ok(Math.abs(twos / n - 0.9) < 0.01, `share of 2s was ${twos / n}`);
  });

  it("starts a game with exactly two tiles, each a 2 or a 4", () => {
    for (const rng of [fixed(0, 0, 0, 0), fixed(0.3, 0.95, 0.6, 0.1), Math.random]) {
      const g = startingGrid(rng);
      assert.equal(g.length, CELLS);
      const tiles = g.filter((v) => v !== 0);
      assert.equal(tiles.length, 2);
      assert.ok(tiles.every((v) => v === 2 || v === 4));
    }
  });
});

describe("a move in a game", () => {
  it("slides, scores, and adds one tile", () => {
    const g = gameOn(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const out = applyMove(g, "left", T0 + 1000, fixed(0, 0));
    assert.deepEqual(rowsOf(out.state.grid)[0], [4, 2, 0, 0], "merged 4, then the new 2 in the first empty cell");
    assert.equal(out.state.score, 4);
    assert.equal(out.state.moves, 1);
    assert.equal(out.state.grid.filter((v) => v).length, 2);
    assert.deepEqual(out.spawn, { index: 1, value: 2 });
  });

  it("does nothing for a move that changes nothing: no tile, no score, nothing to undo", () => {
    const g = gameOn(board([2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const out = applyMove(g, "left", T0 + 1000, fixed(0, 0));
    assert.equal(out.state, g);
    assert.equal(out.result, null);
    assert.equal(out.spawn, null);
  });

  it("raises the best score as soon as the score passes it", () => {
    const g = gameOn(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { best: 3 });
    assert.equal(applyMove(g, "left", T0, fixed(0, 0)).state.best, 4);
    const high = gameOn(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { best: 1000 });
    assert.equal(applyMove(high, "left", T0, fixed(0, 0)).state.best, 1000);
  });

  it("tracks the highest tile", () => {
    const g = gameOn(board([64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    assert.equal(applyMove(g, "left", T0, fixed(0, 0)).state.highestTile, 128);
  });
});

describe("winning", () => {
  const nearWin = () => gameOn(board([1024, 1024, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));

  it("wins when a 2048 tile is made, and says so once", () => {
    const out = applyMove(nearWin(), "left", T0, fixed(0, 0));
    assert.equal(out.state.status, "won");
    assert.ok(out.state.reached2048);
    assert.equal(out.state.highestTile, 2048);
    assert.equal(out.state.score, 2048);
  });

  it("stops accepting moves until the player chooses", () => {
    const won = applyMove(nearWin(), "left", T0, fixed(0, 0)).state;
    const out = applyMove(won, "down", T0, fixed(0, 0));
    assert.equal(out.state, won);
    assert.equal(out.result, null);
  });

  it("continues with the same board and score, and does not win again for a second 2048", () => {
    const won = applyMove(nearWin(), "left", T0, fixed(0, 0)).state;
    const cont = continuePlaying(won, T0 + 10);
    assert.equal(cont.status, "playing");
    assert.ok(cont.continued && cont.reached2048);
    assert.deepEqual(cont.grid, won.grid);
    assert.equal(cont.score, won.score);
    // Make another 2048 later: no second win screen.
    const again = gameOn(board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { reached2048: true, continued: true, score: 2048, highestTile: 2048 });
    const out = applyMove(again, "left", T0, fixed(0, 0));
    assert.equal(out.state.status, "playing");
    assert.equal(out.state.score, 4096);
  });

  it("can keep growing past 2048", () => {
    const g = gameOn(board([2048, 2048, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { reached2048: true, continued: true });
    const out = applyMove(g, "left", T0, fixed(0, 0));
    assert.equal(out.state.grid[0], 4096);
    assert.equal(out.state.highestTile, 4096);
  });

  it("only continues from the won screen", () => {
    const g = gameOn(board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    assert.equal(continuePlaying(g, T0), g);
  });

  it("goes straight to game over when continuing on a board with no move left", () => {
    const stuck = gameOn(board([2048, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]), { status: "won", reached2048: true });
    const cont = continuePlaying(stuck, T0 + 500);
    assert.equal(cont.status, "over");
    assert.equal(cont.endedAt, T0 + 500);
  });
});

describe("game over", () => {
  it("is not over while any cell is empty", () => {
    assert.ok(hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0])));
  });

  it("is not over while two equal tiles touch, side by side or one above the other", () => {
    assert.ok(hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4])));
    assert.ok(hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2].map((v, i) => (i === 3 ? 4 : v)))));
    assert.ok(hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 8, 4], [4, 2, 8, 2])), "vertical pair");
    assert.ok(hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [2, 2, 4, 2])), "pair on the bottom row");
  });

  it("is over when the board is full and nothing can merge", () => {
    assert.ok(!hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2])));
    assert.ok(!hasMoves(board([2, 4, 8, 16], [32, 64, 128, 256], [2, 4, 8, 16], [32, 64, 128, 256])));
  });

  it("ends the game when the move that fills the board leaves no merge", () => {
    const out = applyMove(gameOn(NEARLY_OVER), "left", T0 + 5000, fixed(0, 0));
    assert.deepEqual(rowsOf(out.state.grid)[0], [8, 16, 32, 2], "row slid left; the new 2 took the freed cell");
    assert.equal(out.state.status, "over");
    assert.equal(out.state.endedAt, T0 + 5000);
    assert.equal(out.state.resumedAt, null, "the clock stops");
    assert.equal(applyMove(out.state, "left", T0, fixed(0, 0)).state, out.state, "no moves after game over");
  });

  it("does not end the game when the new tile makes a merge possible", () => {
    // The tile that appears lands above an equal tile, so a merge is still possible.
    const g = gameOn(board([0, 8, 16, 32], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 64]));
    const out = applyMove(g, "left", T0, fixed(0, 0)); // a 2 lands above the 2 in the last column
    assert.ok(hasMoves(out.state.grid));
    assert.equal(out.state.status, "playing");
  });

  it("detects a merge available only in the last row or column", () => {
    assert.ok(hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 8, 8])));
    assert.ok(hasMoves(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 8], [4, 2, 4, 8])));
  });
});

describe("undo", () => {
  const start = () => gameOn(board([2, 2, 0, 0], [0, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { best: 2 });

  it("has nothing to undo at the start or after a move that did nothing", () => {
    const g = start();
    assert.equal(undo(g, T0), g);
    const same = applyMove(gameOn(board([2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), "left", T0, fixed(0, 0)).state;
    assert.equal(same.previous, null);
  });

  it("restores board, score, best and move count", () => {
    const g = start();
    const moved = applyMove(g, "left", T0 + 100, fixed(0, 0)).state;
    assert.equal(moved.score, 4);
    assert.equal(moved.best, 4);
    const back = undo(moved, T0 + 200);
    assert.deepEqual(back.grid, g.grid);
    assert.equal(back.score, 0);
    assert.equal(back.best, 2, "the best score from before the move comes back too");
    assert.equal(back.moves, 0);
    assert.equal(back.undosUsed, 1);
    assert.equal(back.previous, null);
  });

  it("is one step: a second undo does nothing", () => {
    const moved = applyMove(applyMove(start(), "left", T0, fixed(0, 0)).state, "down", T0, fixed(0, 0)).state;
    const once = undo(moved, T0);
    assert.equal(once.moves, 1);
    assert.equal(undo(once, T0), once);
  });

  it("can be used again after the next move", () => {
    let g = applyMove(start(), "left", T0, fixed(0, 0)).state;
    g = undo(g, T0);
    g = applyMove(g, "right", T0, fixed(0, 0)).state;
    g = undo(g, T0);
    assert.equal(g.undosUsed, 2);
    assert.equal(g.moves, 0);
  });

  it("takes the player back out of the won screen", () => {
    const g = gameOn(board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const won = applyMove(g, "left", T0, fixed(0, 0)).state;
    const back = undo(won, T0);
    assert.equal(back.status, "playing");
    assert.ok(!back.reached2048);
    assert.equal(back.highestTile, 1024);
  });

  it("is not offered once the game is over: a finished game is final", () => {
    const over = applyMove(gameOn(NEARLY_OVER), "left", T0 + 1000, fixed(0, 0)).state;
    assert.equal(over.status, "over");
    assert.ok(over.previous, "the step exists...");
    assert.equal(undo(over, T0 + 9000), over, "...but cannot be used");
  });

  it("restarts the clock if it had been stopped while playing", () => {
    const moved = applyMove(gameOn(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), "left", T0, fixed(0, 0)).state;
    const back = undo(stopClock(moved, T0 + 500), T0 + 9000);
    assert.equal(back.resumedAt, T0 + 9000);
  });

  it("resets and lifts the best score without letting undo bring the old one back", () => {
    const moved = applyMove(gameOn(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { best: 900 }), "left", T0, fixed(0, 0)).state;
    const reset = resetBest(moved);
    assert.equal(reset.best, 4, "falls back to the score of this game");
    assert.equal(undo(reset, T0).best, 0, "and so does the undo step");
    const lifted = liftBest(moved, 5000);
    assert.equal(lifted.best, 5000);
    assert.equal(undo(lifted, T0).best, 5000);
    assert.equal(liftBest(moved, 1), moved, "never lowers");
  });
});

describe("new game", () => {
  it("starts clean", () => {
    const g = newGame("client-0002", T0, fixed(0, 0, 0.5, 0.95), 120);
    assert.equal(g.score, 0);
    assert.equal(g.moves, 0);
    assert.equal(g.best, 120);
    assert.equal(g.status, "playing");
    assert.equal(g.previous, null);
    assert.ok(!g.reached2048);
    assert.ok(!hasProgress(g));
    assert.ok(hasProgress(applyMove(gameOn(board([2, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), "left", T0, fixed(0, 0)).state));
  });
});

describe("clock", () => {
  it("counts only the time the clock runs", () => {
    let g = newGame("client-0003", T0, fixed(0, 0));
    assert.equal(elapsedAt(g, T0 + 5000), 5000);
    g = stopClock(g, T0 + 5000);
    assert.equal(elapsedAt(g, T0 + 900_000), 5000);
    g = startClock(g, T0 + 900_000);
    assert.equal(elapsedAt(g, T0 + 902_000), 7000);
  });

  it("freezing for storage banks the time so a day away adds nothing", () => {
    const g = freezeForStorage(newGame("client-0003", T0, fixed(0, 0)), T0 + 3000);
    assert.equal(g.resumedAt, null);
    assert.equal(elapsedAt(g, T0 + 86_400_000), 3000);
  });

  it("does not restart the clock of a finished game", () => {
    const over = applyMove(gameOn(NEARLY_OVER), "left", T0 + 1000, fixed(0, 0)).state;
    assert.equal(startClock(over, T0 + 5000), over);
  });
});

describe("drawing the tiles", () => {
  it("gives every tile an id and matches the grid", () => {
    const grid = board([2, 0, 4, 0], [0, 0, 0, 0], [0, 8, 0, 0], [0, 0, 0, 16]);
    const { tiles, nextId } = tilesFromGrid(grid, 1);
    assert.equal(tiles.length, 4);
    assert.equal(nextId, 5);
    assert.deepEqual(gridOfTiles(tiles), grid);
    assert.equal(new Set(tiles.map((t) => t.id)).size, 4);
  });

  it("keeps a sliding tile's id, turns a merge into ghosts plus one new tile, and adds the spawn", () => {
    const grid = board([0, 2, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    const first = tilesFromGrid(grid, 1);
    const result = moveGrid(grid, "left");
    const spawn = { index: 5, value: 2 };
    const next = advanceTiles(first.tiles, result, spawn, first.nextId);

    const slid = next.tiles.find((t) => t.value === 4 && !t.merged)!;
    assert.equal(slid.id, first.tiles.find((t) => t.value === 4)!.id, "the 4 keeps its identity while it slides");
    assert.equal(slid.index, 1);

    const ghosts = next.tiles.filter((t) => t.ghost);
    assert.equal(ghosts.length, 2);
    assert.ok(ghosts.every((t) => t.index === 0 && t.value === 2));
    const merged = next.tiles.filter((t) => t.merged);
    assert.equal(merged.length, 1);
    assert.deepEqual([merged[0].index, merged[0].value], [0, 4]);
    assert.ok(next.tiles.find((t) => t.fresh && t.index === 5 && t.value === 2));

    // The visible tiles are exactly the rules' board after the spawn.
    const expected = [...result.grid];
    expected[5] = 2;
    assert.deepEqual(gridOfTiles(next.tiles), expected);
    assert.equal(new Set(next.tiles.map((t) => t.id)).size, next.tiles.length, "ids stay unique");
  });

  it("stays in step with the rules over a long run of moves", () => {
    let seed = 99;
    const rng: Rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    let game = newGame("client-0004", T0, rng);
    let { tiles, nextId } = tilesFromGrid(game.grid, 1);
    const dirs: Direction[] = ["left", "down", "right", "up"];
    for (let i = 0; i < 400 && game.status === "playing"; i++) {
      const out = applyMove(game, dirs[Math.floor(rng() * 4)], T0 + i, rng);
      if (out.result) {
        ({ tiles, nextId } = advanceTiles(tiles, out.result, out.spawn, nextId));
        assert.deepEqual(gridOfTiles(tiles), out.state.grid, `after move ${i}`);
      }
      game = out.state;
    }
    assert.ok(game.moves > 20);
  });
});

describe("saved game records", () => {
  const record = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    clientId: "client-0001",
    startedAt: T0,
    endedAt: T0 + 600_000,
    score: 2500,
    highestTile: 256,
    moves: 150,
    durationMs: 400_000,
    reached2048: false,
    gameOver: true,
    undosUsed: 2,
    ...over,
  });

  it("accepts a good record", () => {
    assert.ok(parseSessionData(record(), T0 + 700_000).ok);
  });

  it("rejects impossible figures", () => {
    for (const bad of [
      { clientId: "x" },
      { highestTile: 100 },
      { highestTile: 262144 },
      { score: -1 },
      { score: MAX_SCORE + 1 },
      { moves: 0 },
      { score: 100 }, // far too little for a 256 tile
      { moves: 10 }, // far too few moves for a 256 tile
      { durationMs: 700_000 },
      { reached2048: true }, // flag disagrees with the tile
      { highestTile: 2048, reached2048: false, score: 40000, moves: 600 },
      { gameOver: "yes" },
      { endedAt: T0 - 1 },
    ]) {
      assert.ok(!parseSessionData(record(bad)).ok, JSON.stringify(bad));
    }
    assert.ok(!parseSessionData(null).ok);
    assert.ok(!parseSessionData(record({ endedAt: T0 + 900_000_000 }), T0).ok, "from the future");
  });

  it("knows the least a tile can score", () => {
    assert.equal(minScoreFor(4), 0);
    assert.equal(minScoreFor(8), 8);
    assert.equal(minScoreFor(2048), 9 * 2048);
  });

  it("accepts a real win", () => {
    assert.ok(parseSessionData(record({ highestTile: 2048, reached2048: true, score: 21000, moves: 1000, durationMs: 500_000 })).ok);
  });
});

describe("statistics", () => {
  const game = (over: Partial<SessionData>): SessionData => ({ clientId: `client-${Math.random().toString(36).slice(2, 10)}`, startedAt: T0, endedAt: T0 + 1000, score: 1000, highestTile: 128, moves: 100, durationMs: 60_000, reached2048: false, gameOver: true, undosUsed: 0, ...over });

  it("totals games, wins, scores and tiles", () => {
    const stats = computeStats([game({ score: 500, highestTile: 64 }), game({ score: 20000, highestTile: 2048, reached2048: true }), game({ score: 3000, highestTile: 256, gameOver: false })]);
    assert.equal(stats.gamesPlayed, 3);
    assert.equal(stats.gamesWon, 1);
    assert.equal(stats.winRate, 33);
    assert.equal(stats.highScore, 20000);
    assert.equal(stats.bestTile, 2048);
    assert.equal(stats.averageScore, Math.round(23500 / 3));
    assert.equal(stats.totalMoves, 300);
    assert.deepEqual(stats.byTile.map((t) => t.tile), [2048, 256, 64]);
  });

  it("copes with no games and lists recent ones newest first", () => {
    const none = computeStats([]);
    assert.equal(none.gamesPlayed, 0);
    assert.equal(none.winRate, 0);
    assert.equal(none.bestTile, 0);
    const some = computeStats([game({ endedAt: 5 }), game({ endedAt: 9 }), game({ endedAt: 7 })]);
    assert.deepEqual(some.recent.map((s) => s.endedAt), [9, 7, 5]);
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

  const session = (n: number): SessionData => ({ clientId: `client-${String(n).padStart(4, "0")}`, startedAt: T0 + n, endedAt: T0 + n + 100_000, score: 2500, highestTile: 256, moves: 150, durationMs: 90_000, reached2048: false, gameOver: true, undosUsed: 0 });

  it("keeps ended games, and flags an account's as waiting for upload", () => {
    assert.ok(saveSession(guest, session(1)));
    assert.ok(saveSession(guest, session(1)), "saving twice is harmless");
    assert.equal(loadHistory(guest).length, 1);
    assert.ok(saveSession(account, session(2)));
    assert.equal(loadHistory(account)[0].synced, false);
    assert.equal(loadHistory(guest).length, 1, "stores do not mix");
  });

  it("restores an unfinished game exactly as it was, with the clock stopped", () => {
    let g = gameOn(board([2, 2, 0, 0], [0, 4, 0, 0], [0, 0, 8, 0], [0, 0, 0, 0]), { best: 40 });
    g = applyMove(g, "left", T0 + 1000, fixed(0, 0)).state;
    g = applyMove(g, "down", T0 + 2000, fixed(0.5, 0.95)).state;
    const frozen = freezeForStorage(g, T0 + 9000);
    assert.ok(saveGame(guest, frozen));

    const back = loadGame(guest)!;
    assert.ok(back);
    assert.deepEqual(back.grid, g.grid);
    assert.equal(back.score, g.score);
    assert.equal(back.best, g.best);
    assert.equal(back.moves, 2);
    assert.equal(back.highestTile, g.highestTile);
    assert.equal(back.status, "playing");
    assert.deepEqual(back.previous, g.previous, "undo still works after a reload");
    assert.equal(back.resumedAt, null);
    assert.equal(elapsedAt(back, T0 + 86_400_000), 9000 + (g.elapsedMs - 0), "closed time is not counted");
    assert.deepEqual(undo(back, T0 + 10_000).grid, g.previous!.grid);
  });

  it("restores a game waiting on the win screen, with the win state intact", () => {
    const won = applyMove(gameOn(board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), "left", T0, fixed(0, 0)).state;
    saveGame(guest, freezeForStorage(won, T0 + 10));
    const back = loadGame(guest)!;
    assert.equal(back.status, "won");
    assert.ok(back.reached2048);
    assert.equal(back.score, 2048);
  });

  it("clears the saved game, and keeps stores apart", () => {
    saveGame(guest, freezeForStorage(gameOn(board([2, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), T0));
    assert.ok(loadGame(guest));
    assert.equal(loadGame(account), null);
    clearGame(guest);
    assert.equal(loadGame(guest), null);
  });

  it("refuses corrupt or tampered saved games", () => {
    const good = freezeForStorage(gameOn(board([2, 0, 0, 2], [0, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), T0);
    const bad = (patch: (o: Record<string, unknown>) => void) => {
      const o = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(o);
      return parseGame(o);
    };
    assert.ok(parseGame(JSON.parse(JSON.stringify(good))));
    assert.equal(bad((o) => ((o.grid as number[])[0] = 3)), null, "3 is not a tile");
    assert.equal(bad((o) => ((o.grid as number[])[0] = 262144)), null, "too big for the board");
    assert.equal(bad((o) => (o.grid = [2, 4])), null);
    assert.equal(bad((o) => (o.score = -5)), null);
    assert.equal(bad((o) => (o.score = 100)), null, "best must not be below the score");
    assert.equal(bad((o) => (o.status = "over")), null);
    assert.equal(bad((o) => (o.status = "won")), null, "won without having reached 2048");
    assert.equal(bad((o) => (o.reached2048 = true)), null, "flag must match the highest tile");
    assert.equal(bad((o) => (o.clientId = "x")), null);
    assert.equal(bad((o) => (o.previous = { grid: [1] })), null);
    assert.equal(parseGame("nonsense"), null);
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:guest:v1:game2048:game", "{broken");
    assert.equal(loadGame(guest), null);
  });

  it("does not restore a board with no move left as a playing game", () => {
    const stuck = freezeForStorage(gameOn(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2])), T0);
    assert.equal(parseGame(JSON.parse(JSON.stringify(stuck))), null);
  });

  it("persists the best score, treats a stored 0 as real, and distinguishes 'never stored'", () => {
    assert.equal(loadBest(guest), null);
    saveBest(guest, 4200);
    assert.equal(loadBest(guest), 4200);
    assert.equal(loadBest(account), null, "per viewer");
    saveBest(guest, 0);
    assert.equal(loadBest(guest), 0, "after a reset the best is 0, not refilled from history");
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem("mathz:guest:v1:game2048:best", "junk");
    assert.equal(loadBest(guest), null);
  });

  it("copes with storage that refuses to save", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    assert.equal(saveGame(guest, gameOn(board([2, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))), false);
    assert.equal(saveSession(guest, session(1)), false);
  });
});

describe("session data from a game", () => {
  it("records a finished game with its figures", () => {
    const over = applyMove(gameOn(NEARLY_OVER), "left", T0 + 61_000, fixed(0, 0)).state;
    const data = toSessionData({ ...over, elapsedMs: 60_000 }, T0 + 999_999);
    assert.equal(data.gameOver, true);
    assert.equal(data.endedAt, T0 + 61_000);
    assert.equal(data.moves, 1);
    assert.equal(data.highestTile, 64);
    assert.equal(data.durationMs, 60_000);
  });

  it("records a given-up game as not over, with the time so far", () => {
    const g = applyMove(gameOn(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), "left", T0 + 1000, fixed(0, 0)).state;
    const data = toSessionData(g, T0 + 8000);
    assert.equal(data.gameOver, false);
    assert.equal(data.endedAt, T0 + 8000);
    assert.equal(data.durationMs, 8000);
  });
});
