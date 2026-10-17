import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { placeWidget, snapCorner, spotRect, type Rect, type Size, type Viewport } from "./corner";
import { exceedsSlop, releaseGesture } from "./gesture";
import { formatOver, formatRemaining, parseMinutes } from "./duration";
import {
  DEFAULT_PREFS,
  TIMER_LAST_KEY,
  TIMER_STATE_KEY,
  TIMER_UI_KEY,
  loadLastMinutes,
  loadPrefs,
  loadTimer,
  saveLastMinutes,
  savePrefs,
  saveTimer,
  type KeyValue,
} from "./storage";

function memory(initial: Record<string, string> = {}): KeyValue & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

// A 360 x 740 phone with a 56 px header showing and the 60 px tab bar at the bottom, 12 px of margin.
const phone: Viewport = { width: 360, height: 740, insets: { top: 56 + 12, right: 12, bottom: 60 + 12, left: 12 } };
const full: Size = { width: 56, height: 56 };
const small: Size = { width: 36, height: 36 };

describe("corner snapping", () => {
  it("snaps a released widget to the nearest corner", () => {
    assert.equal(snapCorner({ x: 40, y: 100 }, phone, full), "tl");
    assert.equal(snapCorner({ x: 330, y: 90 }, phone, full), "tr");
    assert.equal(snapCorner({ x: 30, y: 700 }, phone, full), "bl");
    assert.equal(snapCorner({ x: 300, y: 600 }, phone, full), "br");
    // The middle of the screen goes to whichever corner is nearer; a tie never throws.
    assert.ok(["tl", "tr", "bl", "br"].includes(snapCorner({ x: 180, y: 404 }, phone, full)));
  });

  it("keeps corners inside the insets, clear of the header and the tab bar", () => {
    const br = spotRect({ kind: "corner", corner: "br" }, phone, full);
    assert.deepEqual(br, { left: 292, top: 612, right: 348, bottom: 668 });
    const tl = spotRect({ kind: "corner", corner: "tl" }, phone, full);
    assert.equal(tl.left, 12);
    assert.equal(tl.top, 68);
  });
});

describe("keeping clear of what the user is working on", () => {
  const rectAt = (corner: "tl" | "tr" | "bl" | "br", size: Size): Rect => spotRect({ kind: "corner", corner }, phone, size);

  it("uses the remembered corner when nothing is in the way", () => {
    const placed = placeWidget("tr", phone, [full, small], []);
    assert.deepEqual(placed?.spot, { kind: "corner", corner: "tr" });
  });

  it("moves to the nearest free corner when the remembered one is covered, without changing the preference", () => {
    const placed = placeWidget("br", phone, [full, small], [rectAt("br", full)]);
    assert.equal(placed?.spot.kind, "corner");
    assert.notDeepEqual(placed?.spot, { kind: "corner", corner: "br" });
  });

  it("falls back to a side-edge slot when every corner is covered", () => {
    const corners = (["tl", "tr", "bl", "br"] as const).map((c) => rectAt(c, full));
    const placed = placeWidget("br", phone, [full], corners);
    assert.equal(placed?.spot.kind, "edge");
    for (const c of corners) assert.ok(placed && (placed.rect.right <= c.left || placed.rect.left >= c.right || placed.rect.bottom <= c.top || placed.rect.top >= c.bottom));
  });

  it("shrinks before giving up, and returns null when there is no room at all", () => {
    // Everything but a sliver is the answer area.
    const whole: Rect = { left: 0, top: 0, right: 360, bottom: 740 };
    assert.equal(placeWidget("br", phone, [full, small], [whole]), null);
    // Only the large size is blocked in the remembered corner and at all other spots by one wide band, but the small one fits above it.
    const band: Rect = { left: 0, top: 300, right: 360, bottom: 740 };
    const placed = placeWidget("br", phone, [full, small], [band]);
    assert.ok(placed);
    assert.ok(placed.rect.bottom <= 300 - 6 || placed.rect.top >= 740);
  });
});

describe("the press gesture", () => {
  it("tells a tap, a long-press and a drag apart", () => {
    assert.equal(releaseGesture({ moved: false, heldLong: false }), "tap");
    assert.equal(releaseGesture({ moved: false, heldLong: true }), "longpress");
    assert.equal(releaseGesture({ moved: true, heldLong: true }), "drag");
    assert.equal(releaseGesture({ moved: true, heldLong: false }), "drag");
  });

  it("allows a few pixels of wobble before it is a drag", () => {
    assert.equal(exceedsSlop({ x: 100, y: 100 }, { x: 103, y: 104 }), false);
    assert.equal(exceedsSlop({ x: 100, y: 100 }, { x: 110, y: 100 }), true);
  });
});

describe("remembered widget state", () => {
  it("remembers which side was showing and which corner it sat in across a refresh", () => {
    const store = memory();
    assert.deepEqual(loadPrefs(store), DEFAULT_PREFS);
    savePrefs({ side: "back", corner: "tl" }, store);
    assert.deepEqual(loadPrefs(store), { side: "back", corner: "tl" });
  });

  it("falls back to the defaults for a damaged or hand-edited value", () => {
    for (const bad of ["not json", "null", "[]", '{"side":"sideways","corner":"middle"}', '{"side":"back"}']) {
      const loaded = loadPrefs(memory({ [TIMER_UI_KEY]: bad }));
      assert.ok(loaded.side === "front" || loaded.side === "back");
      assert.ok(["tl", "tr", "bl", "br"].includes(loaded.corner));
    }
    assert.deepEqual(loadPrefs(memory({ [TIMER_UI_KEY]: '{"side":"sideways","corner":"middle"}' })), DEFAULT_PREFS);
  });

  it("survives storage being unavailable", () => {
    assert.deepEqual(loadPrefs(null), DEFAULT_PREFS);
    savePrefs({ side: "back", corner: "tr" }, null);
    const throwing: KeyValue = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(loadPrefs(throwing), DEFAULT_PREFS);
    savePrefs(DEFAULT_PREFS, throwing);
    assert.equal(loadLastMinutes(throwing), null);
  });

  it("remembers the last length, within 1-240", () => {
    const store = memory();
    assert.equal(loadLastMinutes(store), null);
    saveLastMinutes(25, store);
    assert.equal(loadLastMinutes(store), 25);
    store.data.set(TIMER_LAST_KEY, "999");
    assert.equal(loadLastMinutes(store), null);
  });
});

describe("the saved timer", () => {
  const now = 1_700_000_000_000;

  it("round-trips for its own viewer and is ignored by another", () => {
    const store = memory();
    saveTimer("user:7", { endsAt: now + 60_000, alertedAt: null }, store);
    assert.deepEqual(loadTimer("user:7", now, store), { endsAt: now + 60_000, alertedAt: null });
    assert.equal(loadTimer("user:8", now, store), null);
    assert.equal(loadTimer("guest", now, store), null);
  });

  it("does not remove someone else's timer when asked to clear its own", () => {
    const store = memory();
    saveTimer("user:7", { endsAt: now + 60_000, alertedAt: null }, store);
    saveTimer("user:8", null, store);
    assert.ok(store.data.has(TIMER_STATE_KEY));
    saveTimer("user:7", null, store);
    assert.ok(!store.data.has(TIMER_STATE_KEY));
  });

  it("rejects damaged records", () => {
    const good = { v: 1, viewer: "guest", endsAt: now + 1000, alertedAt: null };
    const cases: unknown[] = [
      "garbage",
      { ...good, v: 2 },
      { ...good, viewer: "" },
      { ...good, endsAt: "soon" },
      { ...good, endsAt: -5 },
      { ...good, endsAt: now + 10 * 24 * 60 * 60 * 1000 },
      { ...good, alertedAt: "yes" },
    ];
    for (const bad of cases) {
      const store = memory({ [TIMER_STATE_KEY]: typeof bad === "string" ? bad : JSON.stringify(bad) });
      assert.equal(loadTimer("guest", now, store), null, JSON.stringify(bad));
    }
    assert.ok(loadTimer("guest", now, memory({ [TIMER_STATE_KEY]: JSON.stringify(good) })));
  });
});

describe("lengths and clocks", () => {
  it("accepts whole minutes from 1 to 240 only", () => {
    assert.deepEqual(parseMinutes(" 25 "), { ok: true, minutes: 25 });
    assert.equal(parseMinutes("1").ok, true);
    assert.equal(parseMinutes("240").ok, true);
    for (const bad of ["", "0", "241", "-3", "2.5", "1e2", "abc", "٣"]) assert.equal(parseMinutes(bad).ok, false, bad);
  });

  it("formats the countdown rounded up and the overrun rounded down", () => {
    assert.equal(formatRemaining(60_000), "1:00");
    assert.equal(formatRemaining(59_001), "1:00");
    assert.equal(formatRemaining(1), "0:01");
    assert.equal(formatRemaining(3_600_000), "1:00:00");
    assert.equal(formatOver(80_000), "+1:20 over");
    assert.equal(formatOver(999), "+0:00 over");
    assert.equal(formatOver(3_723_000), "+1:02:03 over");
  });
});
