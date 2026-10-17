"use client";

import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimerSnapshot } from "@/features/timer/components/use-timer-state";
import { useWidgetPrefs } from "@/features/timer/components/use-widget-prefs";

/**
 * Where the floating timer goes when it is hidden from its options menu: a small stopwatch next to the theme toggle. The timer
 * keeps running (or stays unstarted); tapping the icon brings the widget back. It is only there while the widget is hidden and the
 * timer has not yet alerted (at the alert the widget returns by itself so the banner can be seen).
 */
export function TimerHeaderButton() {
  const snapshot = useTimerSnapshot();
  const [prefs, update] = useWidgetPrefs();
  // The widget comes back by itself at the alert, so the icon is only for a hidden timer that has not alerted, or none at all.
  if (!prefs.hidden || (snapshot.timer && snapshot.timer.alertedAt !== null)) return null;

  return (
    <Button variant="ghost" size="icon" aria-label={snapshot.timer ? "Study timer is running. Show it." : "Show the study timer"} title="Show the study timer" onClick={() => update({ ...prefs, hidden: false })}>
      <Timer className="size-4" aria-hidden />
    </Button>
  );
}
