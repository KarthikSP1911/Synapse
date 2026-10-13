import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyAttempt, type ItemStats } from "./item-stats";
import { DUE_PICK_PROBABILITY, selectNext, selectReview, type StatLite } from "./selection";
import {
  MAX_BOX,
  REVIEW_INTERVAL_DAYS,
  dueDateForBox,
  isDue,
  nextBox,
  nextBoxForAttempt,
} from "./spaced-repetition";
import type { PoolItem } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-03-01T12:00:00Z");

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Leitner boxes", () => {
  it("uses 1, 2, 4, 8 and 16 day intervals", () => {
    assert.deepEqual([...REVIEW_INTERVAL_DAYS], [1, 2, 4, 8, 16]);
    [1, 2, 3, 4, 5].forEach((box, i) => {
      assert.equal(dueDateForBox(box, NOW).getTime() - NOW.getTime(), REVIEW_INTERVAL_DAYS[i] * DAY);
    });
  });

  it("clamps out-of-range boxes when scheduling", () => {
    assert.equal(dueDateForBox(0, NOW).getTime() - NOW.getTime(), DAY);
    assert.equal(dueDateForBox(99, NOW).getTime() - NOW.getTime(), 16 * DAY);
  });

  it("keeps the original correct/incorrect transitions", () => {
    assert.equal(nextBox(1, true), 2);
    assert.equal(nextBox(4, true), 5);
    assert.equal(nextBox(5, true), MAX_BOX);
    assert.equal(nextBox(4, false), 1);
  });

  it("advances on unassisted recall and resets on every kind of miss", () => {
    assert.equal(nextBoxForAttempt(1, { outcome: "correct", hinted: false }), 2);
    assert.equal(nextBoxForAttempt(3, { outcome: "correct", hinted: false }), 4);
    for (const outcome of ["incorrect", "skipped", "timed_out"] as const) {
      assert.equal(nextBoxForAttempt(4, { outcome, hinted: false }), 1, outcome);
      assert.equal(nextBoxForAttempt(4, { outcome, hinted: true }), 1, outcome);
    }
  });

  it("does not advance a hinted answer", () => {
    assert.equal(nextBoxForAttempt(1, { outcome: "correct", hinted: true }), 1);
    assert.equal(nextBoxForAttempt(3, { outcome: "correct", hinted: true }), 3);
  });

  it("keeps testing box 5 every 16 days", () => {
    assert.equal(nextBoxForAttempt(5, { outcome: "correct", hinted: false }), 5);
    const stats = applyAttempt({ ...fresh(), box: 5 }, { outcome: "correct", hinted: false, responseTimeMs: 1000 }, "square", NOW);
    assert.equal(stats.box, 5);
    assert.equal(stats.dueAt!.getTime() - NOW.getTime(), 16 * DAY);
  });

  it("treats a missing review date as due", () => {
    assert.ok(isDue(null, NOW));
    assert.ok(isDue(new Date(NOW.getTime() - 1), NOW));
    assert.ok(isDue(NOW, NOW));
    assert.ok(!isDue(new Date(NOW.getTime() + 1), NOW));
  });
});

function fresh(): ItemStats {
  return applyAttempt(null, { outcome: "correct", hinted: false, responseTimeMs: 2000 }, "multiplication", NOW);
}

describe("item statistics", () => {
  const ok = (ms = 2000, hinted = false) => ({ outcome: "correct" as const, hinted, responseTimeMs: ms });
  const bad = (ms = 2000, outcome: "incorrect" | "skipped" | "timed_out" = "incorrect") => ({
    outcome,
    hinted: false,
    responseTimeMs: ms,
  });

  it("starts a new item in box 1 and applies the first result", () => {
    const right = applyAttempt(null, ok(1500), "multiplication", NOW);
    assert.equal(right.box, 2);
    assert.equal(right.weaknessScore, 20);
    assert.equal(right.accuracy, 100);
    assert.equal(right.fastestResponseTimeMs, 1500);
    assert.equal(right.dueAt!.getTime() - NOW.getTime(), 2 * DAY);

    const wrong = applyAttempt(null, bad(), "multiplication", NOW);
    assert.equal(wrong.box, 1);
    assert.equal(wrong.weaknessScore, 80);
    assert.equal(wrong.accuracy, 0);
    assert.equal(wrong.currentIncorrectStreak, 1);
    assert.equal(wrong.dueAt!.getTime() - NOW.getTime(), DAY);
  });

  it("keeps the original multiplication weakness formula", () => {
    let s = applyAttempt(null, ok(), "multiplication", NOW); // 1/1
    s = applyAttempt(s, bad(), "multiplication", NOW); // 1/2 = 50%, one miss
    assert.equal(s.accuracy, 50);
    assert.equal(s.weaknessScore, 50);
    s = applyAttempt(s, bad(), "multiplication", NOW); // 1/3 = 33%, two misses in a row: 67 + 10
    assert.equal(s.accuracy, 33);
    assert.equal(s.weaknessScore, 77);
    assert.equal(s.currentIncorrectStreak, 2);
    assert.equal(s.box, 1);
  });

  it("penalises slowness per skill and rewards a long correct streak", () => {
    const slowMultiplication = applyAttempt(null, ok(6000), "multiplication", NOW);
    const next = applyAttempt(slowMultiplication, ok(6000), "multiplication", NOW);
    assert.equal(next.weaknessScore, 0 + 10); // 100% accurate but slower than 5 s
    const fineForPercentages = applyAttempt(applyAttempt(null, ok(6000), "percentage", NOW), ok(6000), "percentage", NOW);
    assert.equal(fineForPercentages.weaknessScore, 0);

    let s = fresh();
    for (let i = 0; i < 4; i += 1) s = applyAttempt(s, ok(), "multiplication", NOW);
    assert.equal(s.currentCorrectStreak, 5);
    assert.equal(s.weaknessScore, 0); // 0 - 20 clamped
    assert.equal(s.bestCorrectStreak, 5);
  });

  it("counts skips and timeouts as misses", () => {
    for (const outcome of ["skipped", "timed_out"] as const) {
      const s = applyAttempt(fresh(), bad(3000, outcome), "fraction", NOW);
      assert.equal(s.box, 1, outcome);
      assert.equal(s.incorrectAttempts, 1);
      assert.equal(s.currentCorrectStreak, 0);
      assert.equal(s.currentIncorrectStreak, 1);
    }
  });

  it("does not let a hinted answer count as unassisted recall", () => {
    const base = { ...fresh(), box: 3, currentCorrectStreak: 2 };
    const s = applyAttempt(base, ok(1000, true), "percentage", NOW);
    assert.equal(s.box, 3);
    assert.equal(s.currentCorrectStreak, 2); // not extended
    assert.equal(s.correctAttempts, base.correctAttempts + 1); // still a right answer
    assert.equal(s.hintedAttempts, 1);
    assert.equal(s.dueAt!.getTime() - NOW.getTime(), 4 * DAY);

    const first = applyAttempt(null, ok(1000, true), "percentage", NOW);
    assert.equal(first.box, 1);
    assert.equal(first.currentCorrectStreak, 0);
    assert.ok(first.weaknessScore > 20);
  });

  it("tracks averages, fastest and slowest", () => {
    let s = applyAttempt(null, ok(1000), "square", NOW);
    s = applyAttempt(s, ok(3000), "square", NOW);
    assert.equal(s.averageResponseTimeMs, 2000);
    assert.equal(s.fastestResponseTimeMs, 1000);
    assert.equal(s.slowestResponseTimeMs, 3000);
    assert.equal(s.totalAttempts, 2);
  });

  it("does not mutate the previous stats", () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    applyAttempt(before, bad(), "square", NOW);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

const item = (id: string, exerciseType: PoolItem["exerciseType"] = "value", concept = id): PoolItem => ({
  id,
  exerciseType,
  concept,
});
const stat = (weaknessScore: number, dueAt: Date | null = new Date(NOW.getTime() + DAY), totalAttempts = 5): StatLite => ({
  weaknessScore,
  totalAttempts,
  dueAt,
});

describe("adaptive selection", () => {
  const pool = ["a", "b", "c", "d", "e", "f"].map((id) => item(id));

  it("draws roughly weakFocusPercent of questions from weak items", () => {
    const rng = mulberry32(7);
    const stats = new Map([["a", stat(90)]]);
    let weakDraws = 0;
    const n = 6000;
    for (let i = 0; i < n; i += 1) {
      if (selectNext({ pool, stats, recentIds: [], weakFocusPercent: 30, now: NOW, rng }).id === "a") weakDraws += 1;
    }
    // 30% weak draws plus the 1/6 chance of "a" in the uniform draw: 0.3 + 0.7 * (1/6) ~ 0.417.
    const share = weakDraws / n;
    assert.ok(share > 0.38 && share < 0.46, `weak share ${share}`);
  });

  it("never draws weak items when the weak share is 0 beyond chance", () => {
    const rng = mulberry32(3);
    const stats = new Map([["a", stat(90)]]);
    let hits = 0;
    for (let i = 0; i < 3000; i += 1) {
      if (selectNext({ pool, stats, recentIds: [], weakFocusPercent: 0, now: NOW, rng }).id === "a") hits += 1;
    }
    assert.ok(hits / 3000 < 0.22, String(hits / 3000)); // ~1/6 from the uniform draw only
  });

  it("weights weak items by their weakness", () => {
    const rng = mulberry32(11);
    const stats = new Map([
      ["a", stat(95)],
      ["b", stat(55)],
    ]);
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i += 1) {
      const id = selectNext({ pool: [item("a"), item("b")], stats, recentIds: [], weakFocusPercent: 50, now: NOW, rng }).id;
      counts[id] += 1;
    }
    // Expected share of "a": 0.5 * (95 / 150) + 0.5 * 0.5 ~ 0.57, so a:b ~ 1.3.
    assert.ok(counts.a > counts.b * 1.15, `${counts.a} vs ${counts.b}`);
  });

  it("avoids recent questions and the one on screen while alternatives exist", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i += 1) {
      const picked = selectNext({
        pool,
        stats: new Map(),
        recentIds: ["a", "b", "c"],
        excludeId: "d",
        weakFocusPercent: 30,
        now: NOW,
        rng,
      });
      assert.ok(["e", "f"].includes(picked.id), picked.id);
    }
  });

  it("falls back to the full pool rather than running dry", () => {
    const one = [item("only")];
    const picked = selectNext({ pool: one, stats: new Map(), recentIds: ["only"], excludeId: "only", weakFocusPercent: 50, now: NOW });
    assert.equal(picked.id, "only");
    assert.throws(() => selectNext({ pool: [], stats: new Map(), recentIds: [], weakFocusPercent: 30 }));
  });

  it("does not let weak items outside the pool skew a session", () => {
    const stats = new Map([["multiplication:7:7", stat(100)]]);
    const picked = selectNext({ pool: [item("a")], stats, recentIds: [], weakFocusPercent: 50, now: NOW });
    assert.equal(picked.id, "a");
  });

  it("prefers due reviews at the documented rate", () => {
    const rng = mulberry32(21);
    const stats = new Map([["a", stat(10, new Date(NOW.getTime() - DAY))]]);
    let hits = 0;
    const n = 6000;
    for (let i = 0; i < n; i += 1) {
      if (selectNext({ pool, stats, recentIds: [], weakFocusPercent: 0, now: NOW, rng }).id === "a") hits += 1;
    }
    const expected = DUE_PICK_PROBABILITY + (1 - DUE_PICK_PROBABILITY) / 6;
    assert.ok(Math.abs(hits / n - expected) < 0.04, `${hits / n} vs ${expected}`);
  });

  it("ignores due items that were never attempted and those scheduled in the future", () => {
    const rng = mulberry32(2);
    const stats = new Map([
      ["a", stat(10, new Date(NOW.getTime() + DAY))],
      ["b", stat(10, null, 0)],
    ]);
    let hits = 0;
    for (let i = 0; i < 3000; i += 1) {
      const id = selectNext({ pool, stats, recentIds: [], weakFocusPercent: 0, now: NOW, rng }).id;
      if (id === "a" || id === "b") hits += 1;
    }
    assert.ok(hits / 3000 < 0.4);
  });

  it("weak focus asks only weak questions while any exist", () => {
    const stats = new Map([
      ["a", stat(80)],
      ["b", stat(70)],
    ]);
    const rng = mulberry32(9);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(selectNext({ pool, stats, recentIds: [], focus: "weak", weakFocusPercent: 0, now: NOW, rng }).id);
    }
    assert.deepEqual([...seen].sort(), ["a", "b"]);
  });

  it("due focus asks only due questions, and degrades gracefully when none are due", () => {
    const stats = new Map([["c", stat(10, new Date(NOW.getTime() - DAY))]]);
    for (let i = 0; i < 50; i += 1) {
      assert.equal(selectNext({ pool, stats, recentIds: [], focus: "due", weakFocusPercent: 0, now: NOW }).id, "c");
    }
    const none = selectNext({ pool, stats: new Map(), recentIds: [], focus: "due", weakFocusPercent: 0, now: NOW });
    assert.ok(pool.some((p) => p.id === none.id));
    const noWeak = selectNext({ pool, stats: new Map(), recentIds: [], focus: "weak", weakFocusPercent: 0, now: NOW });
    assert.ok(pool.some((p) => p.id === noWeak.id));
  });

  it("prefers questions not yet asked in this session", () => {
    const seen = new Set(["a", "b", "c", "d", "e"]);
    const rng = mulberry32(4);
    for (let i = 0; i < 100; i += 1) {
      assert.equal(selectNext({ pool, stats: new Map(), recentIds: [], seenIds: seen, weakFocusPercent: 0, now: NOW, rng }).id, "f");
    }
    const all = new Set(pool.map((p) => p.id));
    assert.ok(selectNext({ pool, stats: new Map(), recentIds: [], seenIds: all, weakFocusPercent: 0, now: NOW }));
  });

  it("balances exercise types instead of following pool size", () => {
    const mixed = [
      ...Array.from({ length: 90 }, (_, i) => item(`v${i}`, "value")),
      ...Array.from({ length: 10 }, (_, i) => item(`r${i}`, "root")),
    ];
    const rng = mulberry32(13);
    let roots = 0;
    const n = 4000;
    for (let i = 0; i < n; i += 1) {
      if (selectNext({ pool: mixed, stats: new Map(), recentIds: [], weakFocusPercent: 0, now: NOW, rng }).exerciseType === "root") roots += 1;
    }
    assert.ok(Math.abs(roots / n - 0.5) < 0.05, String(roots / n));
  });

  it("favours unseen variations of a weak concept", () => {
    const rng = mulberry32(17);
    const variants = [item("p:1", "of", "pct:25"), item("p:2", "of", "pct:25"), item("q:1", "of", "pct:10"), item("q:2", "of", "pct:10")];
    const conceptWeakness = new Map([["pct:25", 90]]);
    let weakConcept = 0;
    const n = 3000;
    for (let i = 0; i < n; i += 1) {
      const picked = selectNext({ pool: variants, stats: new Map(), conceptWeakness, recentIds: [], weakFocusPercent: 50, now: NOW, rng });
      if (picked.concept === "pct:25") weakConcept += 1;
    }
    assert.ok(weakConcept / n > 0.6, String(weakConcept / n));
  });
});

describe("review selection", () => {
  it("asks every mistake once before repeating", () => {
    const ids = ["a", "b", "c"];
    const asked = new Set<string>();
    const rng = mulberry32(1);
    for (let i = 0; i < 3; i += 1) {
      const id = selectReview(ids, asked, undefined, rng);
      assert.ok(!asked.has(id));
      asked.add(id);
    }
    assert.equal(asked.size, 3);
    assert.ok(ids.includes(selectReview(ids, asked, "a", rng)));
  });

  it("does not repeat the question on screen when there is a choice", () => {
    for (let i = 0; i < 50; i += 1) assert.equal(selectReview(["a", "b"], new Set(), "a"), "b");
    assert.equal(selectReview(["a"], new Set(["a"]), "a"), "a");
  });
});
