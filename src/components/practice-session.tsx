"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Flame, Lightbulb, Pause, Play, SkipForward, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerKeypad, useTouchKeypad } from "@/components/answer-keypad";
import { Button } from "@/components/ui/button";
import type { LocalStore } from "@/lib/guest/api";
import { localFetchFor, summaryHref as summaryUrl } from "@/lib/local-store";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "@/lib/settings";
import { inputProblem } from "@/lib/skills/answers";
import { SKILL_META, exerciseLabel } from "@/lib/skills/meta";
import type { AnswerFormat, Outcome, PublicQuestion } from "@/lib/skills/types";

interface PracticeSessionProps {
  sessionId: string;
  /** Sessions live in this browser's localStorage, so requests are answered locally instead of by the server. */
  store: LocalStore;
}

interface Feedback {
  outcome: Outcome;
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string | null;
  picked: string | null;
}

const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const CORRECT_DELAY_MS = 450;
const INCORRECT_DELAY_MS = 900;

/** Characters that can ever be part of an answer in this format; anything else is dropped as it is typed. */
function sanitize(format: AnswerFormat, value: string): string {
  switch (format.kind) {
    case "integer":
      return value.replace(/[^\d]/g, "");
    case "number":
      return value.replace(format.unit === "percent" ? /[^\d.%]/g : /[^\d.]/g, "");
    case "fraction":
      return value.replace(/[^\d/ ]/g, "");
    case "choice":
      return "";
  }
}

const inputModeFor = (format: AnswerFormat) =>
  format.kind === "integer" ? "numeric" : format.kind === "number" ? "decimal" : "text";

const placeholderFor = (format: AnswerFormat) =>
  format.kind === "fraction" ? "a/b" : format.kind === "number" && format.unit === "percent" ? "? %" : "?";

/** Short prompts (12 × 8, 17²) are shown huge; sentences are shown at reading size. */
function promptSize(prompt: string) {
  if (prompt.length <= 9) return "font-mono text-7xl font-semibold tracking-tighter tabular-nums sm:text-8xl md:text-9xl";
  if (prompt.length <= 22) return "font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl md:text-6xl";
  return "text-balance text-2xl font-medium leading-snug tracking-tight sm:text-3xl md:text-4xl";
}

export default function PracticeSession({ sessionId, store }: PracticeSessionProps) {
  const router = useRouter();
  const request = localFetchFor(store);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [stats, setStats] = useState({ total: 0, correct: 0, streak: 0 });
  const [deadline, setDeadline] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [isTimed, setIsTimed] = useState(false);
  const [questionLimit, setQuestionLimit] = useState<number>(0);
  const [questionLeft, setQuestionLeft] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const summaryHref = summaryUrl(sessionId);
  const touchKeypad = useTouchKeypad();

  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const continueNextRef = useRef<() => void>(() => {});
  /** Set once the current question has been reported as timed out, so a failed report is not re-sent every tick. */
  const timeoutSentRef = useRef(false);

  const later = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => timeouts.forEach(clearTimeout);
  }, []);

  // Preferences live in localStorage, so they are read after mount.
  useEffect(() => {
    const timer = setTimeout(() => setSettings(loadSettings()), 0);
    return () => clearTimeout(timer);
  }, []);

  const finishingRef = useRef(false);

  const finishSession = useCallback(async () => {
    // The countdown calls this on every tick once it reaches zero; only the first call may run.
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await request(`/api/sessions/${sessionId}/end`, { method: "POST" });
    } catch (err) {
      console.error(err);
    }
    router.push(summaryUrl(sessionId));
  }, [sessionId, router, request]);

  /** Expresses the server's deadline on this device's clock so a skewed clock cannot shift the countdown. */
  const syncDeadline = useCallback((startedAt: string, duration: number, pausedMs: number, serverNow: number) => {
    const serverDeadline = new Date(startedAt).getTime() + duration * 1000 + pausedMs;
    setDeadline(Date.now() + (serverDeadline - serverNow));
    setDurationSeconds(duration);
  }, []);

  const loadQuestion = useCallback(
    async (previousId?: string) => {
      try {
        const query = previousId ? `?exclude=${encodeURIComponent(previousId)}` : "";
        const res = await request(`/api/sessions/${sessionId}/next${query}`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (data.finished) {
          router.push(summaryUrl(sessionId));
          return;
        }
        setIsTimed(data.mode === "timed");
        if (data.durationSeconds) {
          syncDeadline(data.startedAt, data.durationSeconds, data.pausedMs ?? 0, data.serverNow);
        }
        if (typeof data.targetQuestionCount === "number") setTargetCount(data.targetQuestionCount);
        setQuestionLimit(data.questionTimeLimitSeconds ?? 0);
        if (data.paused) {
          pausedAtRef.current = Date.now();
          setPaused(true);
        }
        setError(null);
        setQuestion(data.question as PublicQuestion);
        setAnswer("");
        setFeedback(null);
        setAwaitingContinue(false);
        setHintShown(false);
        startTimeRef.current = Date.now();
        timeoutSentRef.current = false;
        later(() => inputRef.current?.focus(), 30);
      } catch (err) {
        console.error(err);
        setError("Could not load the next question. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, router, request, later, syncDeadline]
  );

  useEffect(() => {
    if (deadline === null || paused) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) finishSession();
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, paused, finishSession]);

  useEffect(() => {
    // Deferred so the initial fetch is cancelled cleanly if the effect re-runs (e.g. StrictMode).
    const timer = setTimeout(() => loadQuestion(), 0);
    return () => clearTimeout(timer);
  }, [loadQuestion]);

  /** Sends one attempt and schedules what happens next. */
  const submitAttempt = useCallback(
    async (kind: "answered" | "skipped" | "timed_out", userAnswer?: string) => {
      if (!question || submitting || feedback || paused) return;
      setSubmitting(true);
      setError(null);
      const responseTimeMs = Date.now() - startTimeRef.current;

      try {
        const res = await request(`/api/sessions/${sessionId}/attempt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.id, userAnswer, outcome: kind, hinted: hintShown, responseTimeMs }),
        });
        if (res.status === 400) {
          const data = await res.json().catch(() => ({}));
          setError(typeof data.error === "string" ? data.error : "That answer could not be checked.");
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data: {
          isCorrect: boolean;
          outcome: Outcome;
          correctAnswer: string;
          explanation: string | null;
          finished: boolean;
        } = await res.json();

        setStats((prev) => ({
          total: prev.total + 1,
          correct: prev.correct + (data.isCorrect ? 1 : 0),
          streak: data.isCorrect ? prev.streak + 1 : 0,
        }));
        setFeedback({
          outcome: data.outcome,
          isCorrect: data.isCorrect,
          correctAnswer: data.correctAnswer,
          explanation: data.explanation,
          picked: kind === "answered" ? (userAnswer ?? null) : null,
        });

        const next = () => {
          if (data.finished) {
            router.push(summaryHref);
            return;
          }
          setQuestionNumber((n) => n + 1);
          loadQuestion(question.id);
        };
        // A miss waits for the user to read the explanation, and a correct answer waits when auto-advance is off.
        // Timed sessions never wait because the clock keeps running.
        const waitsForUser = data.isCorrect ? !settings.autoAdvance : !!data.explanation && settings.showExplanations;
        if (waitsForUser && !isTimed && !data.finished) {
          setAwaitingContinue(true);
          continueNextRef.current = next;
          later(() => continueRef.current?.focus(), 30);
        } else {
          later(next, data.isCorrect ? CORRECT_DELAY_MS : INCORRECT_DELAY_MS);
        }
      } catch (err) {
        console.error(err);
        setError("Could not submit your answer. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [question, submitting, feedback, paused, hintShown, sessionId, request, settings.showExplanations, settings.autoAdvance, isTimed, router, summaryHref, loadQuestion, later]
  );

  const proceed = useCallback(() => {
    setAwaitingContinue(false);
    continueNextRef.current();
  }, []);

  const togglePause = useCallback(async () => {
    if (!question || submitting) return;
    try {
      if (!paused) {
        const res = await request(`/api/sessions/${sessionId}/pause`, { method: "POST" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        pausedAtRef.current = Date.now();
        setPaused(true);
      } else {
        const res = await request(`/api/sessions/${sessionId}/resume`, { method: "POST" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        // Time spent paused must not count towards this question's response time.
        startTimeRef.current += Date.now() - pausedAtRef.current;
        if (data.durationSeconds) syncDeadline(data.startedAt, data.durationSeconds, data.pausedMs, data.serverNow);
        setPaused(false);
        later(() => inputRef.current?.focus(), 30);
      }
    } catch (err) {
      console.error(err);
      setError(paused ? "Could not resume. Please try again." : "Could not pause. Please try again.");
    }
  }, [question, submitting, paused, sessionId, request, syncDeadline, later]);

  // On a short screen the result line can sit below the visible part of the question area.
  useEffect(() => {
    if (feedback) feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [feedback]);

  // Per-question time limit.
  useEffect(() => {
    if (!question || !questionLimit || feedback || paused || submitting) {
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((startTimeRef.current + questionLimit * 1000 - Date.now()) / 1000));
      setQuestionLeft(left);
      if (left === 0 && !timeoutSentRef.current) {
        timeoutSentRef.current = true;
        submitAttempt("timed_out");
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [question, questionLimit, feedback, paused, submitting, submitAttempt]);

  const problem = question && answer.trim() !== "" ? inputProblem(question.answerFormat, answer, question.choices) : null;
  const canSubmit = !!question && answer.trim() !== "" && problem === null && !submitting && !feedback && !paused;
  const canAsk = !!question && !submitting && !feedback && !paused;
  const showHint = settings.allowHints && !!question?.hint;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) submitAttempt("answered", answer.trim());
  };

  const revealHint = useCallback(() => {
    if (canAsk && showHint) setHintShown(true);
  }, [canAsk, showHint]);

  // Keyboard: Esc pauses/resumes, ? or Alt+H shows the hint, Alt+S skips, Enter continues after a miss,
  // and 1-3 (or < = >) answer multiple-choice questions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (paused) return;
      if (awaitingContinue && e.key === "Enter") {
        e.preventDefault();
        proceed();
        return;
      }
      if (!canAsk || !question) return;
      if (e.key === "?" || (e.altKey && e.key.toLowerCase() === "h")) {
        e.preventDefault();
        revealHint();
      } else if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        submitAttempt("skipped");
      } else if (question.choices && !e.altKey) {
        const symbol: Record<string, string> = { ">": "gt", "<": "lt", "=": "eq" };
        const byNumber = question.choices[Number(e.key) - 1];
        const value = byNumber?.value ?? (question.choices.some((c) => c.value === symbol[e.key]) ? symbol[e.key] : undefined);
        if (value) {
          e.preventDefault();
          submitAttempt("answered", value);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, awaitingContinue, canAsk, question, togglePause, proceed, revealHint, submitAttempt]);

  if (loading && !question) {
    return (
      <div className="grid min-h-dvh place-items-center" role="status">
        <div className="flex flex-col items-center gap-4">
          <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">Preparing your session…</p>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="grid min-h-dvh place-items-center px-5">
        <div className="max-w-sm space-y-4 text-center" role="alert">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{error ?? "The session could not be loaded."}</p>
          <div className="flex justify-center gap-2">
            <Button
              onClick={() => {
                setLoading(true);
                setError(null);
                loadQuestion();
              }}
            >
              Try again
            </Button>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const isChoice = question.answerFormat.kind === "choice";
  // On touch devices the in-app keypad stands in for the OS keyboard, which would resize the page on every open.
  const showKeypad = touchKeypad && !isChoice;

  // Progress: time elapsed for timed sessions, questions answered for fixed-length sessions.
  const progress =
    secondsLeft !== null && durationSeconds
      ? ((durationSeconds - secondsLeft) / durationSeconds) * 100
      : targetCount
        ? (stats.total / targetCount) * 100
        : null;
  const lowTime = secondsLeft !== null && secondsLeft <= 10;
  const lowQuestionTime = questionLeft !== null && questionLeft <= 3;
  const missLabel =
    feedback?.outcome === "skipped" ? "Skipped" : feedback?.outcome === "timed_out" ? "Time's up" : "Answer";

  /** Submit, or Continue after a miss. It lives in the keypad when there is one so it stays next to the digits. */
  const actionButton = awaitingContinue ? (
    <Button ref={continueRef} type="button" size="lg" className="w-full" onClick={proceed}>
      Continue
      <span className="kbd border-primary-foreground/30 bg-transparent text-primary-foreground/80">Enter</span>
    </Button>
  ) : !isChoice ? (
    <Button type="submit" form="answer-form" size="lg" className="w-full" disabled={!canSubmit}>
      {submitting ? (
        <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
      ) : (
        <>
          Submit
          <ArrowRight />
        </>
      )}
    </Button>
  ) : null;

  return (
    <div className={cn("relative isolate flex flex-col overflow-hidden", showKeypad ? "h-dvh" : "min-h-dvh")}>
      <div aria-hidden className="bg-grid absolute inset-0 -z-10 opacity-70" />

      {/* Progress rail */}
      <div className="h-0.5 w-full bg-border" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress ?? 0)} hidden={progress === null}>
        <div
          className={cn("h-full transition-[width] duration-300 ease-out", lowTime ? "bg-destructive" : "bg-foreground")}
          style={{ width: `${Math.min(100, progress ?? 0)}%` }}
        />
      </div>

      {/* Top bar */}
      <header className="container flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (stats.total > 0 ? finishSession() : router.push("/"))}
            aria-label={stats.total > 0 ? "End session and see results" : "Leave session"}
          >
            <X />
            {stats.total > 0 ? "End session" : "Leave"}
          </Button>
          <Button variant="ghost" size="sm" onClick={togglePause} aria-label="Pause session (Escape)" disabled={submitting}>
            <Pause />
            <span className="hidden sm:inline">Pause</span>
          </Button>
        </div>

        <div className="flex items-center gap-3 text-sm tabular-nums sm:gap-4">
          {questionLimit > 0 && questionLeft !== null && !feedback && (
            <span
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-xs font-medium",
                lowQuestionTime ? "border-destructive/40 bg-destructive-soft text-destructive" : "border-border bg-card text-muted-foreground"
              )}
              role="timer"
              aria-label="Time left for this question"
            >
              {questionLeft}s
            </span>
          )}
          {secondsLeft !== null && (
            <span
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono font-medium",
                lowTime ? "border-destructive/40 bg-destructive-soft text-destructive" : "border-border bg-card"
              )}
              role="timer"
              aria-label="Time left"
            >
              {formatClock(secondsLeft)}
            </span>
          )}
          <span className="hidden text-muted-foreground sm:inline">
            Question <span className="font-mono font-medium text-foreground">{questionNumber}</span>
            {targetCount ? <span className="font-mono"> / {targetCount}</span> : null}
          </span>
        </div>
      </header>

      {/* Question */}
      <div
        className={cn(
          "container flex min-h-0 flex-1 flex-col items-center",
          // With the keypad the middle scrolls if the screen is short; auto margins centre it when it fits.
          showKeypad
            ? "overflow-y-auto pb-2 [&>:first-child]:mt-auto [&>:last-child]:mb-auto"
            : cn("justify-center", settings.showLiveStats ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-10")
        )}
        aria-hidden={paused || undefined}
      >
        <p className="mb-5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {SKILL_META[question.skill].title} · {exerciseLabel(question.skill, question.exerciseType)}
        </p>
        <div
          key={`${question.id}-${questionNumber}`}
          className={cn(
            "max-w-3xl animate-in fade-in zoom-in-95 text-center duration-200 select-none",
            promptSize(question.prompt),
            feedback && !feedback.isCorrect && "animate-shake"
          )}
          aria-live="polite"
        >
          {question.prompt}
        </div>

        <form id="answer-form" onSubmit={handleSubmit} className={cn("flex w-full max-w-sm flex-col items-center gap-3", showKeypad ? "mt-6" : "mt-10 gap-4 sm:mt-14")}>
          {isChoice ? (
            <div className="grid w-full gap-2" role="group" aria-label={`Answer for ${question.prompt}`}>
              {question.choices?.map((choice, index) => {
                const isPicked = feedback?.picked === choice.value;
                // After a miss, the right option is shown so the user sees what they should have chosen.
                const isAnswer = feedback !== null && choice.label === feedback.correctAnswer;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    disabled={submitting || feedback !== null || paused}
                    onClick={() => submitAttempt("answered", choice.value)}
                    className={cn(
                      "flex h-14 items-center justify-between rounded-xl border bg-card px-5 font-mono text-xl font-semibold shadow-card transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      !feedback && "border-input hover:border-foreground hover:bg-accent",
                      feedback && isAnswer && "border-success bg-success-soft text-success",
                      feedback && isPicked && !isAnswer && "border-destructive bg-destructive-soft text-destructive",
                      feedback && !isPicked && !isAnswer && "opacity-60"
                    )}
                  >
                    <span>{choice.label}</span>
                    <span className="kbd" aria-hidden>
                      {index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              inputMode={showKeypad ? "none" : inputModeFor(question.answerFormat)}
              // Read-only is what guarantees no OS keyboard; inputMode="none" alone is ignored by some keyboards.
              readOnly={showKeypad}
              aria-label={`Answer for ${question.prompt}`}
              aria-invalid={problem !== null || undefined}
              value={answer}
              onChange={(e) => setAnswer(sanitize(question.answerFormat, e.target.value))}
              disabled={submitting || feedback !== null || paused}
              placeholder={placeholderFor(question.answerFormat)}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(
                "h-16 w-full rounded-xl border bg-card text-center font-mono text-4xl font-semibold tabular-nums shadow-card",
                "placeholder:text-muted-foreground/40 transition-colors outline-none",
                "focus:border-foreground focus:ring-4 focus:ring-ring/20",
                !feedback && "border-input",
                feedback?.isCorrect && "animate-pop border-success bg-success-soft text-success",
                feedback && !feedback.isCorrect && "border-destructive bg-destructive-soft text-destructive"
              )}
            />
          )}

          {hintShown && question.hint && (
            <p className="animate-in fade-in slide-in-from-top-1 w-full rounded-lg border border-border bg-secondary/60 px-3.5 py-2.5 text-center text-sm text-muted-foreground duration-200">
              <span className="font-medium text-foreground">Hint:</span> {question.hint}
            </p>
          )}

          <div ref={feedbackRef} aria-live="polite" className="flex min-h-6 w-full flex-col items-center justify-center gap-2">
            {feedback?.isCorrect && (
              <p className="animate-pop flex items-center gap-1.5 text-sm font-medium text-success">
                <Check className="size-4" /> Correct
              </p>
            )}
            {feedback && !feedback.isCorrect && (
              <>
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <X className="size-4" /> {missLabel}:
                  <span className="font-mono text-base font-semibold">{feedback.correctAnswer}</span>
                </p>
                {awaitingContinue && feedback.explanation && (
                  <p className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-center text-sm text-muted-foreground shadow-card">
                    {feedback.explanation}
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {!error && problem && !feedback && (
              <p className="text-xs text-muted-foreground">{problem}</p>
            )}
          </div>

          {!showKeypad && actionButton}

          {!awaitingContinue && (
            <div className="flex items-center gap-2">
              {showHint && (
                <Button type="button" variant="ghost" size="sm" onClick={revealHint} disabled={!canAsk || hintShown}>
                  <Lightbulb />
                  Hint <span className="kbd">?</span>
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => submitAttempt("skipped")} disabled={!canAsk}>
                <SkipForward />
                Skip <span className="kbd">Alt S</span>
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Live stats */}
      {settings.showLiveStats && (
        <footer
          className={cn(
            "border-t border-border bg-background/80 backdrop-blur-md",
            // With the keypad the stats sit just above it in the flow; otherwise they float at the bottom edge.
            showKeypad ? "" : "fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]"
          )}
        >
          <div className="container grid h-14 grid-cols-3 items-center text-center text-sm">
            <Stat label="Correct" value={`${stats.correct}/${stats.total}`} bump={stats.total} />
            <Stat label="Accuracy" value={`${accuracy}%`} bump={accuracy} />
            <Stat
              label="Streak"
              bump={stats.streak}
              value={
                <span className="inline-flex items-center gap-1">
                  <Flame className={cn("size-3.5", stats.streak >= 3 ? "text-warning" : "text-muted-foreground")} />
                  {stats.streak}
                </span>
              }
            />
          </div>
        </footer>
      )}

      {showKeypad && (
        <AnswerKeypad
          format={question.answerFormat}
          disabled={!canAsk}
          onKey={(key) => setAnswer((current) => sanitize(question.answerFormat, current + key))}
          onBackspace={() => setAnswer((current) => current.slice(0, -1))}
          action={actionButton}
        />
      )}

      {/* Paused: the question is hidden so the break cannot be used to work it out. */}
      {paused && (
        <div role="dialog" aria-modal="true" aria-label="Session paused" className="absolute inset-0 z-20 grid place-items-center bg-background/95 px-5 backdrop-blur-sm">
          <div className="max-w-xs space-y-4 text-center">
            <p className="text-2xl font-semibold tracking-tight">Paused</p>
            <p className="text-sm text-muted-foreground">
              {isTimed ? "The clock is stopped. " : ""}Your progress is saved. Press Escape or the button to carry on.
            </p>
            <Button size="lg" onClick={togglePause} autoFocus>
              <Play />
              Resume
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** `bump` changes whenever the value does, which restarts the small pop that draws the eye to it. */
function Stat({ label, value, bump }: { label: string; value: React.ReactNode; bump: number }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span key={bump} className="animate-pop font-mono text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
