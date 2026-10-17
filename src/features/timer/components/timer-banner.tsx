"use client";

import { Button } from "@/components/ui/button";
import { ALERT_MS } from "@/features/timer/lib/types";

/**
 * "Time's up, quit?" It is announced once (the only live region of the timer), never takes focus, and never changes what is
 * on the screen underneath: the question or board keeps working. After 15 seconds it removes itself and the badge remains.
 */
export function TimerBanner({ leftMs, onQuit }: { leftMs: number; onQuit: () => void }) {
  const seconds = Math.max(0, Math.ceil(leftMs / 1000));
  return (
    <div className="w-64 overflow-hidden rounded-xl border border-warning bg-popover text-popover-foreground shadow-pop">
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p role="alert" className="text-sm font-medium">
            Time&apos;s up, quit?
          </p>
          <p aria-hidden className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            Closing in {seconds}s
          </p>
        </div>
        <Button type="button" size="sm" onClick={onQuit}>
          Quit
        </Button>
      </div>
      <div aria-hidden className="h-1 bg-secondary">
        <div className="h-full bg-warning transition-[width] duration-300 ease-linear motion-reduce:transition-none" style={{ width: `${Math.min(100, (leftMs / ALERT_MS) * 100)}%` }} />
      </div>
    </div>
  );
}

/** What stays after the banner has gone: tapping it quits. */
export function TimeUpBadge({ onQuit }: { onQuit: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuit}
      aria-label="Time's up. Quit and go home."
      className="whitespace-nowrap rounded-full border border-warning bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2"
    >
      Time&apos;s up
    </button>
  );
}
