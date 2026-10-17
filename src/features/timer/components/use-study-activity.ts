"use client";

import { useEffect, useRef } from "react";
import type { ActivityHandle } from "@/features/timer/lib/controller";
import { studyTimer } from "@/features/timer/lib/store";

export interface StudyActivityOptions {
  /** True from the moment the session, puzzle or game starts until it has fully ended. Becoming false (or unmounting) is the "ended" report. */
  active: boolean;
  /** No natural end (endless practice, 2048): the study timer waits at most 3 minutes after expiry. */
  endless?: boolean;
  /** A paused session or puzzle is a safe point: the study timer may alert. */
  paused?: boolean;
  /** The sound setting of this area, so the alert is silent where the user has muted. Omit for areas without sound. */
  soundOn?: () => boolean;
  /** Saves and ends whatever is unfinished, so the timer's Quit loses nothing. May be async. */
  flush?: () => Promise<void> | void;
}

/**
 * How a screen tells the study timer it is in the middle of something. While `active`, an expiring timer waits (or, for
 * endless activities, waits up to 3 minutes) instead of interrupting; the alert comes the moment `active` turns false.
 * Leaving the screen counts as ending it. It does nothing when no timer is running.
 */
export function useStudyActivity({ active, endless = false, paused = false, soundOn, flush }: StudyActivityOptions): void {
  const latest = useRef({ endless, paused, soundOn, flush });
  const handle = useRef<ActivityHandle | null>(null);

  useEffect(() => {
    latest.current = { endless, paused, soundOn, flush };
    handle.current?.update({ endless, paused });
  });

  useEffect(() => {
    if (!active) return;
    const now = latest.current;
    const registration = studyTimer().registerActivity(
      { endless: now.endless, paused: now.paused },
      {
        soundOn: now.soundOn ? () => latest.current.soundOn?.() ?? true : undefined,
        flush: () => latest.current.flush?.(),
      }
    );
    handle.current = registration;
    return () => {
      handle.current = null;
      registration.release();
    };
  }, [active]);
}
