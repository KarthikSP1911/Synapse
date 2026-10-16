import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TrialClock } from "./clock";
import { SessionRunner, type RunnerHost, type RunnerResult, type TrialView } from "./runner";
import { LIVES, STREAM_BIT, type NBackConfig, type Trial, type TrialEvaluation } from "./types";

/** A clock and timers you move by hand. `jump` leaves due timers unfired, like a main thread that was busy. */
class FakeHost implements RunnerHost {
  time = 0;
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
  /** Time passes smoothly: every timer fires at its own moment, in order. */
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
  /** Time moves with no timer firing, then the due timers run late, all at once. */
  jump(to: number) {
    this.time = to;
    this.advanceTo(to);
  }
  get pending() {
    return this.timers.length;
  }
}

const bit = STREAM_BIT.position;
const STIM = 500;
const TRIAL = 2000;
const config = (overrides: Partial<NBackConfig> = {}): Pick<NBackConfig, "n" | "streams" | "stimulusMs" | "trialMs"> => ({
  n: 1,
  streams: { position: true, color: false, letter: false },
  stimulusMs: STIM,
  trialMs: TRIAL,
  ...overrides,
});

/** Positions given; matches read from them. Alternating 0, 1 never matches at n = 1. */
function handmade(positions: number[], n: number): Trial[] {
  return positions.map((p, t) => ({ values: { position: p, color: 0, letter: 0 }, matches: { position: t >= n && p === positions[t - n], color: false, letter: false } }));
}
const quiet = (length: number) => handmade(Array.from({ length }, (_, i) => i % 2), 1);

function setup(trials: Trial[], c = config()) {
  const host = new FakeHost();
  const views: { at: number; view: TrialView }[] = [];
  const evaluations: { at: number; evaluation: TrialEvaluation; lives: number }[] = [];
  let result: (RunnerResult & { at: number }) | null = null;
  const runner = new SessionRunner(c, trials, host, {
    onView: (view) => views.push({ at: host.time, view }),
    onEvaluated: (evaluation, lives) => evaluations.push({ at: host.time, evaluation, lives }),
    onFinish: (r) => (result = { ...r, at: host.time }),
  });
  return { host, runner, views, evaluations, result: () => result };
}

describe("the trial clock", () => {
  it("places a moment in a trial by active time, and stops counting while paused", () => {
    const clock = new TrialClock(2000, 500, 10);
    assert.equal(clock.elapsedAt(0), null, "not started");
    clock.start(1000);
    assert.equal(clock.elapsedAt(999), null, "before the start");
    assert.equal(clock.elapsedAt(1000), 0);
    assert.equal(clock.elapsedAt(3500), 2500);
    clock.pause(3500);
    assert.equal(clock.elapsedAt(3500), null, "paused: nothing counts");
    assert.equal(clock.elapsedAt(9000), null);
    assert.equal(clock.elapsedAt(3499), 2499, "a moment just before the pause still counts");
    clock.resume(9000);
    assert.equal(clock.elapsedAt(9000), 2500, "the pause took no active time");
    assert.equal(clock.elapsedAt(9100), 2600);
    assert.equal(clock.elapsedAt(5000), null, "a moment inside the old pause stays refused");
    assert.equal(clock.elapsedAt(3000), 2000, "a moment before the pause is unchanged");
  });

  it("knows which trial and whether the stimulus is lit", () => {
    const clock = new TrialClock(2000, 500, 3);
    assert.equal(clock.trialAt(0), 0);
    assert.equal(clock.trialAt(1999), 0);
    assert.equal(clock.trialAt(2000), 1);
    assert.equal(clock.trialAt(5999), 2);
    assert.equal(clock.trialAt(6000), null, "after the last trial");
    assert.equal(clock.trialAt(-1), null);
    assert.equal(clock.stimulusVisibleAt(0), true);
    assert.equal(clock.stimulusVisibleAt(499), true);
    assert.equal(clock.stimulusVisibleAt(500), false);
    assert.equal(clock.stimulusVisibleAt(2000), true);
    assert.equal(clock.stimulusVisibleAt(6000), false);
  });
});

describe("scheduling", () => {
  it("lights each stimulus at the start of its trial and hides it after the stimulus time", () => {
    const { host, runner, views } = setup(quiet(3));
    runner.start();
    host.advanceTo(3 * TRIAL);
    assert.deepEqual(
      views.map((v) => [v.at, v.view.trial, v.view.stimulusVisible]),
      [
        [0, 0, true],
        [500, 0, false],
        [2000, 1, true],
        [2500, 1, false],
        [4000, 2, true],
        [4500, 2, false],
        [6000, null, false],
      ]
    );
  });

  it("does not drift: a timer that fires late does not push later events back", () => {
    const { host, runner, views } = setup(quiet(4));
    runner.start();
    // The first wake-up is 40 ms late, and so is every one after it; events still carry their own schedule.
    host.jump(540);
    host.jump(2040);
    host.jump(2540);
    host.advanceTo(4000);
    const starts = views.filter((v) => v.view.stimulusVisible).map((v) => v.view.trial);
    assert.deepEqual(starts, [0, 1, 2]);
    // By 4000 ms exactly, trials 0 and 1 are over and trial 2 has begun, however the timers ran.
    assert.equal(runner.evaluated.length, 2);
    assert.equal(runner.clock.elapsedAt(host.time), 4000);
  });

  it("runs every due event in order when it wakes up very late", () => {
    const { host, runner, views, evaluations } = setup(quiet(5));
    runner.start();
    host.jump(7300);
    assert.equal(evaluations.length, 3, "trials 0, 1 and 2 closed");
    assert.deepEqual(evaluations.map((e) => e.evaluation.index), [0, 1, 2]);
    // Trial 3 began at 6000 and its stimulus went out at 6500: both happened, in that order, before the wake-up at 7300.
    assert.deepEqual(views.slice(-2).map((v) => [v.at, v.view.trial, v.view.stimulusVisible]), [[7300, 3, true], [7300, 3, false]]);
  });
});

describe("responses", () => {
  it("attributes a response to the trial its timestamp falls in", () => {
    const { host, runner } = setup(quiet(5));
    runner.start();
    host.advanceTo(TRIAL - 1);
    assert.equal(runner.respond("position"), "recorded");
    assert.equal(runner.maskOf(0), bit);
    host.advanceTo(TRIAL + 1);
    assert.equal(runner.respond("position"), "recorded");
    assert.equal(runner.maskOf(1), bit);
    assert.deepEqual(runner.responseLog.map((r) => [r.trial, r.offsetMs]), [[0, TRIAL - 1], [1, 1]]);
  });

  it("uses the input event's own time when the handler runs late, so it counts for the trial it was made in", () => {
    const { host, runner, evaluations } = setup(quiet(5));
    runner.start();
    host.advanceTo(2 * TRIAL - 50);
    // The thread stalls across the end of trial 1; the key press was made 30 ms before its window closed.
    host.time = 2 * TRIAL + 40;
    assert.equal(runner.respond("position", 2 * TRIAL - 30), "recorded");
    assert.equal(runner.maskOf(1), bit, "trial 1 gets it");
    assert.equal(runner.maskOf(2), 0);
    host.advanceTo(2 * TRIAL + 41);
    assert.equal(evaluations[1].evaluation.results.position?.outcome, "falseAlarm", "the press was counted when the window closed");
  });

  it("does not count a late response for the trial that already closed, nor move it to the next", () => {
    const { host, runner, evaluations } = setup(quiet(5));
    runner.start();
    host.advanceTo(TRIAL + 10);
    assert.equal(evaluations.length, 1);
    // Its timestamp is inside trial 0, but trial 0 has been evaluated: refused.
    assert.equal(runner.respond("position", TRIAL - 5), "late");
    assert.equal(runner.maskOf(0), 0);
    assert.equal(runner.maskOf(1), 0, "and it did not become a press in trial 1");
    assert.equal(runner.evaluated[0].error, false, "the evaluation was not changed after the fact");
  });

  it("takes one response per stream per trial: a repeat or a key repeat is ignored", () => {
    const { host, runner } = setup(quiet(5));
    runner.start();
    host.advanceTo(300);
    assert.equal(runner.respond("position"), "recorded");
    for (let i = 0; i < 5; i++) {
      host.advance(30);
      assert.equal(runner.respond("position"), "duplicate");
    }
    assert.equal(runner.maskOf(0), bit);
    assert.equal(runner.responseLog.length, 1);
    host.advanceTo(TRIAL + 100);
    assert.equal(runner.respond("position"), "recorded", "the next trial takes a fresh one");
  });

  it("ignores streams that are off, and presses before the start or after the end", () => {
    const { host, runner } = setup(quiet(2));
    assert.equal(runner.respond("position"), "ignored", "not started");
    runner.start();
    assert.equal(runner.respond("color"), "ignored", "colour is off");
    host.advanceTo(2 * TRIAL + 10);
    assert.equal(runner.status, "finished");
    assert.equal(runner.respond("position"), "ignored");
  });

  it("falls back to the moment of handling when a timestamp is not from this clock", () => {
    const { host, runner } = setup(quiet(5));
    runner.start();
    host.advanceTo(300);
    assert.equal(runner.respond("position", 1_700_000_000_000), "recorded");
    assert.equal(runner.responseLog[0].trial, 0);
    host.advance(10);
    assert.equal(runner.respond("position", Number.NaN), "duplicate");
  });
});

describe("pausing", () => {
  it("freezes the trial: nothing is lit, no time passes, no response counts, and resuming carries on from the same place", () => {
    const { host, runner, views, evaluations } = setup(quiet(5));
    runner.start();
    host.advanceTo(2000 + 300); // 300 ms into trial 1, stimulus lit
    assert.equal(runner.currentView.stimulusVisible, true);
    runner.pause();
    assert.equal(runner.status, "paused");
    assert.deepEqual(runner.currentView, { trial: 1, stimulusVisible: false }, "hidden while paused");
    assert.equal(host.pending, 0, "no timer runs while paused");
    host.advance(60_000);
    assert.equal(runner.respond("position"), "ignored");
    assert.equal(evaluations.length, 1, "trial 1 did not close while paused");
    runner.resume();
    assert.deepEqual(runner.currentView, { trial: 1, stimulusVisible: true }, "the same trial, 200 ms of stimulus still to come");
    const resumedAt = host.time;
    host.advanceTo(resumedAt + 199);
    assert.equal(runner.currentView.stimulusVisible, true);
    host.advanceTo(resumedAt + 200);
    assert.equal(runner.currentView.stimulusVisible, false);
    assert.equal(evaluations.length, 1);
    host.advanceTo(resumedAt + 1700);
    assert.equal(evaluations.length, 2, "trial 1 closed after its remaining 1700 ms");
    assert.deepEqual(views.filter((v) => v.view.stimulusVisible).map((v) => v.view.trial), [0, 1, 1, 2], "the same sequence, no trial skipped or repeated");
  });

  it("changes nothing about lives, and a press made before the pause still counts", () => {
    const { host, runner } = setup(quiet(6));
    runner.start();
    host.advanceTo(TRIAL + 400);
    assert.equal(runner.respond("position"), "recorded"); // a false alarm in trial 1
    runner.pause();
    host.advance(30_000);
    runner.resume();
    assert.equal(runner.livesRemaining, LIVES, "nothing has been evaluated yet");
    host.advance(TRIAL);
    assert.equal(runner.livesRemaining, LIVES - 1);
    assert.equal(runner.evaluated.length, 2);
  });

  it("is harmless to pause or resume at the wrong time", () => {
    const { host, runner } = setup(quiet(3));
    runner.resume();
    runner.pause();
    assert.equal(runner.status, "idle");
    runner.start();
    runner.resume();
    runner.pause();
    runner.pause();
    runner.resume();
    runner.resume();
    host.advanceTo(3 * TRIAL);
    assert.equal(runner.status, "finished");
  });
});

describe("a session's lives and end", () => {
  it("plays every trial of a perfect session and finishes as completed with all five lives", () => {
    const trials = quiet(6);
    const { host, runner, evaluations, result } = setup(trials);
    runner.start();
    host.advanceTo(6 * TRIAL);
    assert.equal(runner.status, "finished");
    assert.equal(evaluations.length, 6);
    assert.equal(result()?.outcome, "completed");
    assert.equal(result()?.durationMs, 6 * TRIAL);
    assert.equal(result()?.at, 6 * TRIAL);
    assert.deepEqual(result()?.responses, [0, 0, 0, 0, 0, 0]);
    assert.equal(runner.livesRemaining, LIVES);
  });

  it("never costs a life in the first n trials", () => {
    const { host, runner, evaluations } = setup(quiet(6), config({ n: 2 }));
    runner.start();
    for (const t of [0, 1]) {
      host.advanceTo(t * TRIAL + 100);
      runner.respond("position");
    }
    host.advanceTo(2 * TRIAL + 1);
    assert.deepEqual(evaluations.map((e) => [e.evaluation.scoreable, e.lives]), [[false, LIVES], [false, LIVES]]);
  });

  it("loses exactly one life for a trial with an error and none for hits and correct rejections", () => {
    // n = 1: positions 0, 0, 1, 1: trials 1 and 3 are matches.
    const trials = handmade([0, 0, 1, 1, 0], 1);
    const { host, runner, evaluations } = setup(trials);
    runner.start();
    host.advanceTo(TRIAL + 100);
    runner.respond("position"); // trial 1 is a match: a hit
    host.advanceTo(2 * TRIAL + 100); // trial 2 is not a match: correct rejection (no press)
    host.advanceTo(3 * TRIAL + 100); // trial 3 is a match and is missed
    host.advanceTo(5 * TRIAL + 1);
    assert.deepEqual(evaluations.map((e) => e.lives), [LIVES, LIVES, LIVES, LIVES - 1, LIVES - 1]);
    assert.equal(runner.livesRemaining, LIVES - 1);
  });

  it("ends the moment the fifth life is lost: the remaining trials are not run, nothing is lit, no timer is left", () => {
    const { host, runner, evaluations, views, result } = setup(quiet(20));
    runner.start();
    // False alarm in every trial after the first.
    for (let t = 1; t < 20 && runner.status === "running"; t++) {
      host.advanceTo(t * TRIAL + 100);
      runner.respond("position");
      host.advanceTo((t + 1) * TRIAL);
    }
    assert.equal(runner.status, "finished");
    assert.equal(result()?.outcome, "gameover");
    assert.equal(evaluations.length, 6, "trial 1 free, then five lives lost");
    assert.deepEqual(evaluations.map((e) => e.lives), [5, 4, 3, 2, 1, 0]);
    assert.equal(result()?.at, 6 * TRIAL, "stopped right after that trial was evaluated");
    assert.equal(result()?.responses.length, 6);
    assert.equal(host.pending, 0);
    const seen = views.length;
    host.advance(10 * TRIAL);
    assert.equal(views.length, seen, "nothing more happens");
    assert.equal(runner.respond("position"), "ignored");
    assert.equal(runner.currentView.stimulusVisible, false);
  });

  it("costs only one life when several streams are wrong in the same trial", () => {
    const t = (position: number, color: number, letter: number, matches: boolean): Trial => ({ values: { position, color, letter }, matches: { position: matches, color: matches, letter: matches } });
    const trials = [t(0, 0, 0, false), t(1, 1, 1, false), t(0, 0, 0, false)];
    const { host, runner, evaluations } = setup(trials, config({ streams: { position: true, color: true, letter: true } }));
    runner.start();
    host.advanceTo(TRIAL + 100);
    for (const s of ["position", "color", "letter"] as const) runner.respond(s);
    host.advanceTo(2 * TRIAL + 1);
    assert.equal(Object.values(evaluations[1].evaluation.results).filter((r) => !r.correct).length, 3);
    assert.equal(evaluations[1].lives, LIVES - 1);
  });

  it("evaluates each trial once, however the clock moves", () => {
    const { host, runner, evaluations } = setup(quiet(4));
    runner.start();
    host.jump(2 * TRIAL + 10);
    host.jump(2 * TRIAL + 20);
    runner.pause();
    runner.resume();
    host.advanceTo(4 * TRIAL);
    assert.deepEqual(evaluations.map((e) => e.evaluation.index), [0, 1, 2, 3]);
  });
});

describe("finishing an unlimited session", () => {
  const long = (length: number) => quiet(length);

  it("is refused until ten trials have been scored, then ends as completed with the trials that closed", () => {
    const { host, runner, evaluations, result } = setup(long(50)); // n = 1: trial 0 is not scored
    runner.start();
    host.advanceTo(10 * TRIAL + 100); // ten trials closed: nine scored
    assert.equal(runner.scoredTrials, 9);
    assert.equal(runner.finishEarly(), false);
    assert.equal(runner.status, "running");
    host.advanceTo(11 * TRIAL + 700); // eleven closed (ten scored), the twelfth is under way
    assert.equal(runner.scoredTrials, 10);
    assert.equal(runner.finishEarly(), true);
    assert.equal(runner.status, "finished");
    assert.equal(result()?.outcome, "completed");
    assert.equal(result()?.responses.length, 11, "the trial in progress is dropped");
    assert.equal(result()?.durationMs, 11 * TRIAL);
    assert.equal(evaluations.length, 11);
    assert.equal(host.pending, 0);
    host.advance(10 * TRIAL);
    assert.equal(evaluations.length, 11, "nothing more happens");
  });

  it("works while paused, and leaves lives as they were", () => {
    const { host, runner, result } = setup(long(50));
    runner.start();
    host.advanceTo(12 * TRIAL + 300);
    runner.pause();
    assert.equal(runner.finishEarly(), true);
    assert.equal(result()?.responses.length, 12);
    assert.equal(runner.livesRemaining, LIVES);
  });

  it("does nothing once the session is over or quit", () => {
    const a = setup(long(50));
    a.runner.start();
    a.runner.quit();
    assert.equal(a.runner.finishEarly(), false);
    assert.equal(a.result(), null);
  });
});

describe("quitting", () => {
  it("stops quietly: no result, no more events, no timers", () => {
    const { host, runner, views, evaluations, result } = setup(quiet(5));
    runner.start();
    host.advanceTo(TRIAL + 100);
    const seen = views.length;
    runner.quit();
    assert.equal(runner.status, "quit");
    assert.equal(host.pending, 0);
    host.advance(20 * TRIAL);
    assert.equal(result(), null, "a quit session never reports a result, so nothing can save or reward it");
    assert.equal(evaluations.length, 1);
    assert.ok(views.length <= seen + 1);
    assert.equal(runner.respond("position"), "ignored");
  });
});
