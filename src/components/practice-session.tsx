"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Flame, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PracticeSessionProps {
  sessionId: string;
}

interface Question {
  left: number;
  right: number;
}

interface Feedback {
  isCorrect: boolean;
  correctAnswer: number;
}

const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const CORRECT_DELAY_MS = 450;
const INCORRECT_DELAY_MS = 900;

export default function PracticeSession({ sessionId }: PracticeSessionProps) {
  const router = useRouter();
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [stats, setStats] = useState({ total: 0, correct: 0, streak: 0 });
  const [deadline, setDeadline] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const summaryHref = `/practice/${sessionId}/summary`;

  const startTimeRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => timeouts.forEach(clearTimeout);
  }, []);

  const finishSession = useCallback(async () => {
    try {
      await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
    } catch (err) {
      console.error(err);
    }
    router.push(`/practice/${sessionId}/summary`);
  }, [sessionId, router]);

  const loadQuestion = useCallback(
    async (previous?: Question) => {
      try {
        const query = previous ? `?left=${previous.left}&right=${previous.right}` : "";
        const res = await fetch(`/api/sessions/${sessionId}/next${query}`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (data.finished) {
          router.push(`/practice/${sessionId}/summary`);
          return;
        }
        if (data.durationSeconds) {
          setDeadline(new Date(data.startedAt).getTime() + data.durationSeconds * 1000);
          setDurationSeconds(data.durationSeconds);
        }
        if (typeof data.targetQuestionCount === "number") setTargetCount(data.targetQuestionCount);
        setError(null);
        setQuestion({ left: data.left, right: data.right });
        setAnswer("");
        setFeedback(null);
        startTimeRef.current = Date.now();
        later(() => inputRef.current?.focus(), 30);
      } catch (err) {
        console.error(err);
        setError("Could not load the next question. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, router, later]
  );

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) finishSession();
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, finishSession]);

  useEffect(() => {
    // Deferred so the initial fetch is cancelled cleanly if the effect re-runs (e.g. StrictMode).
    const timer = setTimeout(() => loadQuestion(), 0);
    return () => clearTimeout(timer);
  }, [loadQuestion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAnswer = Number(answer);
    if (!answer.trim() || !Number.isInteger(numAnswer) || !question || submitting || feedback) return;

    setSubmitting(true);
    setError(null);
    const responseTimeMs = Date.now() - startTimeRef.current;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left: question.left, right: question.right, userAnswer: numAnswer, responseTimeMs }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: Feedback & { finished: boolean } = await res.json();

      setStats((prev) => ({
        total: prev.total + 1,
        correct: prev.correct + (data.isCorrect ? 1 : 0),
        streak: data.isCorrect ? prev.streak + 1 : 0,
      }));
      setFeedback({ isCorrect: data.isCorrect, correctAnswer: data.correctAnswer });

      later(
        () => {
          if (data.finished) {
            router.push(summaryHref);
            return;
          }
          setQuestionNumber((n) => n + 1);
          loadQuestion(question);
        },
        data.isCorrect ? CORRECT_DELAY_MS : INCORRECT_DELAY_MS
      );
    } catch (err) {
      console.error(err);
      setError("Could not submit your answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !question) {
    return (
      <div className="grid min-h-screen place-items-center" role="status">
        <div className="flex flex-col items-center gap-4">
          <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">Preparing your session…</p>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="grid min-h-screen place-items-center px-5">
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
  const canSubmit = answer.trim() !== "" && !submitting && !feedback;

  // Progress: time elapsed for timed sessions, questions answered for fixed-length sessions.
  const progress =
    secondsLeft !== null && durationSeconds
      ? ((durationSeconds - secondsLeft) / durationSeconds) * 100
      : targetCount
        ? (stats.total / targetCount) * 100
        : null;
  const lowTime = secondsLeft !== null && secondsLeft <= 10;

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (stats.total > 0 ? finishSession() : router.push("/"))}
          aria-label={stats.total > 0 ? "End session and see results" : "Leave session"}
        >
          <X />
          {stats.total > 0 ? "End session" : "Leave"}
        </Button>

        <div className="flex items-center gap-4 text-sm tabular-nums">
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
      <div className="container flex flex-1 flex-col items-center justify-center pb-24">
        <div
          key={`${question.left}x${question.right}-${questionNumber}`}
          className={cn(
            "animate-in fade-in zoom-in-95 duration-200 select-none font-mono text-7xl font-semibold tracking-tighter tabular-nums sm:text-8xl md:text-9xl",
            feedback && !feedback.isCorrect && "animate-shake"
          )}
        >
          {question.left}
          <span className="mx-3 font-normal text-muted-foreground sm:mx-5">×</span>
          {question.right}
        </div>

        <form onSubmit={handleSubmit} className="mt-10 flex w-full max-w-xs flex-col items-center gap-4 sm:mt-14">
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            aria-label={`Answer for ${question.left} times ${question.right}`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={submitting || feedback !== null}
            placeholder="?"
            autoFocus
            autoComplete="off"
            className={cn(
              "h-16 w-full rounded-xl border bg-card text-center font-mono text-4xl font-semibold tabular-nums shadow-card",
              "placeholder:text-muted-foreground/40 transition-colors outline-none",
              "focus:border-foreground focus:ring-4 focus:ring-ring/20",
              !feedback && "border-input",
              feedback?.isCorrect && "border-success bg-success-soft text-success",
              feedback && !feedback.isCorrect && "border-destructive bg-destructive-soft text-destructive"
            )}
          />

          <div aria-live="polite" className="flex min-h-6 items-center justify-center">
            {feedback?.isCorrect && (
              <p className="animate-pop flex items-center gap-1.5 text-sm font-medium text-success">
                <Check className="size-4" /> Correct
              </p>
            )}
            {feedback && !feedback.isCorrect && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <X className="size-4" /> Answer:
                <span className="font-mono text-base font-semibold">{feedback.correctAnswer}</span>
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
            {submitting ? (
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            ) : (
              <>
                Submit
                <ArrowRight />
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Live stats */}
      <footer className="fixed inset-x-0 bottom-0 border-t border-border bg-background/80 backdrop-blur-md">
        <div className="container grid h-14 grid-cols-3 items-center text-center text-sm">
          <Stat label="Correct" value={`${stats.correct}/${stats.total}`} />
          <Stat label="Accuracy" value={`${accuracy}%`} />
          <Stat
            label="Streak"
            value={
              <span className="inline-flex items-center gap-1">
                <Flame className={cn("size-3.5", stats.streak >= 3 ? "text-warning" : "text-muted-foreground")} />
                {stats.streak}
              </span>
            }
          />
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
