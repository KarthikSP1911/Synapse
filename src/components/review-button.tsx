"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { loadSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";

type ReviewSource = { reviewSessionId: number } | { reviewRecentDays: number };

interface ReviewButtonProps {
  source: ReviewSource;
  label: string;
  variant?: "primary" | "outline";
  className?: string;
}

/** Starts a review session made of the pairs answered wrong in the given source. */
export default function ReviewButton({ source, label, variant = "primary", className }: ReviewButtonProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { weakFocusPercent, recentWindow } = loadSettings();
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "review", weakFocusPercent, recentWindow, ...source }),
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
