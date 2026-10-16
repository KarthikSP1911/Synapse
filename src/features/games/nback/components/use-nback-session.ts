"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateSequence, paramsFromConfig } from "@/features/games/nback/lib/generator";
import { SessionRunner, browserHost, type ResponseStatus, type RunnerResult, type TrialView } from "@/features/games/nback/lib/runner";
import { LIVES, STREAM_BIT, type NBackConfig, type StreamId, type TrialEvaluation } from "@/features/games/nback/lib/types";

/**
 * Connects a `SessionRunner` to React. The runner owns the schedule and the scoring; this hook only copies what it
 * reports into state for the screen, runs the 3-2-1 countdown, and pauses when the tab is hidden. Nothing in here
 * decides a result: lives, feedback and the outcome all come from the runner's own events.
 */

export const COUNTDOWN_FROM = 3;

export type Stage = "countdown" | "running" | "finished";

export interface FeedbackMark {
  trial: number;
  results: TrialEvaluation["results"];
}

export function useNBackSession({ config, seed, onFinish }: { config: NBackConfig; seed: number; onFinish: (result: RunnerResult) => void }) {
  const trials = useMemo(() => generateSequence(paramsFromConfig(config, seed)), [config, seed]);
  const [stage, setStage] = useState<Stage>("countdown");
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<TrialView>({ trial: null, stimulusVisible: false });
  const [lives, setLives] = useState(LIVES);
  /** Index of the heart that emptied last, so it can flash once. */
  const [flash, setFlash] = useState<number | null>(null);
  const [evaluated, setEvaluated] = useState(0);
  const [pressed, setPressed] = useState({ trial: -1, mask: 0 });
  const [feedback, setFeedback] = useState<FeedbackMark | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const runnerRef = useRef<SessionRunner | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<Stage>("countdown");
  const beginRef = useRef<() => void>(() => undefined);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const changeStage = useCallback((next: Stage) => {
    stageRef.current = next;
    setStage(next);
  }, []);

  useEffect(() => {
    const clearCountdown = () => {
      if (countdownTimer.current !== null) clearTimeout(countdownTimer.current);
      countdownTimer.current = null;
    };

    const launch = () => {
      const runner = new SessionRunner(config, trials, browserHost, {
        onView: (next) => {
          setView(next);
          // The marks from the last trial go once the next stimulus has gone, so they never sit over a stimulus being learned.
          setFeedback((f) => (f && next.trial !== null && next.trial > f.trial && !next.stimulusVisible ? null : f));
        },
        onResponse: ({ trial, stream }) => setPressed((p) => ({ trial, mask: (p.trial === trial ? p.mask : 0) | STREAM_BIT[stream] })),
        onEvaluated: (evaluation, remaining) => {
          setEvaluated(evaluation.index + 1);
          setLives(remaining);
          if (evaluation.error) setFlash(remaining);
          if (config.feedback && evaluation.scoreable) setFeedback({ trial: evaluation.index, results: evaluation.results });
        },
        onFinish: (result) => {
          changeStage("finished");
          onFinishRef.current(result);
        },
      });
      runnerRef.current = runner;
      changeStage("running");
      runner.start();
    };

    const begin = () => {
      clearCountdown();
      changeStage("countdown");
      const tick = (remaining: number) => {
        setCount(remaining);
        countdownTimer.current = setTimeout(() => (remaining > 1 ? tick(remaining - 1) : launch()), 1000);
      };
      tick(COUNTDOWN_FROM);
    };
    beginRef.current = begin;
    begin();

    return () => {
      clearCountdown();
      runnerRef.current?.quit();
      runnerRef.current = null;
    };
  }, [config, trials, changeStage]);

  // The clock readout. It is display only; the runner keeps the real time.
  useEffect(() => {
    if (stage !== "running" || paused) return;
    const timer = setInterval(() => {
      const runner = runnerRef.current;
      const elapsed = runner ? runner.clock.elapsedAt(performance.now()) : null;
      if (runner && elapsed !== null) setElapsedMs(Math.min(runner.clock.totalMs, elapsed));
    }, 250);
    return () => clearInterval(timer);
  }, [stage, paused]);

  const pause = useCallback(() => {
    if (stageRef.current === "finished") return;
    if (stageRef.current === "countdown") {
      if (countdownTimer.current !== null) clearTimeout(countdownTimer.current);
      countdownTimer.current = null;
    } else runnerRef.current?.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (stageRef.current === "finished") return;
    setPaused(false);
    if (stageRef.current === "countdown") beginRef.current();
    else runnerRef.current?.resume();
  }, []);

  // A hidden tab cannot be trusted with the timing, and the player would miss trials: stop the clock and wait for them.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  /** Ends an unlimited session with what has been played so far. False if too little has been scored yet. */
  const finishNow = useCallback((): boolean => runnerRef.current?.finishEarly() ?? false, []);

  const respond = useCallback((stream: StreamId, timestamp?: number): ResponseStatus => runnerRef.current?.respond(stream, timestamp) ?? "ignored", []);

  const currentTrial = view.trial !== null ? trials[view.trial] : null;
  return {
    trials,
    stage,
    count,
    paused,
    view,
    trial: currentTrial,
    lives,
    flash,
    evaluated,
    /** The streams already marked in the trial on screen. */
    pressedMask: view.trial !== null && pressed.trial === view.trial ? pressed.mask : 0,
    feedback,
    elapsedMs,
    pause,
    resume,
    respond,
    finishNow,
  };
}
