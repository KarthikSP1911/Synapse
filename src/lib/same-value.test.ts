import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sameValue } from "./same-value";

describe("sameValue", () => {
  it("compares plain values", () => {
    assert.equal(sameValue(1, 1), true);
    assert.equal(sameValue("a", "b"), false);
    assert.equal(sameValue(null, undefined), false);
    assert.equal(sameValue(NaN, NaN), true);
  });

  it("ignores key order but not array order", () => {
    assert.equal(sameValue({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
    assert.equal(sameValue({ a: [1, 2] }, { a: [2, 1] }), false);
  });

  it("sees a missing or extra key", () => {
    assert.equal(sameValue({ a: 1 }, { a: 1, b: 2 }), false);
    assert.equal(sameValue({ a: undefined }, { b: undefined }), false);
  });

  it("does not mix arrays and objects", () => {
    assert.equal(sameValue([], {}), false);
    assert.equal(sameValue({ 0: "x" }, ["x"]), false);
  });
});
