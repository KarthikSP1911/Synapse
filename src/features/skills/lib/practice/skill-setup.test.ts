import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "@/features/settings/lib/settings";
import { configFromState, initialSetupState } from "./setup-state";
import { activePreset, applyPreset, isCustomized, presetRow, questionPoolSize, summarizeSkillSetup } from "./skill-presets";
import { loadFocus, loadSkillSetup, parseSkillSetup, saveFocus, saveSkillSetup } from "./skill-memory";
import { SKILLS } from "../types";

const fresh = () => initialSetupState(DEFAULT_SETTINGS);

describe("skill quick-start presets", () => {
  for (const skill of SKILLS) {
    it(`${skill}: every preset makes a playable setup, and is recognised as itself`, () => {
      const { presets } = presetRow(skill);
      assert.ok(presets.length >= 3);
      for (const preset of presets) {
        const state = applyPreset(skill, fresh(), preset.id);
        const built = configFromState(skill, state);
        assert.ok(built.ok, `${preset.id}: ${built.ok ? "" : built.error}`);
        assert.ok(questionPoolSize(built.config) > 0, `${preset.id} has questions`);
        assert.equal(activePreset(skill, state), preset.id);
      }
    });

    it(`${skill}: a fresh page is on a preset, and not customised`, () => {
      const state = fresh();
      assert.notEqual(activePreset(skill, state), "custom");
      assert.equal(isCustomized(skill, state, fresh()), false);
    });
  }

  it("choosing Custom changes nothing", () => {
    const state = fresh();
    assert.deepEqual(applyPreset("multiplication", state, "custom"), state);
  });

  it("an edit that matches no preset is custom, and opens Customize", () => {
    const state = fresh();
    state.multiplication.left = [2, 3, 5];
    assert.equal(activePreset("multiplication", state), "custom");
    assert.equal(isCustomized("multiplication", state, fresh()), true);
  });

  it("changed exercise types open Customize even on a preset", () => {
    const state = applyPreset("percentage", fresh(), "advanced");
    assert.equal(isCustomized("percentage", state, fresh()), false);
    state.percentage.exerciseTypes = state.percentage.exerciseTypes.slice(0, 1);
    assert.equal(isCustomized("percentage", state, fresh()), true);
  });

  it("a hand-edited number range is custom even at a preset difficulty", () => {
    const state = applyPreset("percentage", fresh(), "beginner");
    state.percentage.baseMax = "300";
    assert.equal(activePreset("percentage", state), "custom");
  });
});

describe("skill setup summary", () => {
  it("reads as one sentence", () => {
    const state = fresh();
    const built = configFromState("multiplication", state);
    assert.ok(built.ok);
    const text = summarizeSkillSetup({ skill: "multiplication", state, session: "20", focus: "adaptive", pool: questionPoolSize(built.config) });
    assert.equal(text, "20 questions on 1–20 × 1–20, an adaptive mix, from a pool of 400 pairs.");
  });

  it("describes endless and timed sessions", () => {
    const base = { skill: "addition", state: fresh(), focus: "weak", pool: 10 } as const;
    assert.match(summarizeSkillSetup({ ...base, session: "endless" }), /^An endless session on 1–2-digit \+ 1–2-digit, your weak spots/);
    assert.match(summarizeSkillSetup({ ...base, session: "timed:60" }), /^1-minute challenge on /);
    assert.match(summarizeSkillSetup({ ...base, session: "timed:30" }), /^30-second challenge on /);
  });
});

describe("remembered skill options", () => {
  class MemoryStorage {
    items = new Map<string, string>();
    getItem(key: string) {
      return this.items.get(key) ?? null;
    }
    setItem(key: string, value: string) {
      this.items.set(key, value);
    }
  }
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
  });

  it("brings back what was saved, for each skill apart from the others", () => {
    const state = applyPreset("addition", applyPreset("multiplication", fresh(), "6-10"), "d3");
    saveSkillSetup("multiplication", state);
    saveSkillSetup("addition", state);
    const back = loadSkillSetup("multiplication", fresh());
    assert.deepEqual(back.multiplication, state.multiplication);
    assert.deepEqual(back.addition, fresh().addition, "another skill's options are not read in");
    assert.deepEqual(loadSkillSetup("addition", fresh()).addition, state.addition);
  });

  it("keeps the good fields of a damaged record and defaults the rest", () => {
    const parsed = parseSkillSetup("subtraction", { leftDigits: [3], rightDigits: "many", allowNegative: "yes" }, fresh());
    assert.deepEqual(parsed.subtraction, { leftDigits: [3], rightDigits: fresh().subtraction.rightDigits, allowNegative: false });
  });

  it("rejects out-of-range numbers and unknown exercise types", () => {
    assert.deepEqual(parseSkillSetup("multiplication", { left: [0, 21, 4, 4, 2], right: [] }, fresh()).multiplication, { left: [2, 4], right: fresh().multiplication.right });
    const parsed = parseSkillSetup("percentage", { exerciseTypes: ["bogus"], difficulty: "extreme", baseMin: "-5", baseMax: "20" }, fresh());
    assert.deepEqual(parsed.percentage.exerciseTypes, fresh().percentage.exerciseTypes);
    assert.equal(parsed.percentage.difficulty, fresh().percentage.difficulty);
    assert.equal(parsed.percentage.baseMin, fresh().percentage.baseMin);
    assert.equal(parsed.percentage.baseMax, "20");
  });

  it("falls back to the defaults for junk and for unreadable storage", () => {
    for (const junk of [null, undefined, 5, "text", []]) assert.deepEqual(parseSkillSetup("square", junk, fresh()), fresh());
    storage.setItem("mathz:setup:square", "{not json");
    assert.deepEqual(loadSkillSetup("square", fresh()), fresh());
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    assert.deepEqual(loadSkillSetup("square", fresh()), fresh());
    assert.doesNotThrow(() => saveSkillSetup("square", fresh()));
    assert.doesNotThrow(() => saveFocus("square", "weak"));
    assert.equal(loadFocus("square"), "adaptive");
  });

  it("remembers the focus, and ignores a value it does not know", () => {
    assert.equal(loadFocus("division"), "adaptive");
    saveFocus("division", "due");
    assert.equal(loadFocus("division"), "due");
    storage.setItem("mathz:focus:division", "everything");
    assert.equal(loadFocus("division"), "adaptive");
  });
});
