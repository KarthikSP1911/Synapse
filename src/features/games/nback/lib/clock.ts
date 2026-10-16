/**
 * The trial clock: pure arithmetic, no timers. Time is counted in "active" milliseconds, which stop while the
 * session is paused, so a pause can neither shorten nor lengthen a trial. Everything the game needs to know about a
 * moment (which trial it belongs to, whether the stimulus is lit) is worked out from a timestamp, never from
 * which timer happened to fire last, so a late timer cannot misplace a response.
 */

export class TrialClock {
  private origin: number | null = null;
  /** Finished pauses as [start, end) in host time, then the open one if paused. */
  private pauses: [number, number][] = [];
  private pausedAt: number | null = null;

  constructor(
    readonly trialMs: number,
    readonly stimulusMs: number,
    readonly trials: number
  ) {}

  get started(): boolean {
    return this.origin !== null;
  }
  get paused(): boolean {
    return this.pausedAt !== null;
  }
  /** Active time of the whole session. */
  get totalMs(): number {
    return this.trials * this.trialMs;
  }

  start(now: number): void {
    this.origin = now;
    this.pauses = [];
    this.pausedAt = null;
  }

  pause(now: number): void {
    if (this.origin !== null && this.pausedAt === null) this.pausedAt = now;
  }

  resume(now: number): void {
    if (this.pausedAt === null) return;
    this.pauses.push([this.pausedAt, Math.max(this.pausedAt, now)]);
    this.pausedAt = null;
  }

  /**
   * Active milliseconds at host time `at`, or null when the session had not started or `at` falls inside a pause
   * (nothing counts while paused, including a key press that arrives during it).
   */
  elapsedAt(at: number): number | null {
    if (this.origin === null || at < this.origin) return null;
    if (this.pausedAt !== null && at >= this.pausedAt) return null;
    let paused = 0;
    for (const [from, to] of this.pauses) {
      if (at >= to) paused += to - from;
      else if (at >= from) return null;
    }
    return at - this.origin - paused;
  }

  /** The trial an active time belongs to (its window is `[i * trialMs, (i + 1) * trialMs)`), or null outside the session. */
  trialAt(elapsed: number): number | null {
    if (elapsed < 0 || elapsed >= this.totalMs) return null;
    return Math.floor(elapsed / this.trialMs);
  }

  /** Whether the stimulus of the trial that `elapsed` falls in is lit at that moment. */
  stimulusVisibleAt(elapsed: number): boolean {
    return this.trialAt(elapsed) !== null && elapsed % this.trialMs < this.stimulusMs;
  }

  /** Host time at which an active time is reached, assuming no further pauses; null until started or while paused. */
  hostTimeOf(elapsed: number): number | null {
    if (this.origin === null || this.pausedAt !== null) return null;
    return this.origin + this.pauses.reduce((sum, [from, to]) => sum + (to - from), 0) + elapsed;
  }
}
