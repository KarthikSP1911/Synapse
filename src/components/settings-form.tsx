"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { MAX_RECENT_WINDOW, MAX_WEAK_FOCUS_PERCENT } from "@/lib/validation";

function SliderField({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  help,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  help: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <span className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs font-medium tabular-nums">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-foreground"
      />
      <p className="text-sm text-muted-foreground">{help}</p>
    </div>
  );
}

export default function SettingsForm() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  // Read from localStorage after mount to avoid a server/client hydration mismatch.
  useEffect(() => {
    const timer = setTimeout(() => setSettings(loadSettings()), 0);
    return () => clearTimeout(timer);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setStatus("idle");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Training behaviour</CardTitle>
          <CardDescription>Adjust how the adaptive algorithm selects questions. Applies to new sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <SliderField
            id="weak-focus"
            label="Focus on weaknesses"
            value={settings.weakFocusPercent}
            display={`${settings.weakFocusPercent}%`}
            min={0}
            max={MAX_WEAK_FOCUS_PERCENT}
            step={5}
            help="Share of questions drawn from your historically weakest pairs (0 turns it off)."
            onChange={(v) => update({ weakFocusPercent: v })}
          />
          <div className="border-t border-border" />
          <SliderField
            id="recent-window"
            label="Avoid repeating the last"
            value={settings.recentWindow}
            display={`${settings.recentWindow} ${settings.recentWindow === 1 ? "question" : "questions"}`}
            min={0}
            max={MAX_RECENT_WINDOW}
            step={1}
            help="Prevents the same pair from reappearing too soon (0 allows repeats)."
            onChange={(v) => update({ recentWindow: v })}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span role="status" className="mr-auto text-sm">
          {status === "saved" && (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Check className="size-4" /> Saved
            </span>
          )}
          {status === "failed" && <span className="text-destructive">Could not save (browser storage unavailable)</span>}
        </span>
        <Button variant="outline" onClick={() => update(DEFAULT_SETTINGS)}>
          Reset to defaults
        </Button>
        <Button onClick={() => setStatus(saveSettings(settings) ? "saved" : "failed")}>Save settings</Button>
      </div>
    </div>
  );
}
