"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, X } from "lucide-react";

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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
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
        }
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
      <div className="flex flex-col justify-center items-center h-72 gap-4" role="status">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-4" role="alert">
        <p className="text-destructive">{error ?? "Something went wrong."}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            loadQuestion();
          }}
          className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110"
        >
          Retry
        </button>
      </div>
    );
  }

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const feedbackColor = feedback
    ? feedback.isCorrect
      ? "border-green-500/60 shadow-[0_0_32px_rgba(34,197,94,0.25)]"
      : "border-red-500/60 shadow-[0_0_32px_rgba(239,68,68,0.25)]"
    : "border-border";
  const canSubmit = answer.trim() !== "" && !submitting && !feedback;

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className={cn("grid gap-3 flex-1", secondsLeft !== null ? "grid-cols-4" : "grid-cols-3")}>
          {[
            ...(secondsLeft !== null ? [{ label: "Time left", value: formatClock(secondsLeft) }] : []),
            { label: "Question", value: `#${questionNumber}` },
            { label: "Accuracy", value: `${accuracy}%` },
            { label: "Streak 🔥", value: stats.streak },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
              <p className="text-base font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => (stats.total > 0 ? finishSession() : router.push("/"))}
          title="End session"
          aria-label="End session"
          className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-destructive/50 transition-all duration-150"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={cn("rounded-2xl border bg-card transition-all duration-300", feedbackColor)}>
        <div className="p-5 md:p-8 flex flex-col items-center gap-5">
          <div className="text-5xl md:text-6xl font-black tracking-tighter text-foreground leading-none">
            {question.left} <span className="text-primary">×</span> {question.right}
          </div>

          <form onSubmit={handleSubmit} className="w-full flex flex-col items-center gap-3">
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
              className={cn(
                "w-28 h-14 rounded-lg text-center text-2xl font-bold tabular-nums",
                "bg-secondary border-2 text-foreground placeholder:text-muted-foreground/40",
                "focus:outline-none focus:border-primary focus:shadow-[0_0_16px_rgba(59,130,246,0.35)]",
                "transition-all duration-200",
                feedback && !feedback.isCorrect ? "border-red-500/70 text-red-400" : "border-border",
                feedback?.isCorrect ? "border-green-500/70 text-green-400" : ""
              )}
            />

            <div aria-live="polite" className="min-h-7">
              {feedback && !feedback.isCorrect && (
                <div className="flex items-center gap-2 text-red-400 font-medium animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <XCircle className="h-5 w-5" />
                  Correct: <span className="font-bold text-lg">{feedback.correctAnswer}</span>
                </div>
              )}
              {feedback?.isCorrect && (
                <div className="flex items-center gap-2 text-green-400 font-medium animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <CheckCircle2 className="h-5 w-5" />
                  Correct!
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive text-center">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "w-32 h-10 rounded-lg text-sm font-bold tracking-wide transition-all duration-200",
                "flex items-center justify-center gap-2",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_16px_rgba(59,130,246,0.4)] hover:shadow-[0_0_24px_rgba(59,130,246,0.6)] active:scale-[0.97]"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              )}
            >
              {submitting ? (
                <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              ) : (
                "Submit"
              )}
            </button>
          </form>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Press <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono text-xs">Enter</kbd> to submit
      </p>
    </div>
  );
}
