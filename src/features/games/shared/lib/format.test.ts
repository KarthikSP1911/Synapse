import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatApproxDuration, formatSeconds } from "./format";

describe("formatSeconds", () => {
  it("shows one decimal place", () => {
    assert.equal(formatSeconds(0), "0.0s");
    assert.equal(formatSeconds(3240), "3.2s");
    assert.equal(formatSeconds(12_000), "12.0s");
  });
});

describe("formatApproxDuration", () => {
  it("rounds short games to 5 seconds and long ones to minutes", () => {
    assert.equal(formatApproxDuration(42), "about 40 sec");
    assert.equal(formatApproxDuration(89), "about 90 sec");
    assert.equal(formatApproxDuration(90), "about 2 min");
    assert.equal(formatApproxDuration(300), "about 5 min");
  });
});
