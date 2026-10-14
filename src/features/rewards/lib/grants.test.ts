import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ECONOMY, type Economy } from "./economy";
import { game2048Grants, highestTileReward, practiceAnswerGrants, practiceBonusGrants, puzzleGrants, roundGameGrants } from "./grants";

const total = (grants: { amount: number }[]) => grants.reduce((sum, g) => sum + g.amount, 0);
const attempt = (outcome: string, at: number) => ({ outcome, at });

describe("practice rewards", () => {
  it("pays two coins for each correct answer and nothing else", () => {
    const attempts = [attempt("correct", 1), attempt("incorrect", 2), attempt("skipped", 3), attempt("timed_out", 4), attempt("correct", 5)];
    const grants = practiceAnswerGrants("sess-1", attempts);
    assert.deepEqual(grants.map((g) => g.key), ["practice:sess-1:1", "practice:sess-1:5"]);
    assert.equal(total(grants), 4);
  });

  it("gives the same keys for the same attempts, so a repeat cannot pay twice", () => {
    const attempts = [attempt("correct", 10)];
    assert.deepEqual(practiceAnswerGrants("s", attempts), practiceAnswerGrants("s", attempts));
  });

  it("pays the bonus once the session ended with enough answers, enough of them right", () => {
    const attempts = [...Array(4).fill(0).map((_, i) => attempt("correct", i)), attempt("incorrect", 9)];
    const bonus = practiceBonusGrants("s", attempts, 100);
    assert.equal(bonus.length, 1);
    assert.equal(bonus[0].amount, 5);
    assert.equal(bonus[0].key, "practice:s:bonus");
  });

  it("pays no bonus for a session that has not ended", () => {
    const attempts = Array(10).fill(0).map((_, i) => attempt("correct", i));
    assert.deepEqual(practiceBonusGrants("s", attempts, null), []);
  });

  it("pays no bonus below the minimum number of answers, and skips do not count towards it", () => {
    assert.deepEqual(practiceBonusGrants("s", [attempt("correct", 1), attempt("correct", 2), attempt("correct", 3), attempt("correct", 4)], 9), []);
    const withSkips = [attempt("correct", 1), attempt("correct", 2), attempt("correct", 3), attempt("correct", 4), attempt("skipped", 5), attempt("skipped", 6)];
    assert.deepEqual(practiceBonusGrants("s", withSkips, 9), []);
  });

  it("pays no bonus below the minimum accuracy", () => {
    const attempts = [attempt("correct", 1), ...Array(5).fill(0).map((_, i) => attempt("incorrect", 10 + i))];
    assert.deepEqual(practiceBonusGrants("s", attempts, 99), []);
  });

  it("follows the economy settings", () => {
    const economy: Economy = { ...ECONOMY, practice: { ...ECONOMY.practice, correctAnswer: 3, sessionBonus: 8, minAnsweredForBonus: 1 } };
    assert.equal(total(practiceAnswerGrants("s", [attempt("correct", 1)], economy)), 3);
    assert.equal(total(practiceBonusGrants("s", [attempt("correct", 1)], 5, economy)), 8);
  });
});

describe("MindSprint and Number Recall rewards", () => {
  const session = (rounds: boolean[]) => ({ clientId: "abc12345", endedAt: 500, rounds });

  for (const game of ["mindsprint", "recall"] as const) {
    it(`${game}: two coins per correct round plus the bonus for a finished session`, () => {
      const grants = roundGameGrants(game, session([true, false, true, true]));
      assert.equal(grants.filter((g) => !g.key.endsWith("bonus")).length, 3);
      assert.equal(total(grants), 3 * 2 + 5);
      assert.ok(grants.some((g) => g.key === `${game}:abc12345:bonus`));
    });

    it(`${game}: each round and the bonus are keyed separately`, () => {
      const keys = roundGameGrants(game, session([true, true, true])).map((g) => g.key);
      assert.equal(new Set(keys).size, keys.length);
      assert.deepEqual(keys, [`${game}:abc12345:r1`, `${game}:abc12345:r2`, `${game}:abc12345:r3`, `${game}:abc12345:bonus`]);
    });

    it(`${game}: wrong rounds earn nothing and a session too short or too poor earns no bonus`, () => {
      assert.deepEqual(roundGameGrants(game, session([false, false, false, false])), []);
      assert.equal(total(roundGameGrants(game, session([true, true]))), 4, "two rounds: below the minimum for a bonus");
      assert.equal(total(roundGameGrants(game, session([true, false, false, false, false]))), 2, "one in five: below the accuracy bar");
    });
  }
});

describe("puzzle rewards", () => {
  const solved = (difficulty: "easy" | "medium" | "hard" | "expert", completed = true) => ({ clientId: "game1234", completed, difficulty, endedAt: 700 });

  it("pays 10, 15, 20 and 30 coins by difficulty", () => {
    assert.deepEqual((["easy", "medium", "hard", "expert"] as const).map((d) => total(puzzleGrants("queens", solved(d)))), [10, 15, 20, 30]);
  });

  it("pays nothing for a puzzle that was not solved", () => {
    for (const game of ["sudoku", "queens", "zip", "patches"] as const) assert.deepEqual(puzzleGrants(game, solved("expert", false)), []);
  });

  it("keys a reward by game and id, so restarting or re-saving cannot pay twice", () => {
    assert.deepEqual(puzzleGrants("zip", solved("hard")).map((g) => g.key), ["zip:game1234"]);
    assert.notEqual(puzzleGrants("zip", solved("hard"))[0].key, puzzleGrants("queens", solved("hard"))[0].key);
  });
});

describe("2048 rewards", () => {
  it("rises with the highest tile and is zero below the first threshold", () => {
    assert.deepEqual([64, 128, 200, 256, 512, 1024, 2048, 4096, 8192, 16384, 131072].map((t) => highestTileReward(t)), [0, 3, 3, 5, 8, 12, 20, 30, 40, 50, 50]);
  });

  it("pays once for a run that counts, and nothing for one that does not", () => {
    const run = { clientId: "run12345", highestTile: 512, endedAt: 900 };
    const grants = game2048Grants(run, true);
    assert.equal(grants.length, 1);
    assert.equal(grants[0].amount, 8);
    assert.deepEqual(game2048Grants(run, false), []);
    assert.deepEqual(game2048Grants({ ...run, highestTile: 64 }, true), [], "a small tile earns nothing");
  });
});
