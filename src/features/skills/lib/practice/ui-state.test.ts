import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, isSessionChoice, parseSettings } from "@/features/settings/lib/settings";
import { configFromState, initialSetupState } from "./setup-state";
import { squareRangeBuckets } from "@/features/progress/lib/square-range";
import { buildPool } from "../pools";
import { SKILLS } from "../types";

describe("settings", () => {
  it("keeps values saved by the original two-field version and fills in the rest", () => {
    const parsed = parseSettings({ weakFocusPercent: 40, recentWindow: 2 });
    assert.equal(parsed.weakFocusPercent, 40);
    assert.equal(parsed.recentWindow, 2);
    assert.deepEqual({ ...parsed, weakFocusPercent: 30, recentWindow: 5 }, DEFAULT_SETTINGS);
  });

  it("falls back per field, never wholesale", () => {
    const parsed = parseSettings({
      weakFocusPercent: 99, // above the allowed maximum
      recentWindow: 3,
      difficulty: "expert",
      defaultSession: "timed:45",
      questionTimeLimit: 15,
      showExplanations: "yes",
      enabledExercises: { percentage: ["of", "bogus"], fraction: [], square: "value" },
    });
    assert.equal(parsed.weakFocusPercent, DEFAULT_SETTINGS.weakFocusPercent);
    assert.equal(parsed.recentWindow, 3);
    assert.equal(parsed.difficulty, "beginner");
    assert.equal(parsed.defaultSession, "20");
    assert.equal(parsed.questionTimeLimit, 0);
    assert.equal(parsed.showExplanations, true);
    assert.deepEqual(parsed.enabledExercises.percentage, ["of"]);
    assert.deepEqual(parsed.enabledExercises.fraction, DEFAULT_SETTINGS.enabledExercises.fraction);
    assert.deepEqual(parsed.enabledExercises.square, DEFAULT_SETTINGS.enabledExercises.square);
  });

  it("auto-advances by default and keeps an explicit choice", () => {
    assert.equal(DEFAULT_SETTINGS.autoAdvance, true);
    assert.equal(parseSettings({}).autoAdvance, true);
    assert.equal(parseSettings({ autoAdvance: false }).autoAdvance, false);
    assert.equal(parseSettings({ autoAdvance: "no" }).autoAdvance, true);
  });

  it("copes with junk", () => {
    for (const junk of [null, undefined, 5, "text", [], { enabledExercises: null }]) {
      assert.deepEqual(parseSettings(junk), DEFAULT_SETTINGS);
    }
  });

  it("recognises valid session choices only", () => {
    for (const ok of ["10", "20", "30", "50", "100", "endless", "timed:30", "timed:60", "timed:120"]) assert.ok(isSessionChoice(ok), ok);
    for (const bad of ["15", "timed:45", "timed:", "", "forever", 20]) assert.ok(!isSessionChoice(bad), String(bad));
  });
});

describe("setup state", () => {
  const state = initialSetupState(DEFAULT_SETTINGS);

  it("starts with every skill configurable and its pool non-empty", () => {
    for (const skill of SKILLS) {
      const built = configFromState(skill, state);
      assert.ok(built.ok, skill);
      assert.ok(buildPool(built.config).length > 0, skill);
    }
  });

  it("asks for a digit count on each side of addition, subtraction and division", () => {
    const missing = (skill: "addition" | "subtraction", side: "leftDigits" | "rightDigits") =>
      configFromState(skill, { ...state, [skill]: { ...state[skill], [side]: [] } });
    for (const skill of ["addition", "subtraction"] as const) {
      assert.ok(!missing(skill, "leftDigits").ok, skill);
      assert.ok(!missing(skill, "rightDigits").ok, skill);
    }
    assert.ok(!configFromState("division", { ...state, division: { ...state.division, dividendDigits: [] } }).ok);
    assert.ok(!configFromState("division", { ...state, division: { ...state.division, divisorDigits: [] } }).ok);
  });

  it("passes the subtraction and division options through to the configuration", () => {
    const subtraction = configFromState("subtraction", { ...state, subtraction: { ...state.subtraction, allowNegative: true } });
    assert.ok(subtraction.ok && subtraction.config.skill === "subtraction" && subtraction.config.allowNegative);
    const division = configFromState("division", { ...state, division: { ...state.division, decimals: false } });
    assert.ok(division.ok && division.config.skill === "division" && !division.config.decimals);
  });

  it("starts squares and percentages from the default difficulty", () => {
    const advanced = initialSetupState({ ...DEFAULT_SETTINGS, difficulty: "advanced" });
    assert.equal(advanced.square.rangeMax, "100");
    assert.equal(advanced.percentage.baseMax, "1000");
    assert.equal(advanced.fraction.difficulty, "advanced");
  });

  it("reports unusable ranges instead of guessing", () => {
    const bad = (patch: object) => configFromState("square", { ...state, square: { ...state.square, ...patch } });
    assert.ok(!bad({ rangeMin: "" }).ok);
    assert.ok(!bad({ rangeMin: "30", rangeMax: "20" }).ok);
    assert.ok(!bad({ rangeMax: "101" }).ok);
    assert.ok(!bad({ rangeMin: "0" }).ok);
    assert.ok(bad({ rangeMin: "30", rangeMax: "32" }).ok);
    assert.ok(!configFromState("percentage", { ...state, percentage: { ...state.percentage, baseMax: "10001" } }).ok);
    assert.ok(!configFromState("multiplication", { ...state, multiplication: { left: [], right: [1] } }).ok);
  });

  it("allows custom square ranges anywhere within 1-100", () => {
    const built = configFromState("square", { ...state, square: { ...state.square, rangeMin: "47", rangeMax: "63" } });
    assert.ok(built.ok && built.config.skill === "square" && built.config.rangeMin === 47 && built.config.rangeMax === 63);
  });
});

describe("square range chart", () => {
  it("pools attempts per range, weighting accuracy by volume", () => {
    const buckets = squareRangeBuckets([
      { n: 3, attempts: 10, correct: 9, averageResponseTimeMs: 2000 },
      { n: 7, attempts: 30, correct: 15, averageResponseTimeMs: 4000 },
      { n: 95, attempts: 4, correct: 1, averageResponseTimeMs: 6000 },
    ]);
    assert.equal(buckets.length, 10);
    assert.equal(buckets[0].label, "1–10");
    assert.equal(buckets[0].attempts, 40);
    assert.equal(buckets[0].accuracy, 60); // 24 of 40, not the average of 90% and 50%
    assert.equal(buckets[0].avgSeconds, 3.5);
    assert.equal(buckets[9].label, "91–100");
    assert.equal(buckets[9].accuracy, 25);
    assert.equal(buckets[4].attempts, 0);
    assert.equal(buckets[4].accuracy, 0);
  });

  it("ignores out-of-range numbers", () => {
    const buckets = squareRangeBuckets([{ n: 101, attempts: 5, correct: 5, averageResponseTimeMs: 1 }]);
    assert.equal(buckets.reduce((sum, b) => sum + b.attempts, 0), 0);
  });
});
