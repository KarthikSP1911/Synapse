"use client";

import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/form/choice-controls";
import { Button } from "@/components/ui/button";
import { parseMinutes } from "@/features/timer/lib/duration";
import { loadLastMinutes } from "@/features/timer/lib/storage";
import { MAX_MINUTES, MIN_MINUTES, PRESET_MINUTES } from "@/features/timer/lib/types";

/** Opened from the idle widget. Choosing a length starts the timer. */
export function TimerSetupPopover({ onStart }: { onStart: (minutes: number) => void }) {
  // Opens after the page is up, so reading the device here cannot disagree with the server render.
  const [last] = useState(loadLastMinutes);
  const lastIsPreset = last !== null && (PRESET_MINUTES as readonly number[]).includes(last);
  const [custom, setCustom] = useState(last !== null && !lastIsPreset);
  const [text, setText] = useState(last !== null && !lastIsPreset ? String(last) : "");
  const [problem, setProblem] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = rootRef.current?.querySelector<HTMLElement>("input") ?? rootRef.current?.querySelector<HTMLElement>("button[aria-pressed='true']") ?? rootRef.current?.querySelector<HTMLElement>("button");
    target?.focus();
  }, []);

  // Choosing Custom puts the cursor straight into the field.
  useEffect(() => {
    if (custom) rootRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, [custom]);

  const submitCustom =(event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseMinutes(text);
    if (!parsed.ok) {
      setProblem(parsed.reason);
      return;
    }
    onStart(parsed.minutes);
  };

  return (
    <div ref={rootRef} role="dialog" aria-label="Start a study timer" className="w-60 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-pop">
      <p className="text-sm font-medium">Study timer</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Pick a length to start. It keeps counting on every page.</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {PRESET_MINUTES.map((minutes) => (
          <Chip key={minutes} active={!custom && last === minutes} onClick={() => onStart(minutes)} className="px-0">
            {minutes} min
          </Chip>
        ))}
        <Chip
          active={custom}
          onClick={() => {
            setCustom((open) => !open);
            setProblem(null);
          }}
          className="px-0"
        >
          Custom
        </Chip>
      </div>
      {custom && (
        <form onSubmit={submitCustom} className="mt-2.5 space-y-1.5" noValidate>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label={`Custom length in minutes, ${MIN_MINUTES} to ${MAX_MINUTES}`}
              aria-invalid={problem !== null || undefined}
              aria-describedby={problem ? "st-custom-problem" : undefined}
              value={text}
              placeholder={`${MIN_MINUTES}–${MAX_MINUTES}`}
              onChange={(e) => {
                setText(e.target.value.replace(/[^\d]/g, "").slice(0, 3));
                setProblem(null);
              }}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-center font-mono text-sm tabular-nums outline-none focus:border-foreground focus:ring-2 focus:ring-ring/30 pointer-coarse:h-11"
            />
            <span className="text-xs text-muted-foreground">min</span>
            <Button type="submit" size="sm">
              Start
            </Button>
          </div>
          {problem && (
            <p id="st-custom-problem" role="alert" className="text-xs text-destructive">
              {problem}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
