import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SWIPE_PX, swipeDirection } from "./use-swipe";

describe("swipeDirection", () => {
  it("waits until the drag is long enough", () => {
    assert.equal(swipeDirection(0, 0), null);
    assert.equal(swipeDirection(SWIPE_PX - 1, SWIPE_PX - 1), null);
    assert.equal(swipeDirection(-(SWIPE_PX - 1), 3), null);
  });

  it("names the four directions", () => {
    assert.equal(swipeDirection(SWIPE_PX, 0), "right");
    assert.equal(swipeDirection(-SWIPE_PX, 0), "left");
    assert.equal(swipeDirection(0, SWIPE_PX), "down");
    assert.equal(swipeDirection(0, -SWIPE_PX), "up");
  });

  it("follows the longer axis of a diagonal drag", () => {
    assert.equal(swipeDirection(40, -10), "right");
    assert.equal(swipeDirection(-10, 40), "down");
    assert.equal(swipeDirection(-30, -50), "up");
  });
});
