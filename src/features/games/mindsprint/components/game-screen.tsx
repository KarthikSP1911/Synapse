"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerKeypad, useTouchKeypad } from "@/components/common/answer-keypad";
import { Button } from "@/components/ui/button";
import { RoundResult } from "@/features/games/mindsprint/components/round-result";
import { displayNumber, displayOperand, parseAnswerText, sanitizeAnswer } from "@/features/games/mindsprint/lib/arithmetic";
import { MAX_RESPONSE_MS } from "@/lib/records";
import { scoreRound, type RoundOutcome } from "@/features/games/mindsprint/lib/scoring";
import type { SoundPlayer } from "@/features/games/mindsprint/lib/sound";
import { COUNTDOWN_FROM, buildTimeline, runTimeline } from "@/features/games/mindsprint/lib/timeline";
import { OPERATION_SYMBOL, type Flash, type GeneratedRound, type PlayedRound, type RoundConfig } from "@/features/games/mindsprint/lib/types";
import type { AnswerFormat } from "@/features/skills/lib/types";

type Phase =
  | { kind: "countdown"; value: number }
  | { kind: "go" }
  | { kind: "flash"; index: number; visible: boolean }
  | { kind: "answer" }
  | { kind: "result"; round: PlayedRound; outcome: RoundOutcome }
  /** The round was stopped before the answer box: the tab was hidden, or the player asked to quit. */
  | { kind: "interrupted"; reason: "hidden" | "quit" };

const SEQUENCE_PHASES: Phase["kind"][] = ["countdown", "go", "flash"];
const keypadFormat = (config: RoundConfig): AnswerFormat => (config.decimals ? { kind: "number" } : config.allowNegative ? { kind: "integer", signed: true } : { kind: "integer" });

function FlashDisplay({ flash, index, visible }: { flash: Flash; index: number; visible: boolean }) {
  const text = flash.op === null ? displayNumber(flash.value) : displayOperand(flash.value);
  const size = text.length <= 4 ? "text-8xl sm:text-9xl" : text.length <= 7 ? "text-7xl sm:text-8xl" : "text-5xl sm:text-7xl";
  return (
    <div className="flex h-44 items-center justify-center sm:h-56" aria-hidden>
      {visible && (
        <div key={index} className="animate-in fade-in zoom-in-95 flex items-center gap-4 font-mono font-semibold tabular-nums duration-100 sm:gap-6">
          {flash.op !== null && <span className="text-6xl text-muted-foreground sm:text-8xl">{OPERATION_SYMBOL[flash.op]}</span>}
          <span className={size}>{text}</span>
        </div>
      )}
    </div>
  );
}

export interface GameScreenProps {
  rounds: GeneratedRound[];
  sound: SoundPlayer;
  soundOn: boolean;
  onSoundChange: (next: boolean) => void;
  /** Called as soon as the last answer is in, so the session is saved even if the player leaves from the result screen. */
  onFinished: (played: PlayedRound[]) => void;
  onSummary: () => void;
  onQuit: () => void;
}

export function GameScreen({ rounds, sound, soundOn, onSoundChange, onFinished, onSummary, onQuit }: GameScreenProps) {
  const touchKeypad = useTouchKeypad();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "countdown", value: COUNTDOWN_FROM });
  const [answer, setAnswer] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [played, setPlayed] = useState<PlayedRound[]>([]);

  const phaseRef = useRef(phase);
  const playedRef = useRef<PlayedRound[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const answerShownAt = useRef(0);
  /** Set from the moment an answer is accepted until the next round starts, so a double press cannot submit twice. */
  const lockedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const round = rounds[index];
  const config = round.config;

  const startRound = useCallback(
    (i: number) => {
      cancelRef.current?.();
      lockedRef.current = false;
      setIndex(i);
      setAnswer("");
      setProblem(null);
      setPhase({ kind: "countdown", value: COUNTDOWN_FROM });
      // Countdown ticks, the start signal, every flash and the answer box all come from one schedule, so sounds and numbers stay in step.
      cancelRef.current = runTimeline(buildTimeline(rounds[i].config), (event) => {
        switch (event.kind) {
          case "count":
            setPhase({ kind: "countdown", value: event.value });
            sound.play("tick");
            break;
          case "go":
            setPhase({ kind: "go" });
            sound.play("go");
            break;
          case "show":
            setPhase({ kind: "flash", index: event.index, visible: true });
            break;
          case "hide":
            setPhase((current) => (current.kind === "flash" && current.index === event.index ? { ...current, visible: false } : current));
            break;
          case "answer":
            answerShownAt.current = performance.now();
            setPhase({ kind: "answer" });
            break;
        }
      });
    },
    [rounds, sound]
  );

  // Begin the first round once mounted; stop every pending timer on the way out.
  useEffect(() => {
    const timer = setTimeout(() => startRound(0), 0);
    return () => {
      clearTimeout(timer);
      cancelRef.current?.();
    };
  }, [startRound]);

  // A hidden tab cannot be trusted to keep the timing, and the player would miss numbers: stop the round and offer a restart.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && SEQUENCE_PHASES.includes(phaseRef.current.kind)) {
        cancelRef.current?.();
        setPhase({ kind: "interrupted", reason: "hidden" });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Closing or reloading the tab mid-session would lose it.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const openQuit = useCallback(() => {
    if (SEQUENCE_PHASES.includes(phaseRef.current.kind)) {
      cancelRef.current?.();
      setPhase({ kind: "interrupted", reason: "quit" });
    }
    setConfirmQuit(true);
  }, []);

  const closeQuit = useCallback(() => {
    setConfirmQuit(false);
    if (phaseRef.current.kind === "interrupted") startRound(index);
  }, [index, startRound]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmQuit) closeQuit();
      else openQuit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmQuit, openQuit, closeQuit]);

  const submit = (skip = false) => {
    if (phaseRef.current.kind !== "answer" || lockedRef.current) return;
    let text: string | null = null;
    if (!skip) {
      // A trailing decimal point ("7.") is harmless, so it is dropped instead of being reported as a mistake.
      const typed = answer.trim().replace(/\.$/, "");
      const parsed = parseAnswerText(typed);
      if (!parsed.ok) {
        setProblem(parsed.reason);
        inputRef.current?.focus();
        return;
      }
      text = typed;
    }
    lockedRef.current = true;
    const responseMs = Math.min(MAX_RESPONSE_MS, Math.max(0, Math.round(performance.now() - answerShownAt.current)));
    const playedRound: PlayedRound = { config, flashes: round.flashes, answer: text, responseMs };
    const outcome = scoreRound(playedRound);
    sound.play(outcome.correct ? "correct" : "wrong");

    const all = [...playedRef.current, playedRound];
    playedRef.current = all;
    setPlayed(all);
    setPhase({ kind: "result", round: playedRound, outcome });
    if (all.length === rounds.length) onFinished(all);
  };

  const next = () => (index + 1 < rounds.length ? startRound(index + 1) : onSummary());

  const toggleSign = () => {
    if (!config.allowNegative) return;
    setAnswer((current) => (current.startsWith("-") ? current.slice(1) : `-${current}`));
    setProblem(null);
  };

  const score = played.reduce((sum, p) => sum + scoreRound(p).points, 0);
  const isLast = index + 1 === rounds.length;
  const showKeypad = touchKeypad && phase.kind === "answer";
  const needsSignButton = config.allowNegative && config.decimals;

  const announcement =
    phase.kind === "countdown"
      ? String(phase.value)
      : phase.kind === "go"
        ? "Go"
        : phase.kind === "flash"
          ? `Number ${phase.index + 1} of ${config.flashes}`
          : phase.kind === "answer"
            ? "Enter your answer"
            : phase.kind === "result"
              ? phase.outcome.correct
                ? "Correct"
                : "Incorrect"
              : "Round stopped";

  const submitButton = (
    <Button size="xl" className="w-full" onClick={() => submit()} disabled={answer.trim() === ""}>
      Submit <ArrowRight />
    </Button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background" aria-label="MindSprint round">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <Button variant="ghost" size="sm" onClick={openQuit}>
          <X /> Quit
        </Button>
        <div className="flex flex-col items-center gap-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Round {index + 1} of {rounds.length}
          </p>
          <ol className="flex gap-1" aria-hidden>
            {rounds.map((_, i) => {
              const done = played[i];
              const outcome = done ? scoreRound(done) : null;
              return (
                <li
                  key={i}
                  className={cn(
                    "h-1.5 w-6 rounded-full transition-colors sm:w-8",
                    outcome ? (outcome.correct ? "bg-success" : "bg-destructive") : i === index ? "bg-foreground" : "bg-secondary"
                  )}
                />
              );
            })}
          </ol>
        </div>
        <div className="flex items-center gap-1">
          <span className="min-w-12 text-right font-mono text-sm font-semibold tabular-nums" aria-label={`Score ${score}`}>
            {score.toLocaleString()}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label={soundOn ? "Mute sound" : "Turn sound on"} aria-pressed={soundOn} onClick={() => onSoundChange(!soundOn)}>
            {soundOn ? <Volume2 /> : <VolumeX />}
          </Button>
        </div>
      </header>

      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {(phase.kind === "countdown" || phase.kind === "go" || phase.kind === "flash") && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 text-center">
            {phase.kind === "countdown" && (
              <>
                <p className="text-sm text-muted-foreground">Get ready</p>
                <p key={phase.value} className="animate-pop font-mono text-[9rem] font-semibold leading-none tabular-nums sm:text-[12rem]">
                  {phase.value}
                </p>
              </>
            )}
            {phase.kind === "go" && (
              <p className="animate-pop rounded-3xl bg-foreground px-10 py-4 font-mono text-7xl font-semibold tracking-tight text-background sm:text-8xl">GO!</p>
            )}
            {phase.kind === "flash" && (
              <>
                <FlashDisplay flash={round.flashes[phase.index]} index={phase.index} visible={phase.visible} />
                <div className="flex gap-1.5" aria-hidden>
                  {round.flashes.map((_, i) => (
                    <span key={i} className={cn("size-2 rounded-full transition-colors", i <= phase.index ? "bg-foreground" : "bg-secondary")} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {phase.kind === "answer" && (
          <div className="flex flex-1 flex-col justify-center">
            <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-5">
              <div className="space-y-1 text-center">
                <p className="text-2xl font-semibold tracking-tight">What is the result?</p>
                <p className="text-sm text-muted-foreground">
                  Apply all {config.flashes} numbers in order, left to right.
                </p>
              </div>
              <input
                ref={inputRef}
                type="text"
                inputMode={touchKeypad ? "none" : config.decimals || config.allowNegative ? "text" : "numeric"}
                // Read-only is what guarantees no OS keyboard on touch devices; the number pad below types instead.
                readOnly={touchKeypad}
                aria-label="Your answer"
                aria-invalid={problem !== null || undefined}
                aria-describedby={problem ? "ms-answer-problem" : undefined}
                value={answer}
                onChange={(e) => {
                  setAnswer(sanitizeAnswer(e.target.value, config));
                  setProblem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="?"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={cn(
                  "h-16 w-full rounded-xl border bg-card text-center font-mono text-4xl font-semibold tabular-nums shadow-card transition-colors outline-none",
                  "placeholder:text-muted-foreground/40 focus:border-foreground focus:ring-4 focus:ring-ring/20",
                  problem ? "border-destructive" : "border-input"
                )}
              />
              <p id="ms-answer-problem" role="alert" className="min-h-5 text-center text-sm text-destructive">
                {problem}
              </p>
              <div className="flex w-full items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => submit(true)}>
                  Skip
                </Button>
                {needsSignButton && (
                  <Button variant="outline" size="sm" onClick={toggleSign} aria-label="Toggle minus sign">
                    <span aria-hidden className="font-mono text-base leading-none">±</span> Sign
                  </Button>
                )}
              </div>
              {!showKeypad && <div className="w-full">{submitButton}</div>}
            </div>
          </div>
        )}

        {phase.kind === "result" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              <div className="mx-auto w-full max-w-xl space-y-5 py-4">
                <div className="space-y-1 text-center">
                  <p
                    className={cn(
                      "animate-pop text-4xl font-semibold tracking-tight sm:text-5xl",
                      phase.outcome.correct ? "text-success" : phase.outcome.answered ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {phase.outcome.correct ? "Correct!" : phase.outcome.answered ? "Not quite" : "Skipped"}
                  </p>
                  <p className="font-mono text-sm tabular-nums text-muted-foreground">
                    {phase.outcome.correct ? `+${phase.outcome.points} points` : "0 points"}
                  </p>
                </div>
                <RoundResult round={phase.round} outcome={phase.outcome} />
              </div>
            </div>
            <div className="border-t border-border bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="mx-auto max-w-xl">
                <Button size="xl" className="w-full" onClick={next} autoFocus>
                  {isLast ? "See results" : "Next round"} <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase.kind === "interrupted" && !confirmQuit && (
          <div className="grid flex-1 place-items-center px-5">
            <div className="max-w-sm space-y-4 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
                <Eye className="size-5" aria-hidden />
              </span>
              <p className="text-2xl font-semibold tracking-tight">Round stopped</p>
              <p className="text-sm text-muted-foreground">You switched away, so the numbers were stopped. The round starts again from the countdown.</p>
              <Button size="lg" onClick={() => startRound(index)} autoFocus>
                Restart round
              </Button>
            </div>
          </div>
        )}

        {confirmQuit && (
          <div role="alertdialog" aria-modal="true" aria-labelledby="ms-quit-title" className="absolute inset-0 z-10 grid place-items-center bg-background/95 px-5 backdrop-blur-sm">
            <div className="max-w-sm space-y-4 text-center">
              <p id="ms-quit-title" className="text-2xl font-semibold tracking-tight">
                Quit this session?
              </p>
              <p className="text-sm text-muted-foreground">Only finished sessions are saved, so this one will be lost.</p>
              <div className="flex justify-center gap-2">
                <Button size="lg" onClick={closeQuit} autoFocus>
                  Keep playing
                </Button>
                <Button size="lg" variant="outline" onClick={onQuit}>
                  Quit
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showKeypad && (
        <AnswerKeypad
          format={keypadFormat(config)}
          onKey={(key) => {
            if (key === "-") toggleSign();
            else {
              setAnswer((current) => sanitizeAnswer(current + key, config));
              setProblem(null);
            }
          }}
          onBackspace={() => {
            setAnswer((current) => current.slice(0, -1));
            setProblem(null);
          }}
          action={submitButton}
        />
      )}
    </div>
  );
}
