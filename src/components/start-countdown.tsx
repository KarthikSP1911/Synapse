"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startAfterCountdown, type CountdownStep } from "@/lib/practice-countdown";
import { COUNTDOWN_FROM } from "@/lib/mindsprint/timeline";
import type { SoundPlayer } from "@/lib/mindsprint/sound";

interface StartCountdownProps {
  sound: SoundPlayer;
  soundOn: boolean;
  onSoundChange: (next: boolean) => void;
  /** Called once, when "GO" has been shown. This is when the session is created. */
  onComplete: () => void;
  /** Called when the player leaves before the countdown ends. Nothing has been created by then. */
  onCancel: () => void;
}

type Shown = Extract<CountdownStep, { kind: "count" | "go" }>;

/**
 * The 3, 2, 1, GO that comes before the first question of a practice session. It is the same schedule and look
 * as the MindSprint countdown. `onComplete` only fires after "GO", so leaving, pressing Escape or switching tabs
 * before that creates nothing.
 */
export function StartCountdown({ sound, soundOn, onSoundChange, onComplete, onCancel }: StartCountdownProps) {
  const [shown, setShown] = useState<Shown>({ kind: "count", value: COUNTDOWN_FROM });
  const [interrupted, setInterrupted] = useState(false);
  /** True once "GO" has been shown and the session is being created: leaving is no longer offered. */
  const [finished, setFinished] = useState(false);
  /** Bumped by "Restart" to run the countdown again. */
  const [run, setRun] = useState(0);

  const cancelRef = useRef<(() => void) | null>(null);
  /** Set once the countdown has handed over to the session; from then on it can no longer be cancelled. */
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onCancelRef.current = onCancel;
  }, [onComplete, onCancel]);

  useEffect(() => {
    doneRef.current = false;
    const cancel = startAfterCountdown(
      (step) => {
        if (step.kind === "count") {
          setShown(step);
          sound.play("tick");
        } else if (step.kind === "go") {
          setShown(step);
          sound.play("go");
        } else {
          doneRef.current = true;
          setFinished(true);
        }
      },
      () => onCompleteRef.current()
    );
    cancelRef.current = cancel;
    return cancel;
  }, [run, sound]);

  // A hidden tab cannot be trusted to keep the timing: stop, and offer a restart.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden || doneRef.current) return;
      cancelRef.current?.();
      setInterrupted(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !doneRef.current) onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const restart = useCallback(() => {
    // A tap, so audio can be unlocked again if the browser suspended it while the tab was hidden.
    sound.unlock();
    setShown({ kind: "count", value: COUNTDOWN_FROM });
    setInterrupted(false);
    setRun((n) => n + 1);
  }, [sound]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Practice starting" className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <Button variant="ghost" size="sm" onClick={onCancel} className={finished ? "invisible" : undefined} tabIndex={finished ? -1 : undefined}>
          <X /> Cancel
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={soundOn ? "Mute sound" : "Turn sound on"} aria-pressed={soundOn} onClick={() => onSoundChange(!soundOn)}>
          {soundOn ? <Volume2 /> : <VolumeX />}
        </Button>
      </header>

      <p className="sr-only" aria-live="assertive">
        {interrupted ? "Countdown stopped" : shown.kind === "count" ? String(shown.value) : "Go"}
      </p>

      {interrupted ? (
        <div className="grid flex-1 place-items-center px-5">
          <div className="max-w-sm space-y-4 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
              <Eye className="size-5" aria-hidden />
            </span>
            <p className="text-2xl font-semibold tracking-tight">Countdown stopped</p>
            <p className="text-sm text-muted-foreground">You switched away, so the countdown was stopped. Nothing has started yet.</p>
            <div className="flex justify-center gap-2">
              <Button size="lg" onClick={restart} autoFocus>
                Restart countdown
              </Button>
              <Button size="lg" variant="outline" onClick={onCancel}>
                Back
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 text-center">
          {shown.kind === "count" ? (
            <>
              <p className="text-sm text-muted-foreground">Get ready</p>
              <p key={shown.value} className="animate-pop font-mono text-[9rem] font-semibold leading-none tabular-nums sm:text-[12rem]">
                {shown.value}
              </p>
            </>
          ) : (
            <p className="animate-pop rounded-3xl bg-foreground px-10 py-4 font-mono text-7xl font-semibold tracking-tight text-background sm:text-8xl">GO!</p>
          )}
        </div>
      )}
    </div>
  );
}
