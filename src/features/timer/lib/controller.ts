import { OFF, nextDeadline, step } from "./machine";
import { ALERT_MS, ALERT_REPEAT_MS, type ActivityInfo, type MachineState, type TimerEvent, type TimerRecord } from "./types";

/** The clock and timers the controller runs on. The browser's in production, a hand-moved one in tests (as in the N-Back runner). */
export interface TimerHost {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/** Where the timer is kept between page loads and shared between tabs. */
export interface TimerBackend {
  load(viewer: string, now: number): TimerRecord | null;
  save(viewer: string, timer: TimerRecord | null): void;
}

export interface ActivityExtras {
  /** The sound setting of the area the activity belongs to; read when the alert fires. */
  soundOn?: () => boolean;
  /** Saves and ends whatever is unfinished, so Quit loses nothing. */
  flush?: () => Promise<void> | void;
}

export interface Snapshot {
  timer: TimerRecord | null;
  activity: ActivityInfo | null;
}

export interface ActivityHandle {
  update(info: ActivityInfo): void;
  release(): void;
}

/** Longest delay a browser timeout accepts. */
const MAX_DELAY_MS = 2 ** 31 - 1;

const sameTimer = (a: TimerRecord | null, b: TimerRecord | null) => a === b || (!!a && !!b && a.endsAt === b.endsAt && a.alertedAt === b.alertedAt);
const sameActivity = (a: ActivityInfo | null, b: ActivityInfo | null) => a === b || (!!a && !!b && a.endless === b.endless && a.paused === b.paused);

/**
 * Runs the state machine against a clock, keeps the result on the device and tells subscribers. It sleeps until the next
 * moment the state can change instead of polling, and asks the machine again whenever the page wakes up (a background tab's
 * timers are throttled, but the absolute end time is not).
 */
export class StudyTimerController {
  private state: MachineState = OFF;
  private snapshot: Snapshot = { timer: null, activity: null };
  private viewer: string | null = null;
  private listeners = new Set<() => void>();
  private wakeTimer: unknown = null;
  private repeatTimer: unknown = null;
  private registrations = new Map<number, { info: ActivityInfo; extras: ActivityExtras }>();
  private nextToken = 1;
  private departing: ActivityExtras | null = null;

  constructor(
    private readonly host: TimerHost,
    private readonly backend: TimerBackend,
    private readonly onAlert: (soundOn: boolean | null) => void
  ) {}

  // ---- Reading ------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  // ---- Who is using the device ---------------------------------------------

  /** `guest`, `user:<id>`, or null when nobody is signed in. A timer saved by someone else is ignored. */
  setViewer(viewer: string | null): void {
    if (viewer === this.viewer) return;
    this.viewer = viewer;
    this.reload();
  }

  /** Reads the saved timer again (page load, or another tab changed it). */
  reload(): void {
    const timer = this.viewer ? this.backend.load(this.viewer, this.host.now()) : null;
    this.dispatch({ kind: "load", timer }, false);
  }

  /** The page came back to the front or was restored: time may have passed with no timer firing. */
  wake(): void {
    this.dispatch({ kind: "tick" });
  }

  // ---- Commands ------------------------------------------------------------

  start(minutes: number): void {
    if (this.viewer) this.dispatch({ kind: "start", minutes });
  }

  extend(): void {
    this.dispatch({ kind: "extend" });
  }

  stop(): void {
    this.dispatch({ kind: "stop" });
  }

  /** Quit: save and end whatever is unfinished (the caller then navigates home), and clear the timer. */
  async quit(): Promise<void> {
    for (const { extras } of [...this.registrations.values()]) {
      try {
        await extras.flush?.();
      } catch {
        // A failed save must not trap the user on the screen; the activity keeps its own copy.
      }
    }
    this.stop();
  }

  // ---- Activity ------------------------------------------------------------

  registerActivity(info: ActivityInfo, extras: ActivityExtras = {}): ActivityHandle {
    const token = this.nextToken++;
    this.registrations.set(token, { info, extras });
    this.syncActivity();
    return {
      update: (next) => {
        const entry = this.registrations.get(token);
        if (!entry || sameActivity(entry.info, next)) return;
        entry.info = next;
        this.syncActivity();
      },
      release: () => {
        const entry = this.registrations.get(token);
        if (!entry) return;
        this.registrations.delete(token);
        // The alert that this very release triggers belongs to the area just left, so its sound setting still applies.
        this.departing = entry.extras;
        this.syncActivity();
        this.departing = null;
      },
    };
  }

  private syncActivity(): void {
    const all = [...this.registrations.values()];
    const activity: ActivityInfo | null = all.length === 0 ? null : { endless: all.every((r) => r.info.endless), paused: all.every((r) => r.info.paused) };
    this.dispatch({ kind: "activity", activity }, false);
  }

  private soundSetting(): boolean | null {
    if (this.departing?.soundOn) return this.departing.soundOn();
    const all = [...this.registrations.values()];
    for (let i = all.length - 1; i >= 0; i--) {
      const read = all[i].extras.soundOn;
      if (read) return read();
    }
    return null;
  }

  // ---- Core ------------------------------------------------------------

  private dispatch(event: TimerEvent, persist = true): void {
    const now = this.host.now();
    const before = this.state;
    const result = step(before, event, now);
    let state = result.state;
    let alert = result.effects.some((e) => e.kind === "alert");

    // Two tabs wake at the same moment: the first to save owns the alert, the other adopts it silently.
    if (alert && this.viewer) {
      const saved = this.backend.load(this.viewer, now);
      if (saved && state.timer && saved.endsAt === state.timer.endsAt && saved.alertedAt !== null) {
        state = { ...state, timer: saved };
        alert = false;
      }
    }

    this.state = state;
    if (persist || alert) {
      if (this.viewer && !sameTimer(before.timer, state.timer)) this.backend.save(this.viewer, state.timer);
    }
    if (!sameTimer(before.timer, state.timer) || !sameActivity(before.activity, state.activity)) {
      this.snapshot = { timer: state.timer, activity: state.activity };
      for (const listener of [...this.listeners]) listener();
    }
    if (alert && state.timer) {
      // The sound setting is read now: the area that was open may be gone by the time of the repeats.
      const sound = this.soundSetting();
      this.onAlert(sound);
      this.repeatWhileBannerShows(state.timer.endsAt, sound);
    }
    // A stopped timer, or one that has not alerted, has nothing to repeat.
    if (!state.timer || state.timer.alertedAt === null) this.stopRepeating();
    this.schedule();
  }

  /** The beep repeats every couple of seconds for as long as the banner is up, in the tab that raised the alert. */
  private repeatWhileBannerShows(endsAt: number, sound: boolean | null): void {
    this.stopRepeating();
    const again = () => {
      this.repeatTimer = null;
      const timer = this.state.timer;
      if (!timer || timer.endsAt !== endsAt || timer.alertedAt === null || this.host.now() >= timer.alertedAt + ALERT_MS) return;
      this.onAlert(sound);
      this.repeatTimer = this.host.setTimeout(again, ALERT_REPEAT_MS);
    };
    this.repeatTimer = this.host.setTimeout(again, ALERT_REPEAT_MS);
  }

  private stopRepeating(): void {
    if (this.repeatTimer === null) return;
    this.host.clearTimeout(this.repeatTimer);
    this.repeatTimer = null;
  }

  private schedule(): void {
    if (this.wakeTimer !== null) {
      this.host.clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    const now = this.host.now();
    const at = nextDeadline(this.state, now);
    if (at === null) return;
    this.wakeTimer = this.host.setTimeout(() => {
      this.wakeTimer = null;
      this.dispatch({ kind: "tick" });
    }, Math.min(MAX_DELAY_MS, Math.max(0, at - now)));
  }
}
