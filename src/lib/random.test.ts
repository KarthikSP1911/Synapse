import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seededRng } from "./random";

describe("seededRng", () => {
  it("replays the same sequence for the same seed and differs between seeds", () => {
    const take = (seed: number) => {
      const rng = seededRng(seed);
      return Array.from({ length: 8 }, () => rng());
    };
    assert.deepEqual(take(7), take(7));
    assert.notDeepEqual(take(7), take(8));
  });

  it("stays in [0, 1)", () => {
    const rng = seededRng(2024);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1);
    }
  });

  it("keeps its published mulberry32 output, so seeded tests and fixtures stay valid", () => {
    // Pinned against the implementations MindSprint and Sudoku had before this moved here (identical output).
    const rng = seededRng(1);
    assert.deepEqual([rng(), rng(), rng()].map((v) => Math.round(v * 1e6)), [627074, 2736, 527447]);
  });
});
