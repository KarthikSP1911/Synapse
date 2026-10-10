"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { MAX_RECENT_WINDOW, MAX_WEAK_FOCUS_PERCENT } from "@/lib/validation";

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
    <div className="space-y-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Training Behavior</CardTitle>
          <CardDescription>Adjust how the adaptive algorithm selects questions. Applies to new sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="weak-focus" className="text-base">Focus on weaknesses</Label>
              <span className="text-sm font-semibold tabular-nums">{settings.weakFocusPercent}%</span>
            </div>
            <input
              id="weak-focus"
              type="range"
              min={0}
              max={MAX_WEAK_FOCUS_PERCENT}
              step={5}
              value={settings.weakFocusPercent}
              onChange={(e) => update({ weakFocusPercent: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <p className="text-sm text-muted-foreground">Share of questions drawn from your historically weakest pairs (0 turns it off).</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="recent-window" className="text-base">Avoid repeating the last</Label>
              <span className="text-sm font-semibold tabular-nums">
                {settings.recentWindow} {settings.recentWindow === 1 ? "question" : "questions"}
              </span>
            </div>
            <input
              id="recent-window"
              type="range"
              min={0}
              max={MAX_RECENT_WINDOW}
              step={1}
              value={settings.recentWindow}
              onChange={(e) => update({ recentWindow: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <p className="text-sm text-muted-foreground">Prevents the same pair from reappearing too soon (0 allows repeats).</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <span role="status" className="text-sm text-muted-foreground">
          {status === "saved" && "Saved"}
          {status === "failed" && "Could not save (browser storage unavailable)"}
        </span>
        <Button variant="outline" onClick={() => update(DEFAULT_SETTINGS)}>
          Reset to defaults
        </Button>
        <Button onClick={() => setStatus(saveSettings(settings) ? "saved" : "failed")}>Save settings</Button>
      </div>
    </div>
  );
}
