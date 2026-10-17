import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETUP, PRESETS, copyRound } from "./config";
import { summarizeSetup } from "./summary";

describe("MindSprint setup summary", () => {
  it("reads as a plain sentence", () => {
    const text = summarizeSetup(DEFAULT_SETUP);
    assert.match(text, /^5 rounds of 5 two-digit numbers, addition and subtraction, about \d+ (min|sec), up to [\d,]+ points\.$/);
  });

  it("names decimals and negatives, and a single round", () => {
    const expert = PRESETS.find((p) => p.id === "expert")!;
    const text = summarizeSetup({ config: copyRound(expert.round), rounds: 1 });
    assert.match(text, /^1 round of 7 three-digit numbers, addition, subtraction, multiplication and division, decimals, negatives, /);
  });
});
