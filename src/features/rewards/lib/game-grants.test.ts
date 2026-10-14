import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sessionGrants as game2048 } from "@/features/games/game2048/lib/rewards";
import { sessionGrants as mindsprint } from "@/features/games/mindsprint/lib/rewards";
import { sessionGrants as patches } from "@/features/games/patches/lib/rewards";
import { sessionGrants as queens } from "@/features/games/queens/lib/rewards";
import { sessionGrants as recall } from "@/features/games/recall/lib/rewards";
import { sessionGrants as sudoku } from "@/features/games/sudoku/lib/rewards";
import { sessionGrants as zip } from "@/features/games/zip/lib/rewards";

const base = { clientId: "game-0001", startedAt: 1, endedAt: 2 };

describe("each game's saved session pays through its own rule", () => {
  it("Sudoku, Queens, Zip and Patches pay by difficulty, only when solved", () => {
    const solved = { ...base, difficulty: "hard" as const, puzzle: "x", completed: true, elapsedMs: 1, hintsUsed: 0, mistakes: 0 };
    for (const pay of [sudoku, queens, zip, patches]) {
      assert.equal(pay(solved)[0].amount, 20);
      assert.deepEqual(pay({ ...solved, completed: false }), []);
    }
  });

  it("2048 pays once by the highest tile, and only for a run that counts", () => {
    const run = { ...base, score: 1, highestTile: 1024, moves: 300, durationMs: 1, reached2048: false, gameOver: true, undosUsed: 0 };
    assert.equal(game2048(run)[0].amount, 12);
    assert.deepEqual(game2048({ ...run, gameOver: false, moves: 5 }), [], "opened, tried a few moves, left");
    assert.deepEqual(game2048({ ...run, highestTile: 64 }), []);
  });

  it("MindSprint and Number Recall pay nothing for a session with no rounds", () => {
    assert.deepEqual(mindsprint({ ...base, rounds: [] }), []);
    assert.deepEqual(
      recall({ ...base, config: { mode: "single", rounds: 1, length: 3, displayMs: 800, gapMs: 300, countdown: 3, difficulty: "easy", progressive: false, partialCredit: false }, rounds: [] }),
      []
    );
  });
});
