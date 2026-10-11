"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { guestFetch } from "@/lib/guest/api";
import { loadSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";

import type { Skill } from "@/lib/skills/types";

/** Where the mistakes come from: one session, or the last few days (optionally narrowed to a skill and exercise type). */
export type ReviewSource =
  | { reviewSessionId: number }
  | { reviewRecentDays: number; skill?: Skill; exerciseType?: string };

interface ReviewButtonProps {
  source: ReviewSource;
  label: string;
  variant?: "primary" | "outline";
  className?: string;
  /** Guest mistakes are read from this browser, not the server. */
  guest?: boolean;
}

/** Starts a review session made of the questions answered wrong in the given source. */
export default function ReviewButton({ source, label, variant = "primary", className, guest = false }: ReviewButtonProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { weakFocusPercent, recentWindow, questionTimeLimit } = loadSettings();
      const res = await (guest ? guestFetch : fetch)("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "review",
          weakFocusPercent,
          recentWindow,
          questionTimeLimitSeconds: questionTimeLimit,
          ...source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === "No mistakes to review" ? "No mistakes to review yet." : "Could not start the review.");
        setStarting(false);
        return;
      }
      router.push(`/practice/${data.id}`);
    } catch (err) {
      console.error(err);
      setError("Could not start the review.");
      setStarting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant === "primary" ? "default" : "outline"}
        onClick={start}
        disabled={starting}
        className={className}
      >
        <RotateCcw />
        {starting ? "Starting…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
