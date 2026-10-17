import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StudyTimerController, type TimerBackend, type TimerHost } from "./controller";
import { viewOf } from "./machine";
import { GRACE_MS, type MachineState, type TimerRecord } from "./types";

const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;

/** A clock and timers you move by hand (the same idea as the N-Back runner's test host). */
class FakeHost implements TimerHost {
  time = T0;
  private timers: { id: number; at: number; fn: () => void }[] = [];
  private next = 1;
  now() {
    return this.time;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.next++;
    this.timers.push({ id, at: this.time + ms, fn });
    return id;
  }
  clearTimeout(id: unknown) {
    this.timers = this.timers.filter((t) => t.id !== id);
  }
  /** Time passes smoothly: every timer fires at its own moment. */
  advanceTo(to: number) {
    for (;;) {
      const due = this.timers.filter((t) => t.at <= to).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.time = Math.max(this.time, due.at);
      due.fn();
    }
    this.time = to;
  }
  advance(ms: number) {
    this.advanceTo(this.time + ms);
  }
  /** A sleeping page: time moves and no timer fires. */
  sleep(ms: number) {
    this.time += ms;
  }
  get pending() {
    return this.timers.length;
  }
}

class MemoryBackend implements TimerBackend {
  saved = new Map<string, TimerRecord>();
  load(viewer: string) {
    return this.saved.get(viewer) ?? null;
  }
  save(viewer: string, timer: TimerRecord | null) {
    if (timer) this.saved.set(viewer, timer);
    else this.saved.delete(viewer);
  }
}

function setup(viewer: string | null = "guest", backend = new MemoryBackend(), host = new FakeHost()) {
  const alerts: (boolean | null)[] = [];
  const controller = new StudyTimerController(host, backend, (sound) => alerts.push(sound));
  controller.setViewer(viewer);
  const state = (): MachineState => ({ timer: controller.getSnapshot().timer, activity: controller.getSnapshot().activity });
  const view = () => viewOf(state(), host.time);
  return { host, backend, controller, alerts, view };
}

describe("study timer controller", () => {
  it("counts down on its own wake-up and alerts once at the end", () => {
    const { host, controller, alerts, view } = setup();
    controller.start(5);
    assert.equal(view().phase, "running");
    host.advance(5 * MIN - 1);
    assert.deepEqual(alerts, []);
    host.advance(1);
    assert.equal(alerts.length, 1);
    assert.equal(view().phase, "alerting");
    host.advance(60 * MIN);
    assert.equal(alerts.length, 1);
    assert.equal(host.pending, 0, "nothing left scheduled once alerted");
  });

  it("is correct after a refresh mid-countdown: a new controller reads the absolute end time", () => {
    const first = setup();
    first.controller.start(10);
    first.host.advance(3 * MIN);

    // Page reloaded: same device storage, new controller, same clock.
    const reloaded = setup("guest", first.backend, first.host);
    assert.equal(reloaded.view().phase, "running");
    assert.equal(reloaded.view().remainingMs, 7 * MIN);
    reloaded.host.advance(7 * MIN);
    // The first controller stands in for the old page and is still alive here; between the two, exactly one beep.
    assert.equal(first.alerts.length + reloaded.alerts.length, 1);
    assert.equal(reloaded.view().phase, "alerting");
  });

  it("does not drift when the page sleeps: waking asks the machine again", () => {
    const { host, controller, alerts, view } = setup();
    controller.start(5);
    host.sleep(30 * MIN);
    controller.wake();
    assert.equal(alerts.length, 1);
    assert.equal(view().overMs, 25 * MIN);
  });

  it("waits for a registered session to end, and alerts the moment it does", () => {
    const { host, controller, alerts, view } = setup();
    controller.start(5);
    const handle = controller.registerActivity({ endless: false, paused: false }, { soundOn: () => false });
    host.advance(8 * MIN);
    assert.deepEqual(alerts, []);
    assert.equal(view().phase, "waiting");
    handle.release();
    // The sound setting of the area that was open is what the alert uses.
    assert.deepEqual(alerts, [false]);
    assert.equal(view().phase, "alerting");
  });

  it("uses the grace period for an endless activity", () => {
    const { host, controller, alerts } = setup();
    controller.start(5);
    controller.registerActivity({ endless: true, paused: false });
    host.advance(5 * MIN + GRACE_MS - 1);
    assert.equal(alerts.length, 0);
    host.advance(1);
    assert.deepEqual(alerts, [null], "no sound setting from the activity: the caller falls back to the practice one");
  });

  it("treats pausing as a safe point", () => {
    const { host, controller, alerts } = setup();
    controller.start(5);
    const handle = controller.registerActivity({ endless: false, paused: false });
    host.advance(6 * MIN);
    handle.update({ endless: false, paused: true });
    assert.equal(alerts.length, 1);
  });

  it("Quit flushes the activity, then clears the timer and the saved copy", async () => {
    const { controller, backend, view } = setup();
    controller.start(5);
    const order: string[] = [];
    controller.registerActivity({ endless: true, paused: false }, { flush: async () => void order.push("flushed") });
    await controller.quit();
    order.push(view().phase);
    assert.deepEqual(order, ["flushed", "off"]);
    assert.equal(backend.saved.size, 0);
  });

  it("Quit still clears the timer if a flush fails", async () => {
    const { controller, view } = setup();
    controller.start(5);
    controller.registerActivity({ endless: false, paused: false }, {
      flush: () => {
        throw new Error("disk full");
      },
    });
    await controller.quit();
    assert.equal(view().phase, "off");
  });

  it("ignores a timer that belongs to someone else, and does not erase it when stopping its own", () => {
    const backend = new MemoryBackend();
    const a = setup("user:1", backend);
    a.controller.start(30);
    const b = setup("user:2", backend);
    assert.equal(b.view().phase, "off");
    b.controller.start(5);
    assert.equal(b.view().phase, "running");
    b.controller.stop();
    assert.equal(b.view().phase, "off");
  });

  it("does nothing without a viewer", () => {
    const { controller, view } = setup(null);
    controller.start(5);
    assert.equal(view().phase, "off");
  });

  it("lets only one tab beep: the second adopts the first's alert", () => {
    const backend = new MemoryBackend();
    const host = new FakeHost();
    const tabA = setup("guest", backend, host);
    tabA.controller.start(5);
    const tabB = setup("guest", backend, host);
    host.advance(5 * MIN);
    assert.equal(tabA.alerts.length + tabB.alerts.length, 1);
    assert.equal(tabB.view().phase, "alerting");
  });

  it("follows a change made in another tab", () => {
    const backend = new MemoryBackend();
    const host = new FakeHost();
    const tabA = setup("guest", backend, host);
    const tabB = setup("guest", backend, host);
    tabA.controller.start(5);
    tabB.controller.reload();
    assert.equal(tabB.view().phase, "running");
    tabA.controller.stop();
    tabB.controller.reload();
    assert.equal(tabB.view().phase, "off");
  });

  it("only notifies subscribers when something visible changed", () => {
    const { host, controller } = setup();
    let calls = 0;
    controller.subscribe(() => calls++);
    controller.start(5);
    assert.equal(calls, 1);
    controller.wake();
    controller.wake();
    assert.equal(calls, 1);
    host.advance(5 * MIN);
    assert.equal(calls, 2);
  });
});
