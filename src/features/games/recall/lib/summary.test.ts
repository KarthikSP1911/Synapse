import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "./config";
import { summarizeConfig } from "./summary";

describe("Number Recall settings summary", () => {
  it("reads as a plain sentence", () => {
    assert.match(summarizeConfig(defaultConfig("single")), /^5 rounds of 6 digits, partial credit, about \d+ (min|sec)\.$/);
  });

  it("names progressive mode, all-or-nothing scoring and the unit of a pair", () => {
    const text = summarizeConfig({ ...defaultConfig("pair"), progressive: true, partialCredit: false, rounds: 1, length: 1 });
    assert.match(text, /^1 round of 1 number, one longer after each perfect round, all or nothing, /);
  });
});
