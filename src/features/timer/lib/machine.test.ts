import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OFF, nextDeadline, step, viewOf } from "./machine";
import { ALERT_MS, EXTEND_MS, GRACE_MS, type ActivityInfo, type MachineState, type TimerEvent } from "./types";

const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;

/** Runs events at given times and collects every alert. */
function run(steps: [number, TimerEvent][], from: MachineState = OFF) {
  let state = from;
  const alerts: number[] = [];
  for (const [at, event] of steps) {
    const out = step(state, event, at);
    state = out.state;
    if (out.effects.length > 0) alerts.push(at);
  }
  return { state, alerts };
}

const normal: ActivityInfo = { endless: false, paused: false };
const endless: ActivityInfo = { endless: true, paused: false };

describe("study timer state machine", () => {
  it("starts at an absolute end time and counts down", () => {
    const { state } = run([[T0, { kind: "start", minutes: 10 }]]);
    assert.equal(state.timer?.endsAt, T0 + 10 * MIN);
    assert.deepEqual(viewOf(state, T0 + 4 * MIN), { phase: "running", remainingMs: 6 * MIN, overMs: 0, bannerLeftMs: 0 });
  });

  it("ignores lengths outside 1-240 whole minutes", () => {
    for (const minutes of [0, -5, 241, 1.5, NaN]) assert.equal(run([[T0, { kind: "start", minutes }]]).state.timer, null);
    assert.ok(run([[T0, { kind: "start", minutes: 240 }]]).state.timer);
    assert.ok(run([[T0, { kind: "start", minutes: 1 }]]).state.timer);
  });

  it("alerts immediately at expiry when idle, once", () => {
    const { state, alerts } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0 + 5 * MIN - 1, { kind: "tick" }],
      [T0 + 5 * MIN, { kind: "tick" }],
      [T0 + 5 * MIN + 1000, { kind: "tick" }],
      [T0 + 9 * MIN, { kind: "tick" }],
    ]);
    assert.deepEqual(alerts, [T0 + 5 * MIN]);
    assert.equal(state.timer?.alertedAt, T0 + 5 * MIN);
  });

  it("alerts late but once when the page was asleep past the end (a refresh, a throttled tab)", () => {
    const { alerts } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0 + 50 * MIN, { kind: "tick" }],
    ]);
    assert.deepEqual(alerts, [T0 + 50 * MIN]);
  });

  it("waits for a session to end, then alerts at that moment", () => {
    const { state, alerts } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0 + 1 * MIN, { kind: "activity", activity: normal }],
      [T0 + 5 * MIN, { kind: "tick" }],
      [T0 + 7 * MIN, { kind: "tick" }],
    ]);
    assert.deepEqual(alerts, []);
    assert.equal(viewOf(state, T0 + 7 * MIN).phase, "waiting");
    assert.equal(viewOf(state, T0 + 7 * MIN).overMs, 2 * MIN);

    const ended = step(state, { kind: "activity", activity: null }, T0 + 8 * MIN);
    assert.equal(ended.effects.length, 1);
    assert.equal(viewOf(ended.state, T0 + 8 * MIN).phase, "alerting");
    // The overrun keeps counting through the wait.
    assert.equal(viewOf(ended.state, T0 + 8 * MIN).overMs, 3 * MIN);
  });

  it("never waits for a non-endless activity beyond its end, however long it takes", () => {
    const { alerts } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0, { kind: "activity", activity: normal }],
      [T0 + 60 * MIN, { kind: "tick" }],
    ]);
    assert.deepEqual(alerts, []);
  });

  it("gives an endless activity the 3-minute grace, then alerts", () => {
    const { state, alerts } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0, { kind: "activity", activity: endless }],
      [T0 + 5 * MIN, { kind: "tick" }],
      [T0 + 5 * MIN + GRACE_MS - 1, { kind: "tick" }],
    ]);
    assert.deepEqual(alerts, []);
    assert.equal(nextDeadline(state, T0 + 5 * MIN + 1), T0 + 5 * MIN + GRACE_MS);
    const out = step(state, { kind: "tick" }, T0 + 5 * MIN + GRACE_MS);
    assert.equal(out.effects.length, 1);
  });

  it("alerts at game over before the grace is up", () => {
    const { alerts } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0, { kind: "activity", activity: endless }],
      [T0 + 5 * MIN + 30_000, { kind: "tick" }],
      [T0 + 5 * MIN + 40_000, { kind: "activity", activity: null }],
    ]);
    assert.deepEqual(alerts, [T0 + 5 * MIN + 40_000]);
  });

  it("treats a paused session as a safe point", () => {
    const { alerts } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0, { kind: "activity", activity: normal }],
      [T0 + 5 * MIN + 1000, { kind: "tick" }],
      [T0 + 5 * MIN + 2000, { kind: "activity", activity: { endless: false, paused: true } }],
    ]);
    assert.deepEqual(alerts, [T0 + 5 * MIN + 2000]);
  });

  it("shows the banner for 15 seconds, then the badge, counting up all along", () => {
    const { state } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0 + 5 * MIN, { kind: "tick" }],
    ]);
    const end = T0 + 5 * MIN;
    assert.deepEqual(viewOf(state, end + 5000), { phase: "alerting", remainingMs: 0, overMs: 5000, bannerLeftMs: ALERT_MS - 5000 });
    assert.equal(viewOf(state, end + ALERT_MS).phase, "overrun");
    assert.equal(viewOf(state, end + 80_000).overMs, 80_000);
    assert.equal(nextDeadline(state, end + 1), null);
  });

  it("extends by 5 minutes before the alert, including while waiting, but never after it", () => {
    const base = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0, { kind: "activity", activity: normal }],
      [T0 + 5 * MIN + MIN, { kind: "tick" }],
    ]).state;
    const extended = step(base, { kind: "extend" }, T0 + 6 * MIN).state;
    assert.equal(extended.timer?.endsAt, T0 + 5 * MIN + EXTEND_MS);
    assert.equal(viewOf(extended, T0 + 6 * MIN).phase, "running");

    const alerted = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0 + 5 * MIN, { kind: "tick" }],
    ]).state;
    assert.equal(step(alerted, { kind: "extend" }, T0 + 5 * MIN + 1000).state, alerted);
  });

  it("stops and clears", () => {
    const { state } = run([
      [T0, { kind: "start", minutes: 5 }],
      [T0 + 1000, { kind: "stop" }],
    ]);
    assert.equal(state.timer, null);
    assert.equal(viewOf(state, T0 + 2000).phase, "off");
  });

  it("restores a saved timer after a refresh, alerting once if it ended while the page was away", () => {
    const resumed = step(OFF, { kind: "load", timer: { endsAt: T0 + 5 * MIN, alertedAt: null } }, T0 + 2 * MIN);
    assert.equal(viewOf(resumed.state, T0 + 2 * MIN).remainingMs, 3 * MIN);
    assert.equal(resumed.effects.length, 0);

    const late = step(OFF, { kind: "load", timer: { endsAt: T0 + 5 * MIN, alertedAt: null } }, T0 + 9 * MIN);
    assert.equal(late.effects.length, 1);

    // Already alerted before the refresh: no second beep.
    const again = step(OFF, { kind: "load", timer: { endsAt: T0 + 5 * MIN, alertedAt: T0 + 5 * MIN } }, T0 + 9 * MIN);
    assert.equal(again.effects.length, 0);
    assert.equal(viewOf(again.state, T0 + 9 * MIN).phase, "overrun");
  });
});
