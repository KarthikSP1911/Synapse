import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, type NBackConfig } from "./types";
import { modeOf, presetStreams, summarizeConfig } from "./summary";

const withStreams = (streams: NBackConfig["streams"]): NBackConfig => ({ ...DEFAULT_CONFIG, streams });

describe("N-Back quick start", () => {
  it("recognises each mode by its streams", () => {
    assert.equal(modeOf(DEFAULT_CONFIG), "single");
    assert.equal(modeOf(withStreams(presetStreams("dual"))), "dual");
    assert.equal(modeOf(withStreams(presetStreams("triple"))), "triple");
  });

  it("calls any other combination custom", () => {
    assert.equal(modeOf(withStreams({ position: false, color: true, letter: false })), "custom");
    assert.equal(modeOf(withStreams({ position: true, color: false, letter: true })), "custom");
  });

  it("a preset changes only the streams", () => {
    const next = { ...DEFAULT_CONFIG, n: 4, grid: 5, streams: presetStreams("triple") };
    assert.equal(next.n, 4);
    assert.equal(next.grid, 5);
    assert.deepEqual(next.streams, { position: true, color: true, letter: true });
  });
});

describe("N-Back summary", () => {
  it("reads as one plain sentence", () => {
    const text = summarizeConfig({ ...DEFAULT_CONFIG, streams: presetStreams("dual"), grid: 5 });
    assert.match(text, /^2-back, Position \+ Color, 5×5, 22 flashes \(20 scored\), about \d+ (min|sec), \d+ coins\.$/);
  });

  it("leaves out the board when Position is off and the length when unlimited", () => {
    const text = summarizeConfig({ ...DEFAULT_CONFIG, streams: { position: false, color: true, letter: false }, unlimited: true });
    assert.match(text, /^2-back, Color, no set length, \d+ coins\.$/);
  });
});
