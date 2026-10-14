import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_2048_MOVES,
  activityDayKeys,
  browserTimeZone,
  countsAsAnswer,
  dayOf,
  game2048Counts,
  isDayKey,
  patchesCounts,
  queensCounts,
  sudokuCounts,
  summarizeStreaks,
  zipCounts,
} from "./streak";

const at = (iso: string) => Date.parse(iso);
const days = (...keys: string[]) => keys;

describe("isDayKey", () => {
  it("accepts real days and rejects everything else", () => {
    assert.equal(isDayKey("2026-10-13"), true);
    assert.equal(isDayKey("2028-02-29"), true);
    assert.equal(isDayKey("2026-02-29"), false, "2026 is not a leap year");
    assert.equal(isDayKey("2026-02-30"), false);
    assert.equal(isDayKey("2026-13-01"), false);
    assert.equal(isDayKey("2026-1-1"), false);
    assert.equal(isDayKey("garbage"), false);
    assert.equal(isDayKey(20261013), false);
    assert.equal(isDayKey(null), false);
  });
});

describe("dayOf and activityDayKeys", () => {
  it("puts an instant on the day it was lived in the given zone, across midnight", () => {
    // Kolkata is UTC+5:30: 18:30 UTC is midnight there.
    assert.equal(dayOf(at("2026-03-01T18:29:59Z"), "Asia/Kolkata"), "2026-03-01");
    assert.equal(dayOf(at("2026-03-01T18:30:00Z"), "Asia/Kolkata"), "2026-03-02");
    // Los Angeles is UTC-8 in winter: 08:00 UTC is midnight there.
    assert.equal(dayOf(at("2026-03-01T07:59:59Z"), "America/Los_Angeles"), "2026-02-28");
    assert.equal(dayOf(at("2026-03-01T08:00:00Z"), "America/Los_Angeles"), "2026-03-01");
    assert.equal(dayOf(at("2026-03-01T00:00:00Z"), "UTC"), "2026-03-01");
  });

  it("crosses a month and a year boundary", () => {
    assert.equal(dayOf(at("2025-12-31T23:30:00Z"), "UTC"), "2025-12-31");
    assert.equal(dayOf(at("2025-12-31T23:30:00Z"), "Asia/Kolkata"), "2026-01-01");
    assert.equal(dayOf(at("2026-01-31T23:59:59Z"), "UTC"), "2026-01-31");
    assert.equal(dayOf(at("2026-02-01T00:00:00Z"), "UTC"), "2026-02-01");
  });

  it("follows daylight-saving time", () => {
    // New York springs forward on 2026-03-08: before 07:00 UTC it is UTC-5, from then UTC-4.
    assert.equal(dayOf(at("2026-03-08T04:59:59Z"), "America/New_York"), "2026-03-07");
    assert.equal(dayOf(at("2026-03-08T05:00:00Z"), "America/New_York"), "2026-03-08");
    assert.equal(dayOf(at("2026-03-09T03:59:59Z"), "America/New_York"), "2026-03-08");
    assert.equal(dayOf(at("2026-03-09T04:00:00Z"), "America/New_York"), "2026-03-09");
  });

  it("counts several activities on one day once", () => {
    const times = [at("2026-10-13T08:00:00Z"), at("2026-10-13T08:00:00Z"), at("2026-10-13T12:00:00Z"), at("2026-10-13T23:59:59Z")];
    assert.deepEqual([...activityDayKeys(times, "UTC")], ["2026-10-13"]);
  });

  it("ignores times that are not dates", () => {
    assert.deepEqual([...activityDayKeys([Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1, at("2026-10-13T00:00:00Z")], "UTC")], ["2026-10-13"]);
  });

  it("gives different days to the same instants in different zones", () => {
    const times = [at("2026-10-10T22:00:00Z"), at("2026-10-11T02:00:00Z")];
    assert.deepEqual([...activityDayKeys(times, "UTC")].sort(), ["2026-10-10", "2026-10-11"]);
    // Los Angeles is UTC-7 in October: 15:00 and 19:00 on the 10th.
    assert.deepEqual([...activityDayKeys(times, "America/Los_Angeles")], ["2026-10-10"]);
  });

  it("falls back to UTC for the browser zone when it cannot be told", () => {
    assert.match(browserTimeZone(), /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$|^UTC$/);
  });
});

describe("summarizeStreaks", () => {
  const today = "2026-10-13";

  it("is zero with no activity", () => {
    assert.deepEqual(summarizeStreaks([], today), { current: 0, longest: 0, activeLastYear: 0, todayDone: false });
  });

  it("counts consecutive days up to today", () => {
    const s = summarizeStreaks(days("2026-10-11", "2026-10-12", "2026-10-13"), today);
    assert.deepEqual(s, { current: 3, longest: 3, activeLastYear: 3, todayDone: true });
  });

  it("keeps the streak alive until the day ends when only today is missing", () => {
    const s = summarizeStreaks(days("2026-10-11", "2026-10-12"), today);
    assert.equal(s.current, 2);
    assert.equal(s.todayDone, false);
  });

  it("ends the current streak after a missed day but keeps the longest", () => {
    const s = summarizeStreaks(days("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-11"), today);
    assert.equal(s.current, 0, "the 12th and 13th are both empty");
    assert.equal(s.longest, 4);
  });

  it("starts over with a single day after a gap", () => {
    const s = summarizeStreaks(days("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-13"), today);
    assert.deepEqual([s.current, s.longest], [1, 3]);
  });

  it("keeps the longest streak of all time, however old", () => {
    const old = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10));
    const s = summarizeStreaks([...old, "2026-10-13"], today);
    assert.deepEqual([s.current, s.longest], [1, 40]);
    assert.equal(s.activeLastYear, 1, "only today is inside the last 365 days");
  });

  it("joins days across a month boundary", () => {
    assert.equal(summarizeStreaks(days("2026-01-30", "2026-01-31", "2026-02-01"), "2026-02-01").current, 3);
  });

  it("joins days across a year boundary", () => {
    assert.equal(summarizeStreaks(days("2025-12-30", "2025-12-31", "2026-01-01"), "2026-01-01").current, 3);
  });

  it("knows leap years", () => {
    assert.equal(summarizeStreaks(days("2028-02-28", "2028-02-29", "2028-03-01"), "2028-03-01").current, 3);
    assert.equal(summarizeStreaks(days("2026-02-28", "2026-03-01"), "2026-03-01").current, 2, "2026 has no 29 February");
  });

  it("is not broken by a daylight-saving change", () => {
    assert.equal(summarizeStreaks(days("2026-03-07", "2026-03-08", "2026-03-09"), "2026-03-09").current, 3);
    assert.equal(summarizeStreaks(days("2026-10-31", "2026-11-01", "2026-11-02"), "2026-11-02").current, 3);
  });

  it("does not count the same days twice", () => {
    const once = summarizeStreaks(days("2026-10-12", "2026-10-13"), today);
    const repeated = summarizeStreaks(days("2026-10-12", "2026-10-13", "2026-10-13", "2026-10-12", "2026-10-13"), today);
    assert.deepEqual(repeated, once);
    assert.equal(repeated.current, 2);
  });

  it("ignores days after today (a device clock that ran ahead) and things that are not days", () => {
    const s = summarizeStreaks(days("2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-02-30", "garbage", ""), today);
    assert.deepEqual([s.current, s.longest, s.activeLastYear], [2, 2, 2]);
  });

  it("counts the last 365 days, today included", () => {
    assert.equal(summarizeStreaks(days("2025-10-14"), today).activeLastYear, 1, "364 days ago is inside");
    assert.equal(summarizeStreaks(days("2025-10-13"), today).activeLastYear, 0, "365 days ago is outside");
  });

  it("gives a different streak in a different time zone for the same activity", () => {
    // Activity at 22:00 UTC on the 12th and 02:00 UTC on the 13th, looked at on the 13th.
    const times = [at("2026-10-12T22:00:00Z"), at("2026-10-13T02:00:00Z")];
    assert.equal(summarizeStreaks(activityDayKeys(times, "UTC"), "2026-10-13").current, 2);
    assert.equal(summarizeStreaks(activityDayKeys(times, "America/Los_Angeles"), "2026-10-12").current, 1);
  });
});

describe("what counts as activity", () => {
  it("counts answered practice questions, not skipped or timed-out ones", () => {
    assert.equal(countsAsAnswer("correct"), true);
    assert.equal(countsAsAnswer("incorrect"), true);
    assert.equal(countsAsAnswer("skipped"), false);
    assert.equal(countsAsAnswer("timed_out"), false);
  });

  it("counts a Sudoku only when it was solved", () => {
    assert.equal(sudokuCounts({ completed: true }), true);
    assert.equal(sudokuCounts({ completed: false }), false);
  });

  it("counts a Queens or Zip puzzle only when it was solved", () => {
    assert.equal(queensCounts({ completed: true }), true);
    assert.equal(queensCounts({ completed: false }), false);
    assert.equal(zipCounts({ completed: true }), true);
    assert.equal(zipCounts({ completed: false }), false);
  });

  it("counts a Patches puzzle only when it was solved", () => {
    assert.equal(patchesCounts({ completed: true }), true);
    assert.equal(patchesCounts({ completed: false }), false);
  });

  it("counts a 2048 game that ended, reached 2048 or had enough moves", () => {
    assert.equal(game2048Counts({ gameOver: true, reached2048: false, moves: 3 }), true);
    assert.equal(game2048Counts({ gameOver: false, reached2048: true, moves: 3 }), true);
    assert.equal(game2048Counts({ gameOver: false, reached2048: false, moves: MIN_2048_MOVES }), true);
    assert.equal(game2048Counts({ gameOver: false, reached2048: false, moves: MIN_2048_MOVES - 1 }), false);
  });
});
