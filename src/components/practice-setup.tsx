"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadSettings } from "@/lib/settings";
import ReviewButton from "@/components/review-button";

const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
const sessionModes = [
  { value: "endless", label: "∞ Endless" },
  { value: "10",      label: "10 Qs" },
  { value: "20",      label: "20 Qs" },
  { value: "30",      label: "30 Qs" },
  { value: "50",      label: "50 Qs" },
  { value: "100",     label: "100 Qs" },
] as const;

const timedModes = [
  { value: "timed:30",  label: "30 sec" },
  { value: "timed:60",  label: "60 sec" },
  { value: "timed:120", label: "2 min" },
] as const;

function NumberGrid({ selected, onToggle, onSelectAll, onClearAll }: {
  selected: number[];
  onToggle: (n: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {numbers.map((n) => {
          const isSelected = selected.includes(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(n)}
              className={cn(
                "h-8 w-full rounded-md font-mono text-xs font-semibold transition-all duration-150 select-none",
                "border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(59,130,246,0.5)] scale-[1.05]"
                  : "bg-muted text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-secondary"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="flex-1 h-8 text-xs font-medium rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={onClearAll}
          className="flex-1 h-8 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default function PracticeSetup() {
  const router = useRouter();
  const [leftSelected, setLeftSelected] = useState<number[]>(numbers);
  const [rightSelected, setRightSelected] = useState<number[]>(numbers);
  const [sessionMode, setSessionMode] = useState<string>("20");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLeft  = (n: number) => setLeftSelected(prev  => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  const toggleRight = (n: number) => setRightSelected(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const handleStart = async () => {
    if (leftSelected.length === 0 || rightSelected.length === 0) return;
    setIsStarting(true);
    setError(null);
    try {
      const isTimed = sessionMode.startsWith("timed:");
      const mode  = isTimed ? "timed" : sessionMode === "endless" ? "endless" : "fixed";
      const count = mode === "fixed" ? parseInt(sessionMode, 10) : null;
      const durationSeconds = isTimed ? parseInt(sessionMode.slice(6), 10) : null;
      const { weakFocusPercent, recentWindow } = loadSettings();
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, targetQuestionCount: count, durationSeconds, weakFocusPercent, recentWindow, selectedLeftNumbers: leftSelected, selectedRightNumbers: rightSelected }),
      });
      if (!response.ok) throw new Error("Failed to start session");
      const session = await response.json();
      router.push(`/practice/${session.id}`);
    } catch (error) {
      console.error(error);
      setError("Could not start the session. Please try again.");
      setIsStarting(false);
    }
  };

  const canStart = leftSelected.length > 0 && rightSelected.length > 0;
  const totalPairs = leftSelected.length * rightSelected.length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Number selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Left Numbers</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{leftSelected.length} selected</p>
            </div>
            <span className="inline-flex items-center justify-center h-7 px-2.5 rounded-full bg-primary/15 text-primary text-xs font-semibold">
              Left operand
            </span>
          </div>
          <NumberGrid
            selected={leftSelected}
            onToggle={toggleLeft}
            onSelectAll={() => setLeftSelected(numbers)}
            onClearAll={() => setLeftSelected([])}
          />
        </div>

        {/* Right */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Right Numbers</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{rightSelected.length} selected</p>
            </div>
            <span className="inline-flex items-center justify-center h-7 px-2.5 rounded-full bg-primary/15 text-primary text-xs font-semibold">
              Right operand
            </span>
          </div>
          <NumberGrid
            selected={rightSelected}
            onToggle={toggleRight}
            onSelectAll={() => setRightSelected(numbers)}
            onClearAll={() => setRightSelected([])}
          />
        </div>
      </div>

      {/* Session length + Start */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Session Type</h3>
          {canStart && (
            <span className="text-xs text-muted-foreground">
              {totalPairs} pairs selected
            </span>
          )}
        </div>

        {[
          { title: "Question count", options: sessionModes },
          { title: "Timed challenge", options: timedModes },
        ].map(({ title, options }) => (
          <div key={title} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="flex flex-wrap gap-2">
              {options.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sessionMode === value}
                  onClick={() => setSessionMode(value)}
                  className={cn(
                    "h-9 px-4 rounded-lg text-sm font-medium transition-all duration-150 border",
                    sessionMode === value
                      ? "bg-primary text-primary-foreground border-primary shadow-[0_0_14px_rgba(59,130,246,0.45)]"
                      : "bg-muted text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Review</p>
          <ReviewButton
            source={{ reviewRecentDays: 7 }}
            label="Review mistakes from the last 7 days"
            variant="outline"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart || isStarting}
          className={cn(
            "w-full h-14 rounded-xl text-base font-bold tracking-wide transition-all duration-200",
            "flex items-center justify-center gap-2",
            canStart && !isStarting
              ? "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_24px_rgba(59,130,246,0.45)] hover:shadow-[0_0_36px_rgba(59,130,246,0.65)] active:scale-[0.98]"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
          )}
        >
          {isStarting ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Zap className="h-5 w-5" />
              Start Practice
            </>
          )}
        </button>
      </div>
    </div>
  );
}
