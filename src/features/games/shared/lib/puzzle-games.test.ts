import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadActivityDays } from "@/features/offline/lib/activity-days";
import { localActivityDays } from "@/features/progress/lib/local-activity";
import { browserTimeZone, dayOf } from "@/features/progress/lib/streak";
import { newGame as newQueens, setCell, toSessionData as queensData } from "@/features/games/queens/lib/game";
import { saveGame as saveQueensGame, saveSession as saveQueensSession } from "@/features/games/queens/lib/storage";
import { QUEEN, type Puzzle as QueensPuzzle } from "@/features/games/queens/lib/types";
import { beginStroke, dragTo, endStroke, newGame as newZip, toSessionData as zipData } from "@/features/games/zip/lib/game";
import { saveGame as saveZipGame, saveSession as saveZipSession } from "@/features/games/zip/lib/storage";
import type { Puzzle as ZipPuzzle } from "@/features/games/zip/lib/types";
import { elapsedAt, freezeClock, pauseClock, resumeClock, stopClock, type Clocked } from "./clock";
import { shuffle } from "./shuffle";
import { DIFFICULTIES, formatTime, isDifficulty, maxPuzzleScore, newClientId, scorePuzzle } from "./puzzle-session";
import { computePuzzleStats, type PuzzleRecord } from "./puzzle-stats";
import { seededRng } from "@/lib/random";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const T0 = Date.parse("2026-10-13T12:00:00Z");
const guest = { key: "mathz:guest:v1", syncable: false };
const account = { key: "mathz:user:v1:7", syncable: true };
const localDay = (ms: number) => dayOf(ms, browserTimeZone())!;

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

const QUEENS: QueensPuzzle = { difficulty: "easy", regions: "100004110004512300522330523330223333", solution: "514203" };
const ZIP: ZipPuzzle = { difficulty: "easy", puzzle: "5x5;c:8,12,7,1,19,23,17,16,11,20;w:", solution: [8, 13, 12, 7, 6, 5, 0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 18, 17, 22, 21, 16, 11, 10, 15, 20] };

function solvedQueens(at: number) {
  let g = newQueens(QUEENS, "queens-0001", at - 5000);
  for (let r = 0; r < g.size; r++) g = setCell(g, r * g.size + Number(g.solution[r]), QUEEN, at - 4000 + r * 400);
  assert.equal(g.status, "completed");
  return g;
}

function solvedZip(at: number) {
  let g = beginStroke(newZip(ZIP, "zip-000001", at - 8000), ZIP.solution[0], at - 7000).state;
  for (const cell of ZIP.solution.slice(1)) g = dragTo(g, cell, at - 3000).state;
  g = endStroke(g);
  assert.equal(g.status, "completed");
  return g;
}

describe("the shared clock", () => {
  const base: Clocked & { endedAt: number | null } = { status: "playing", elapsedMs: 1000, resumedAt: T0, endedAt: null };

  it("counts only playing time", () => {
    assert.equal(elapsedAt(base, T0 + 500), 1500);
    const paused = pauseClock(base, T0 + 500);
    assert.equal(paused.status, "paused");
    assert.equal(elapsedAt(paused, T0 + 99_999), 1500);
    const again = resumeClock(paused, T0 + 2000);
    assert.equal(elapsedAt(again, T0 + 2300), 1800);
  });

  it("ignores pausing or resuming at the wrong time, and never runs backwards", () => {
    const paused = pauseClock(base, T0);
    assert.equal(pauseClock(paused, T0 + 1), paused);
    assert.equal(resumeClock(base, T0 + 1), base);
    assert.equal(elapsedAt({ elapsedMs: 500, resumedAt: T0 }, T0 - 5000), 500);
  });

  it("banks the time when frozen for storage, and stops for good when finished", () => {
    assert.equal(freezeClock(base, T0 + 700).elapsedMs, 1700);
    const stopped = paused();
    assert.equal(freezeClock(stopped, T0), stopped, "a paused game is already banked");
    const done = stopClock(base, T0 + 250);
    assert.equal(done.status, "completed");
    assert.equal(done.endedAt, T0 + 250);
    assert.equal(elapsedAt(done, T0 + 99_999), 1250);
  });

  function paused() {
    return { ...base, status: "paused" as const, resumedAt: null };
  }
});

describe("the shared helpers", () => {
  it("formats times and recognises difficulties", () => {
    assert.equal(formatTime(0), "0:00");
    assert.equal(formatTime(65_999), "1:05");
    assert.equal(formatTime(3_725_000), "1:02:05");
    assert.equal(formatTime(-5), "0:00");
    for (const d of DIFFICULTIES) assert.ok(isDifficulty(d));
    assert.equal(isDifficulty("nope"), false);
    assert.equal(isDifficulty(null), false);
  });

  it("makes ids a record will accept", () => {
    const id = newClientId();
    assert.match(id, /^[A-Za-z0-9-]{8,64}$/);
    assert.notEqual(id, newClientId());
  });

  it("scores: base plus a shrinking time bonus, minus capped hints, nothing unsolved", () => {
    const solved = { base: 1000, parMs: 60_000, completed: true, elapsedMs: 0, hintsUsed: 0 };
    assert.deepEqual(scorePuzzle(solved), { base: 1000, timeBonus: 500, hintPenalty: 0, total: 1500 });
    assert.equal(scorePuzzle({ ...solved, elapsedMs: 60_000 }).timeBonus, 250);
    assert.equal(scorePuzzle({ ...solved, elapsedMs: 120_000 }).timeBonus, 0);
    assert.equal(scorePuzzle({ ...solved, hintsUsed: 4 }).hintPenalty, 120);
    assert.equal(scorePuzzle({ ...solved, hintsUsed: 400 }).hintPenalty, 250);
    assert.equal(scorePuzzle({ ...solved, completed: false }).total, 0);
    assert.equal(maxPuzzleScore(1000), 1500);
    assert.ok(scorePuzzle({ ...solved, hintsUsed: 400, elapsedMs: 999_999 }).total >= 750, "hints never take back more than a quarter of the base");
  });

  it("shuffles without losing or inventing items, and repeatably", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(items, seededRng(3));
    assert.deepEqual([...a].sort((x, y) => x - y), items);
    assert.deepEqual(a, shuffle(items, seededRng(3)));
    assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8], "the input is not changed");
  });
});

describe("the shared stats", () => {
  const game = (patch: Partial<PuzzleRecord> = {}): PuzzleRecord => ({ clientId: `c-${Math.random()}`, endedAt: 1, difficulty: "easy", completed: true, elapsedMs: 60_000, hintsUsed: 0, ...patch });

  it("starts empty", () => {
    const stats = computePuzzleStats([], () => 0);
    assert.equal(stats.attempted, 0);
    assert.equal(stats.completionRate, 0);
    assert.equal(stats.byDifficulty.expert.bestTimeMs, null);
    assert.deepEqual(stats.recent, []);
  });

  it("counts an unfinished game as an attempt, and keeps best figures per difficulty", () => {
    const stats = computePuzzleStats([game({ elapsedMs: 40_000 }), game({ elapsedMs: 80_000, hintsUsed: 3 }), game({ difficulty: "hard", completed: false })], (s) => s.elapsedMs, "hard");
    assert.equal(stats.byDifficulty.easy.bestTimeMs, 40_000);
    assert.equal(stats.byDifficulty.easy.averageTimeMs, 60_000);
    assert.equal(stats.byDifficulty.easy.bestScore, 80_000);
    assert.equal(stats.byDifficulty.hard.attempted, 2);
    assert.equal(stats.byDifficulty.hard.completed, 0);
    assert.equal(stats.attempted, 4);
    assert.equal(stats.hintsUsed, 3);
  });

  it("keeps only the latest games", () => {
    const stats = computePuzzleStats(Array.from({ length: 25 }, (_, i) => game({ endedAt: i })), () => 0, null, 10);
    assert.equal(stats.recent.length, 10);
    assert.equal(stats.recent[0].endedAt, 24);
  });
});

describe("activity streaks", () => {
  it("a solved Queens or Zip puzzle is a day of activity, however often it is saved", () => {
    saveQueensSession(guest, queensData(solvedQueens(T0), T0));
    saveQueensSession(guest, queensData(solvedQueens(T0), T0));
    assert.deepEqual(loadActivityDays(guest.key), [localDay(T0)]);

    saveZipSession(account, zipData(solvedZip(T0 + 86_400_000), T0 + 86_400_000));
    assert.deepEqual([...localActivityDays(account, "UTC")], ["2026-10-14"]);
  });

  it("opening a game, playing part of it, or giving it up is not", () => {
    let g = newQueens(QUEENS, "queens-0002", T0);
    // Opening and starting: the unfinished game is stored but is not history.
    saveQueensGame(guest, g);
    g = setCell(g, 0, QUEEN, T0 + 1000);
    saveQueensGame(guest, g);
    assert.deepEqual(loadActivityDays(guest.key), []);
    saveQueensSession(guest, queensData(g, T0 + 5000));
    assert.deepEqual(loadActivityDays(guest.key), [], "an abandoned game does not count");

    const z = beginStroke(newZip(ZIP, "zip-000002", T0), ZIP.solution[0], T0 + 10).state;
    saveZipGame(guest, z);
    saveZipSession(guest, zipData(z, T0 + 5000));
    assert.deepEqual(loadActivityDays(guest.key), []);
    assert.deepEqual([...localActivityDays(account, "UTC")], []);
  });

  it("an abandoned account game does not reach the days derived from the device either", () => {
    const g = setCell(newQueens(QUEENS, "queens-0003", T0), 0, QUEEN, T0 + 1000);
    saveQueensSession(account, queensData(g, T0 + 5000));
    assert.deepEqual([...localActivityDays(account, "UTC")], []);
  });
});
