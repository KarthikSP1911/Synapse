"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Infinity as InfinityIcon, ListOrdered, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import ReviewButton from "@/components/review-button";

const numbers = Array.from({ length: 20 }, (_, i) => i + 1);

const countModes = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "30", label: "30" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "endless", label: "Endless" },
] as const;

const timedModes = [
  { value: "timed:30", label: "30 sec" },
  { value: "timed:60", label: "1 min" },
  { value: "timed:120", label: "2 min" },
] as const;

const presets = [
  { label: "1–5", range: [1, 5] },
  { label: "6–10", range: [6, 10] },
  { label: "11–20", range: [11, 20] },
  { label: "All", range: [1, 20] },
] as const;

const rangeOf = (from: number, to: number) => numbers.filter((n) => n >= from && n <= to);

function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md border text-sm font-medium transition-colors select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:border-input hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function NumberPicker({
  title,
  description,
  selected,
  onChange,
}: {
  title: string;
  description: string;
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const toggle = (n: number) => onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n].sort((a, b) => a - b));
  const matches = (from: number, to: number) => {
    const r = rangeOf(from, to);
    return r.length === selected.length && r.every((n) => selected.includes(n));
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-label={title}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
          {selected.length}/20
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {presets.map(({ label, range }) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(rangeOf(range[0], range[1]))}
            className={cn(
              "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
              matches(range[0], range[1])
                ? "border-foreground/40 bg-accent text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([])}
          className="h-7 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10">
        {numbers.map((n) => (
          <Chip key={n} active={selected.includes(n)} onClick={() => toggle(n)} className="font-mono tabular-nums">
            {n}
          </Chip>
        ))}
      </div>
    </section>
  );
}

export default function PracticeSetup() {
  const router = useRouter();
  const [leftSelected, setLeftSelected] = useState<number[]>(numbers);
  const [rightSelected, setRightSelected] = useState<number[]>(numbers);
  const [kind, setKind] = useState<"count" | "timed">("count");
  const [sessionMode, setSessionMode] = useState<string>("20");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchKind = (next: "count" | "timed") => {
    setKind(next);
    setSessionMode(next === "count" ? "20" : "timed:60");
  };

  const handleStart = async () => {
    if (leftSelected.length === 0 || rightSelected.length === 0) return;
    setIsStarting(true);
    setError(null);
    try {
      const isTimed = sessionMode.startsWith("timed:");
      const mode = isTimed ? "timed" : sessionMode === "endless" ? "endless" : "fixed";
      const count = mode === "fixed" ? parseInt(sessionMode, 10) : null;
      const durationSeconds = isTimed ? parseInt(sessionMode.slice(6), 10) : null;
      const { weakFocusPercent, recentWindow } = loadSettings();
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          targetQuestionCount: count,
          durationSeconds,
          weakFocusPercent,
          recentWindow,
          selectedLeftNumbers: leftSelected,
          selectedRightNumbers: rightSelected,
        }),
      });
      if (!response.ok) throw new Error("Failed to start session");
      const session = await response.json();
      router.push(`/practice/${session.id}`);
    } catch (err) {
      console.error(err);
      setError("Could not start the session. Please try again.");
      setIsStarting(false);
    }
  };

  const canStart = leftSelected.length > 0 && rightSelected.length > 0;
  const totalPairs = leftSelected.length * rightSelected.length;
  const options = kind === "count" ? countModes : timedModes;
  const summary =
    sessionMode === "endless"
      ? "Endless session"
      : sessionMode.startsWith("timed:")
        ? `${timedModes.find((m) => m.value === sessionMode)?.label} challenge`
        : `${sessionMode} questions`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-6 xl:grid-cols-1">
        <NumberPicker
          title="First number"
          description="Numbers that can appear on the left of ×."
          selected={leftSelected}
          onChange={setLeftSelected}
        />
        <NumberPicker
          title="Second number"
          description="Numbers that can appear on the right of ×."
          selected={rightSelected}
          onChange={setRightSelected}
        />
      </div>

      <aside className="rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto" aria-label="Session options">
        <h2 className="text-[15px] font-semibold tracking-tight">Session</h2>

        <div role="tablist" aria-label="Session type" className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {([
            { id: "count", label: "Questions", icon: ListOrdered },
            { id: "timed", label: "Timed", icon: Timer },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={kind === id}
              onClick={() => switchKind(id)}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                kind === id ? "bg-background text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={kind === "count" ? "Number of questions" : "Duration"}>
          {options.map(({ value, label }) => (
            <Chip key={value} active={sessionMode === value} onClick={() => setSessionMode(value)} className="gap-1">
              {value === "endless" && <InfinityIcon className="size-3.5" />}
              {label}
            </Chip>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {kind === "count"
            ? "Finish a fixed number of questions, or practise endlessly and end whenever you like."
            : "Answer as many as you can before the clock runs out. Beat your personal best."}
        </p>

        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Format</dt>
            <dd className="font-medium">{summary}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Question pool</dt>
            <dd className="font-mono font-medium tabular-nums">{totalPairs} pairs</dd>
          </div>
        </dl>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {!canStart && (
          <p role="status" className="mt-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
            Select at least one number on each side to begin.
          </p>
        )}

        <Button size="xl" className="mt-5 w-full" onClick={handleStart} disabled={!canStart || isStarting}>
          {isStarting ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              Starting…
            </>
          ) : (
            <>
              Start practice
              <ArrowRight />
            </>
          )}
        </Button>

        <div className="mt-3 border-t border-border pt-4">
          <ReviewButton source={{ reviewRecentDays: 7 }} label="Review mistakes from the last 7 days" variant="outline" className="w-full" />
        </div>
      </aside>
    </div>
  );
}
