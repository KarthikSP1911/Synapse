import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDays, buildHeatmap, dayKey, isValidTimeZone, levelFor, streaks, weekday } from "./activity";

const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("calendar days", () => {
  it("adds days across month, year and leap-day boundaries", () => {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  it("is not thrown off by daylight-saving changes", () => {
    assert.equal(addDays("2026-03-08", 1), "2026-03-09"); // US spring forward
    assert.equal(addDays("2026-11-01", 1), "2026-11-02"); // US fall back
  });

  it("finds the weekday", () => {
    assert.equal(weekday("2026-10-11"), 0); // Sunday
    assert.equal(weekday("2026-10-10"), 6); // Saturday
  });

  it("assigns an instant to the day in the user's own zone", () => {
    const instant = new Date("2026-10-10T22:30:00Z");
    assert.equal(dayKey(instant, "UTC"), "2026-10-10");
    assert.equal(dayKey(instant, "Asia/Kolkata"), "2026-10-11"); // 04:00 the next morning
    assert.equal(dayKey(instant, "America/Los_Angeles"), "2026-10-10");
  });

  it("accepts real zones and rejects anything else", () => {
    assert.ok(isValidTimeZone("Asia/Kolkata"));
    assert.ok(isValidTimeZone("UTC"));
    assert.ok(!isValidTimeZone("Not/AZone"));
    assert.ok(!isValidTimeZone(""));
    assert.ok(!isValidTimeZone(undefined));
    assert.ok(!isValidTimeZone("'; DROP TABLE users; --"));
  });
});

describe("streaks", () => {
  const today = "2026-10-10";

  it("is all zeros with no activity", () => {
    assert.deepEqual(streaks(counts({}), today), { current: 0, longest: 0, activeDays: 0 });
  });

  it("counts consecutive days ending today", () => {
    const s = streaks(counts({ "2026-10-08": 5, "2026-10-09": 1, "2026-10-10": 20 }), today);
    assert.deepEqual(s, { current: 3, longest: 3, activeDays: 3 });
  });

  it("keeps the streak alive when only today is still empty", () => {
    assert.equal(streaks(counts({ "2026-10-08": 5, "2026-10-09": 1 }), today).current, 2);
  });

  it("breaks the streak after a missed day", () => {
    const s = streaks(counts({ "2026-10-07": 5, "2026-10-08": 5 }), today);
    assert.equal(s.current, 0);
    assert.equal(s.longest, 2);
  });

  it("reports the longest run separately from the current one", () => {
    const s = streaks(counts({ "2026-09-01": 1, "2026-09-02": 1, "2026-09-03": 1, "2026-09-04": 1, "2026-10-10": 1 }), today);
    assert.deepEqual(s, { current: 1, longest: 4, activeDays: 5 });
  });

  it("ignores zero-count days", () => {
    assert.equal(streaks(counts({ "2026-10-10": 0, "2026-10-09": 3 }), today).activeDays, 1);
  });
});

describe("heatmap", () => {
  const today = "2026-10-10"; // a Saturday

  it("covers whole Sunday-to-Saturday weeks ending with the current one", () => {
    const h = buildHeatmap(counts({}), today, 53);
    assert.equal(h.weeks.length, 53);
    assert.ok(h.weeks.every((w) => w.length === 7));
    assert.equal(weekday(h.weeks[0][0].day), 0);
    assert.equal(h.weeks[52][6].day, today); // today is a Saturday, so the last cell is today
  });

  it("marks the rest of the current week as future and gives it no activity", () => {
    const h = buildHeatmap(counts({ "2026-10-14": 99 }), "2026-10-12", 4); // Monday
    const last = h.weeks[3];
    assert.deepEqual(last.map((d) => d.future), [false, false, true, true, true, true, true]); // Sun, Mon, then Tue-Sat
    assert.equal(h.max, 0);
    assert.ok(last.every((d) => d.level === 0));
  });

  it("scales levels to the busiest day and keeps any activity visible", () => {
    const h = buildHeatmap(counts({ "2026-10-10": 100, "2026-10-09": 50, "2026-10-08": 1 }), today, 4);
    const byDay = new Map(h.weeks.flat().map((d) => [d.day, d]));
    assert.equal(h.max, 100);
    assert.equal(byDay.get("2026-10-10")?.level, 4);
    assert.equal(byDay.get("2026-10-09")?.level, 2);
    assert.equal(byDay.get("2026-10-08")?.level, 1); // a single question still shows up
    assert.equal(byDay.get("2026-10-07")?.level, 0);
  });

  it("labels each month once, at the first week that starts in it", () => {
    const h = buildHeatmap(counts({}), today, 53);
    const labels = h.months.map((m) => m.label);
    assert.equal(new Set(labels.slice(0, 12)).size, 12);
    assert.equal(h.months[0].week, 0);
    assert.ok(h.months.every((m, i) => i === 0 || m.week > h.months[i - 1].week));
  });

  it("maps counts to levels", () => {
    assert.equal(levelFor(0, 10), 0);
    assert.equal(levelFor(1, 10), 1);
    assert.equal(levelFor(10, 10), 4);
    assert.equal(levelFor(5, 0), 0);
  });
});
