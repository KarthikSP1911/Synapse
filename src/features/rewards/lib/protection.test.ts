import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planProtection } from "./protection";
import { summarizeStreaks } from "@/features/progress/lib/streak";
import { streaks } from "@/features/progress/lib/activity";
import type { OwnedShield } from "./types";

const set = (...days: string[]) => new Set(days);
const shield = (key: string, boughtOn: string): OwnedShield => ({ key, boughtOn });
const plan = (input: { active: string[]; protectedDays?: string[]; shields: OwnedShield[]; today: string; lookbackDays?: number }) =>
  planProtection({ activeDays: set(...input.active), protectedDays: set(...(input.protectedDays ?? [])), shields: input.shields, today: input.today, lookbackDays: input.lookbackDays ?? 90 });

describe("planProtection", () => {
  it("protects one missed day with one shield", () => {
    const p = plan({ active: ["2026-10-10", "2026-10-11"], shields: [shield("a", "2026-10-01")], today: "2026-10-13" });
    assert.deepEqual(p.assignments, [{ date: "2026-10-12", shieldKey: "a" }]);
  });

  it("does nothing when yesterday was active, and never touches today", () => {
    assert.deepEqual(plan({ active: ["2026-10-12"], shields: [shield("a", "2026-10-01")], today: "2026-10-13" }).assignments, []);
    assert.deepEqual(plan({ active: ["2026-10-11"], shields: [shield("a", "2026-10-01")], today: "2026-10-12" }).assignments, [], "today is not over, so it is not missed");
  });

  it("uses one shield per missed day for consecutive missed days", () => {
    const p = plan({ active: ["2026-10-09"], shields: [shield("a", "2026-10-01"), shield("b", "2026-10-02"), shield("c", "2026-10-03")], today: "2026-10-13" });
    assert.deepEqual(p.assignments.map((x) => x.date), ["2026-10-10", "2026-10-11", "2026-10-12"]);
    assert.equal(new Set(p.assignments.map((x) => x.shieldKey)).size, 3, "no shield is used twice");
  });

  it("protects nothing, and spends nothing, when the shields cannot cover the whole gap", () => {
    const p = plan({ active: ["2026-10-09"], shields: [shield("a", "2026-10-01")], today: "2026-10-13" });
    assert.deepEqual(p.assignments, []);
    assert.deepEqual(p.uncovered, [["2026-10-10", "2026-10-11", "2026-10-12"]]);
  });

  it("lets the streak break normally with no shields", () => {
    const p = plan({ active: ["2026-10-09"], shields: [], today: "2026-10-12" });
    assert.deepEqual(p.assignments, []);
    assert.equal(summarizeStreaks(["2026-10-09"], "2026-10-12", []).current, 0);
  });

  it("does not let a shield bought after the missed day rescue it", () => {
    const p = plan({ active: ["2026-10-09"], shields: [shield("late", "2026-10-11")], today: "2026-10-12" });
    assert.deepEqual(p.assignments, [], "bought on the 11th, cannot cover the 10th");
  });

  it("lets a shield bought on the missed day itself cover it, since the day was still ahead of the buyer", () => {
    const p = plan({ active: ["2026-10-09"], shields: [shield("same", "2026-10-10")], today: "2026-10-11" });
    assert.deepEqual(p.assignments, [{ date: "2026-10-10", shieldKey: "same" }]);
  });

  it("matches days to the shields that were already owned, even when bought on different days", () => {
    const p = plan({ active: ["2026-10-09"], shields: [shield("old", "2026-10-01"), shield("new", "2026-10-11")], today: "2026-10-12" });
    assert.deepEqual(p.assignments, [
      { date: "2026-10-10", shieldKey: "old" },
      { date: "2026-10-11", shieldKey: "new" },
    ]);
  });

  it("is a no-op once a day is protected, so a reload or a repeated sync cannot consume a second shield", () => {
    const shields = [shield("a", "2026-10-01"), shield("b", "2026-10-01")];
    const first = plan({ active: ["2026-10-10"], shields, today: "2026-10-12" });
    assert.equal(first.assignments.length, 1);
    const afterwards = plan({ active: ["2026-10-10"], protectedDays: first.assignments.map((x) => x.date), shields: shields.filter((s) => s.key !== first.assignments[0].shieldKey), today: "2026-10-12" });
    assert.deepEqual(afterwards.assignments, []);
  });

  it("ignores days before a user's first activity", () => {
    assert.deepEqual(plan({ active: ["2026-10-12"], shields: [shield("a", "2026-09-01")], today: "2026-10-13" }).assignments, []);
    assert.deepEqual(plan({ active: [], shields: [shield("a", "2026-09-01")], today: "2026-10-13" }).assignments, []);
  });

  it("continues a chain through an already protected day", () => {
    const p = plan({ active: ["2026-10-08"], protectedDays: ["2026-10-09"], shields: [shield("a", "2026-10-01")], today: "2026-10-11" });
    assert.deepEqual(p.assignments, [{ date: "2026-10-10", shieldKey: "a" }]);
  });

  it("closes a gap between two active days that was never protected, if a shield was owned then", () => {
    const p = plan({ active: ["2026-10-08", "2026-10-10"], shields: [shield("a", "2026-10-01")], today: "2026-10-11" });
    assert.deepEqual(p.assignments, [{ date: "2026-10-09", shieldKey: "a" }]);
  });

  it("handles month and year boundaries and leap days", () => {
    const p = plan({ active: ["2028-02-28"], shields: [shield("a", "2028-02-01")], today: "2028-03-01" });
    assert.deepEqual(p.assignments, [{ date: "2028-02-29", shieldKey: "a" }]);
    const q = plan({ active: ["2026-12-31"], shields: [shield("a", "2026-12-01")], today: "2027-01-02" });
    assert.deepEqual(q.assignments, [{ date: "2027-01-01", shieldKey: "a" }]);
  });

  it("only looks back the configured number of days", () => {
    const p = plan({ active: ["2026-06-01"], shields: [shield("a", "2026-05-01")], today: "2026-10-13", lookbackDays: 5 });
    assert.deepEqual(p.assignments, []);
  });
});

describe("streaks with protected days", () => {
  it("counts a protected day as bridging the streak but not as activity", () => {
    // Mon, Tue (shield), Wed: an unbroken run of two active days.
    const s = summarizeStreaks(["2026-10-05", "2026-10-07"], "2026-10-07", ["2026-10-06"]);
    assert.equal(s.current, 2);
    assert.equal(s.longest, 2);
    assert.equal(s.activeLastYear, 2, "the protected day is not an active day");
    assert.equal(s.todayDone, true);
  });

  it("keeps a streak alive through a protected yesterday while today has nothing yet", () => {
    const s = summarizeStreaks(["2026-10-05", "2026-10-06"], "2026-10-08", ["2026-10-07"]);
    assert.equal(s.current, 2);
    assert.equal(s.todayDone, false);
  });

  it("breaks at a gap the shields did not cover", () => {
    const s = summarizeStreaks(["2026-10-01", "2026-10-02", "2026-10-05"], "2026-10-05", ["2026-10-03"]);
    assert.equal(s.current, 1);
    assert.equal(s.longest, 2);
  });

  it("is unchanged when there are no protected days", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"];
    const withNone = summarizeStreaks(days, "2026-10-05");
    assert.deepEqual(withNone, summarizeStreaks(days, "2026-10-05", []));
    assert.equal(withNone.current, 1);
    assert.equal(withNone.longest, 3);
  });

  it("does not let protected days alone make a streak", () => {
    const s = summarizeStreaks([], "2026-10-08", ["2026-10-07", "2026-10-06"]);
    assert.equal(s.current, 0);
    assert.equal(s.longest, 0);
  });

  it("ignores protected days that are today or later, or not real dates", () => {
    const s = summarizeStreaks(["2026-10-07"], "2026-10-08", ["2026-10-08", "2026-10-09", "2026-02-30", "nonsense"]);
    assert.equal(s.current, 1);
  });

  it("streaks() keeps the original arithmetic with no bridged days", () => {
    const counts = new Map([["2026-10-01", 3], ["2026-10-02", 1], ["2026-10-04", 2]]);
    assert.deepEqual(streaks(counts, "2026-10-04"), { current: 1, longest: 2, activeDays: 3 });
  });
});
