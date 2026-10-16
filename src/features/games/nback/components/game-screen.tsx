"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { usePlayFocus } from "@/components/layout/use-play-focus";
import { Board } from "@/features/games/nback/components/board";
import { Lives } from "@/features/games/nback/components/lives";
import { ResponseBar } from "@/features/games/nback/components/response-bar";
import { useNBackSession } from "@/features/games/nback/components/use-nback-session";
import { activeStreams, streamMode } from "@/features/games/nback/lib/config";
import { STREAM_KEY, streamForKey } from "@/features/games/nback/lib/keys";
import type { RunnerResult } from "@/features/games/nback/lib/runner";
import { stimulusFor } from "@/features/games/nback/lib/stimuli";
import { LIVES, MODE_LABEL, type NBackConfig } from "@/features/games/nback/lib/types";

const clock = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * The play screen: board, hearts, trial counter and the response buttons. On phones it takes the whole screen (the
 * header and tab bar are hidden, see `usePlayFocus`). The screen only shows what the runner reports and forwards
 * presses to it; pausing, quitting and the keyboard are handled here, scoring is not.
 */
export function GameScreen({ config, seed, onFinish, onQuit }: { config: NBackConfig; seed: number; onFinish: (result: RunnerResult) => void; onQuit: () => void }) {
  usePlayFocus(true);
  const session = useNBackSession({ config, seed, onFinish });
  const { stage, paused, count, view, trial, lives, flash, evaluated, pressedMask, feedback, elapsedMs, pause, resume, respond } = session;
  const [confirmQuit, setConfirmQuit] = useState(false);
  const pausedBeforeQuit = useRef(false);

  const openQuit = useCallback(() => {
    pausedBeforeQuit.current = paused;
    pause();
    setConfirmQuit(true);
  }, [paused, pause]);

  const closeQuit = useCallback(() => {
    setConfirmQuit(false);
    if (!pausedBeforeQuit.current) resume();
  }, [resume]);

  // Reloading or closing the tab mid-session would lose it.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Keyboard: A, S and L mark a match (their default actions are cancelled for the whole session), Esc or P pauses.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const stream = streamForKey(event.key);
      if (stream) {
        event.preventDefault();
        // Holding a key repeats it; only the press counts.
        if (event.repeat || confirmQuit || paused || !config.streams[stream]) return;
        respond(stream, event.timeStamp);
        return;
      }
      if (confirmQuit || stage === "finished") return;
      if (event.key === "Escape" || event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (event.repeat) return;
        if (paused) resume();
        else pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config.streams, confirmQuit, paused, stage, pause, resume, respond]);

  const lit = stage === "running" && !paused && view.stimulusVisible && trial !== null;
  const stimulus = trial ? stimulusFor(trial, config) : null;
  const shown = Math.min(config.trials, Math.max(1, view.trial !== null ? view.trial + 1 : evaluated + 1));
  const warmup = stage === "running" && view.trial !== null && view.trial < config.n;
  const mode = MODE_LABEL[streamMode(config)];
  const streamNames = activeStreams(config).map((s) => s[0].toUpperCase() + s.slice(1)).join(" + ");

  return (
    <div className="container play-screen nb-screen flex flex-col py-3 sm:py-4">
      <div className="play-landscape mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={openQuit}>
            <X /> Quit
          </Button>
          <div className="min-w-0 text-center leading-tight">
            <p className="truncate text-sm font-semibold">
              {mode} · n = {config.n}
            </p>
            <p className="truncate text-xs text-muted-foreground">{streamNames}</p>
          </div>
          <Button variant="outline" size="sm" onClick={paused ? resume : pause} disabled={stage === "finished" || confirmQuit} aria-keyshortcuts="Escape P">
            {paused ? <Play /> : <Pause />} {paused ? "Resume" : "Pause"}
          </Button>
        </div>

        <div className="play-panel flex min-h-0 flex-1 flex-col gap-3">
          <div className="play-stage min-h-0 flex-1">
            <div className="play-square relative">
              <Board grid={config.grid} stimulus={stimulus} empty={!lit} />

              {stage === "countdown" && !paused && (
                <div className="nb-overlay" aria-live="polite">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Get ready</p>
                  <p key={count} className="animate-pop font-mono text-7xl font-semibold tabular-nums">
                    {count}
                  </p>
                </div>
              )}

              {paused && !confirmQuit && (
                <div className="nb-overlay" role="dialog" aria-label="Paused">
                  <p className="text-lg font-semibold">Paused</p>
                  <p className="max-w-[16rem] text-center text-xs text-muted-foreground">The board is hidden and the clock is stopped. Nothing changes when you come back.</p>
                  <Button size="lg" onClick={resume} autoFocus>
                    <Play /> Resume
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <span className="font-mono font-semibold tabular-nums">
                Trial {shown}/{config.trials}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{clock(elapsedMs)}</span>
              {warmup && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Not scored</span>}
            </p>
            <Lives lives={lives} flash={flash} />
          </div>

          <ResponseBar streams={config.streams} pressedMask={pressedMask} feedback={feedback} disabled={paused} onRespond={(stream, at) => respond(stream, at)} />

          <p className={cn("shrink-0 text-center text-xs text-muted-foreground", "hidden sm:block pointer-coarse:hidden")}>
            {activeStreams(config).map((s) => `${STREAM_KEY[s]} = ${s}`).join(" · ")} · Esc pauses
          </p>
          <p className="shrink-0 text-center text-xs text-muted-foreground sm:hidden pointer-coarse:block">Tap when it matches the one from {config.n} back.</p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {lives < LIVES ? `${lives} ${lives === 1 ? "life" : "lives"} left.` : ""}
        {feedback ? ` ${activeStreams(config).map((s) => `${s} ${feedback.results[s]?.correct ? "correct" : "wrong"}`).join(", ")}.` : ""}
      </p>

      {confirmQuit && (
        <ConfirmDialog
          title="Quit this session?"
          message="The session is not saved and earns no coins."
          confirmLabel="Quit session"
          destructive
          onConfirm={() => {
            setConfirmQuit(false);
            onQuit();
          }}
          onCancel={closeQuit}
        />
      )}
    </div>
  );
}
