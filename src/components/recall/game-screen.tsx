"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerKeypad, useTouchKeypad } from "@/components/answer-keypad";
import { Button } from "@/components/ui/button";
import { EntryBoxes } from "@/components/recall/entry-boxes";
import { PerfectLabel, SequenceComparison } from "@/components/recall/round-result";
import { MAX_RESPONSE_MS } from "@/lib/records";
import type { SoundPlayer } from "@/lib/mindsprint/sound";
import { buildTimeline, runTimeline } from "@/lib/mindsprint/timeline";
import { entriesFromText, sanitizeEntry, validateEntries } from "@/lib/recall/answer";
import { generateSequence, nextLength } from "@/lib/recall/sequence";
import { scoreRound, type RoundScore } from "@/lib/recall/scoring";
import { DIGITS_PER_ITEM, ITEM_NAME, type PlayedRound, type RecallConfig } from "@/lib/recall/types";

type Phase =
  | { kind: "countdown"; value: number }
  | { kind: "go" }
  | { kind: "flash"; index: number; visible: boolean }
  | { kind: "answer" }
  | { kind: "result"; round: PlayedRound; score: RoundScore }
  /** The round was stopped before the entry boxes: the tab was hidden, or the player asked to quit. */
  | { kind: "interrupted"; reason: "hidden" | "quit" };

const SEQUENCE_PHASES: Phase["kind"][] = ["countdown", "go", "flash"];

export interface GameScreenProps {
  config: RecallConfig;
  sound: SoundPlayer;
  soundOn: boolean;
  onSoundChange: (next: boolean) => void;
  /** Called as soon as the last answer is in, so the session is saved even if the player leaves from the result screen. */
  onFinished: (played: PlayedRound[]) => void;
  onSummary: () => void;
  onQuit: () => void;
}

const emptyEntries = (length: number): string[] => Array.from({ length }, () => "");

export function GameScreen({ config, sound, soundOn, onSoundChange, onFinished, onSummary, onQuit }: GameScreenProps) {
  const touchKeypad = useTouchKeypad();
  const width = DIGITS_PER_ITEM[config.mode];
  const [index, setIndex] = useState(0);
  const [sequence, setSequence] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "countdown", value: config.countdown });
  const [entries, setEntries] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [problem, setProblem] = useState<{ reason: string; incomplete: number[] } | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [played, setPlayed] = useState<PlayedRound[]>([]);

  const phaseRef = useRef(phase);
  const playedRef = useRef<PlayedRound[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const answerShownAt = useRef(0);
  /** Set from the moment an answer is accepted until the next round starts, so a double press cannot submit twice. */
  const lockedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /**
   * Starts a round. A new round makes its sequence here, once; restarting an interrupted round passes the same
   * sequence back in, so the sequence that is shown is always the one the answer is checked against.
   */
  const startRound = useCallback(
    (i: number, existing?: string[]) => {
      cancelRef.current?.();
      lockedRef.current = false;
      const previous = playedRef.current[i - 1];
      const length = existing ? existing.length : nextLength(config, previous ? { length: previous.sequence.length, perfect: scoreRound(config, previous).perfect } : null);
      const items = existing ?? generateSequence(config.mode, length);
      setIndex(i);
      setSequence(items);
      setEntries(emptyEntries(items.length));
      setActive(0);
      setProblem(null);
      setPhase({ kind: "countdown", value: config.countdown });
      // Countdown ticks, the start signal, every item and the entry boxes all come from one schedule, so sounds and items stay in step.
      cancelRef.current = runTimeline(buildTimeline({ flashes: items.length, displayMs: config.displayMs, gapMs: config.gapMs }, config.countdown), (event) => {
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
    [config, sound]
  );

  useEffect(() => {
    const timer = setTimeout(() => startRound(0), 0);
    return () => {
      clearTimeout(timer);
      cancelRef.current?.();
    };
  }, [startRound]);

  // A hidden tab cannot be trusted to keep the timing, and the player would miss items: stop the round and offer a restart.
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
    // The sequence is kept, so resuming repeats the same round rather than drawing a new one.
    if (phaseRef.current.kind === "interrupted") startRound(index, sequence);
  }, [index, sequence, startRound]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmQuit) closeQuit();
      else openQuit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmQuit, openQuit, closeQuit]);

  // ---- Editing the boxes ---------------------------------------------------

  const clearProblem = () => setProblem(null);

  /** Sets one box to the cleaned text, and moves on once it is full. */
  const setEntry = (i: number, raw: string) => {
    const clean = sanitizeEntry(config.mode, raw);
    setEntries((current) => current.map((v, k) => (k === i ? clean : v)));
    clearProblem();
    if (clean.length === width && i < sequence.length - 1) setActive(i + 1);
  };

  const pasteInto = (i: number, text: string) => {
    const pasted = entriesFromText(config.mode, text, sequence.length - i);
    if (pasted.length === 0) return;
    setEntries((current) => current.map((v, k) => (k >= i && k - i < pasted.length ? pasted[k - i] : v)));
    clearProblem();
    const last = i + pasted.length - 1;
    setActive(Math.min(sequence.length - 1, pasted[pasted.length - 1].length === width ? last + 1 : last));
  };

  /** Backspace: removes the last character of the active box, or, when it is empty, steps back and removes from the previous one. */
  const backspace = (i: number) => {
    const target = entries[i] === "" && i > 0 ? i - 1 : i;
    setEntries((current) => current.map((v, k) => (k === target ? v.slice(0, -1) : v)));
    setActive(target);
    clearProblem();
  };

  // ---- Submitting ----------------------------------------------------------

  const submit = (skip = false) => {
    if (phaseRef.current.kind !== "answer" || lockedRef.current) return;
    let answer: string[] | null = null;
    if (!skip) {
      const check = validateEntries(config.mode, sequence.length, entries);
      if (!check.ok) {
        setProblem({ reason: check.reason, incomplete: check.incomplete });
        setActive(check.incomplete[0] ?? 0);
        return;
      }
      answer = check.entries;
    }
    lockedRef.current = true;
    const responseMs = Math.min(MAX_RESPONSE_MS, Math.max(0, Math.round(performance.now() - answerShownAt.current)));
    const round: PlayedRound = { sequence, answer, responseMs };
    const score = scoreRound(config, round);
    sound.play(score.perfect ? "correct" : "wrong");

    const all = [...playedRef.current, round];
    playedRef.current = all;
    setPlayed(all);
    setPhase({ kind: "result", round, score });
    if (all.length === config.rounds) onFinished(all);
  };

  const isLast = index + 1 === config.rounds;
  const next = () => (isLast ? onSummary() : startRound(index + 1));
  const total = played.reduce((sum, p) => sum + scoreRound(config, p).points, 0);
  const showKeypad = touchKeypad && phase.kind === "answer";
  const [itemOne, itemMany] = ITEM_NAME[config.mode];

  const upcomingLength =
    phase.kind === "result" && config.progressive && !isLast ? nextLength(config, { length: phase.round.sequence.length, perfect: phase.score.perfect }) : null;

  const announcement =
    phase.kind === "countdown"
      ? String(phase.value)
      : phase.kind === "go"
        ? "Go"
        : phase.kind === "flash"
          ? `Item ${phase.index + 1} of ${sequence.length}`
          : phase.kind === "answer"
            ? "Enter the sequence"
            : phase.kind === "result"
              ? phase.score.perfect
                ? "Perfect recall"
                : "Not perfect"
              : "Round stopped";

  const submitButton = (
    <Button size="xl" className="w-full" onClick={() => submit()}>
      Submit <ArrowRight />
    </Button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background" aria-label="Number Recall round">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <Button variant="ghost" size="sm" onClick={openQuit}>
          <X /> Quit
        </Button>
        <div className="flex flex-col items-center gap-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Round {index + 1} of {config.rounds}
            {sequence.length > 0 && <span className="normal-case tracking-normal"> · {sequence.length} {sequence.length === 1 ? itemOne : itemMany}</span>}
          </p>
          <ol className="flex gap-1" aria-hidden>
            {Array.from({ length: config.rounds }, (_, i) => {
              const done = played[i];
              return (
                <li
                  key={i}
                  className={cn(
                    "h-1.5 w-5 rounded-full transition-colors sm:w-7",
                    done ? (scoreRound(config, done).perfect ? "bg-success" : "bg-destructive") : i === index ? "bg-foreground" : "bg-secondary"
                  )}
                />
              );
            })}
          </ol>
        </div>
        <div className="flex items-center gap-1">
          <span className="min-w-12 text-right font-mono text-sm font-semibold tabular-nums" aria-label={`Score ${total}`}>
            {total.toLocaleString()}
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
                <p className="text-sm text-muted-foreground">Get ready to memorise {sequence.length} {sequence.length === 1 ? itemOne : itemMany}</p>
                <p key={phase.value} className="animate-pop font-mono text-[9rem] font-semibold leading-none tabular-nums sm:text-[12rem]">
                  {phase.value}
                </p>
              </>
            )}
            {phase.kind === "go" && <p className="animate-pop rounded-3xl bg-foreground px-10 py-4 font-mono text-7xl font-semibold tracking-tight text-background sm:text-8xl">GO!</p>}
            {phase.kind === "flash" && (
              <>
                {/* Only the item on screen is in the page: the rest of the sequence is not rendered anywhere. */}
                <div className="flex h-44 items-center justify-center sm:h-56" aria-hidden>
                  {phase.visible && (
                    <p key={phase.index} className="animate-in fade-in zoom-in-95 font-mono text-[9rem] font-semibold leading-none tabular-nums duration-100 sm:text-[12rem]">
                      {sequence[phase.index]}
                    </p>
                  )}
                </div>
                <div className="flex max-w-xs flex-wrap justify-center gap-1.5" aria-hidden>
                  {sequence.map((_, i) => (
                    <span key={i} className={cn("size-2 rounded-full transition-colors", i <= phase.index ? "bg-foreground" : "bg-secondary")} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {phase.kind === "answer" && (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-5 py-4">
              <div className="space-y-1 text-center">
                <p className="text-2xl font-semibold tracking-tight">Enter the sequence</p>
                <p className="text-sm text-muted-foreground">
                  {sequence.length} {sequence.length === 1 ? itemOne : itemMany}, in the original order
                  {width === 2 ? ", two digits each (07, not 7)" : ""}.
                </p>
              </div>
              <EntryBoxes
                mode={config.mode}
                entries={entries}
                active={active}
                invalid={problem?.incomplete ?? []}
                readOnly={touchKeypad}
                onActive={setActive}
                onEdit={setEntry}
                onPaste={pasteInto}
                onBackspace={backspace}
                onSubmit={() => submit()}
              />
              <p role="alert" className="min-h-5 text-center text-sm text-destructive">
                {problem?.reason}
              </p>
              <div className="flex w-full max-w-sm items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => submit(true)}>
                  Skip
                </Button>
                {!showKeypad && <div className="w-48">{submitButton}</div>}
              </div>
            </div>
          </div>
        )}

        {phase.kind === "result" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              <div className="mx-auto w-full max-w-2xl space-y-5 py-4">
                <div className="space-y-1 text-center">
                  <p
                    className={cn(
                      "animate-pop text-4xl font-semibold tracking-tight sm:text-5xl",
                      phase.score.perfect ? "text-success" : phase.round.answer ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {phase.score.perfect ? "Perfect recall!" : phase.round.answer ? "Not quite" : "Skipped"}
                  </p>
                  <p className="font-mono text-sm tabular-nums text-muted-foreground">
                    +{phase.score.points} of {phase.score.maxPoints} points
                  </p>
                  <p className="flex justify-center text-sm">
                    <PerfectLabel score={phase.score} skipped={phase.round.answer === null} />
                  </p>
                </div>
                <SequenceComparison round={phase.round} score={phase.score} />
                {upcomingLength !== null && (
                  <p className="text-center text-sm text-muted-foreground">
                    {upcomingLength > phase.round.sequence.length ? `Next round: ${upcomingLength} ${itemMany}, one more than this time.` : `Next round stays at ${upcomingLength} ${upcomingLength === 1 ? itemOne : itemMany}.`}
                  </p>
                )}
              </div>
            </div>
            <div className="border-t border-border bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="mx-auto max-w-2xl">
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
              <p className="text-sm text-muted-foreground">You switched away, so the sequence was stopped. The same round starts again from the countdown.</p>
              <Button size="lg" onClick={() => startRound(index, sequence)} autoFocus>
                Restart round
              </Button>
            </div>
          </div>
        )}

        {confirmQuit && (
          <div role="alertdialog" aria-modal="true" aria-labelledby="nr-quit-title" className="absolute inset-0 z-10 grid place-items-center bg-background/95 px-5 backdrop-blur-sm">
            <div className="max-w-sm space-y-4 text-center">
              <p id="nr-quit-title" className="text-2xl font-semibold tracking-tight">
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
          format={{ kind: "integer" }}
          onKey={(key) => setEntry(active, entries[active] + key)}
          onBackspace={() => backspace(active)}
          action={submitButton}
        />
      )}
    </div>
  );
}
