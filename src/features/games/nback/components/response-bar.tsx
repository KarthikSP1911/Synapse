"use client";

import { Check, Crosshair, Palette, Type, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STREAM_KEY } from "@/features/games/nback/lib/keys";
import { STREAMS, STREAM_BIT, STREAM_LABEL, type NBackConfig, type StreamId } from "@/features/games/nback/lib/types";
import type { FeedbackMark } from "./use-nback-session";

const ICON: Record<StreamId, LucideIcon> = { position: Crosshair, color: Palette, letter: Type };

/**
 * One large button per active stream: "this one matches the one n back". A press is acknowledged straight away
 * (a quick dip in opacity that settles back to normal, see `.nb-response` in globals.css), which says nothing about whether it was right. Only with per-trial feedback on does a
 * button then show a tick or a cross with a word, so correctness never rests on colour alone.
 * Touch and mouse respond on press, not release, so the stored time is when the finger came down; a keyboard
 * activation (Enter or Space on a focused button, `detail === 0`) responds on click.
 */
export function ResponseBar({
  streams,
  pressedMask,
  feedback,
  disabled,
  onRespond,
}: {
  streams: NBackConfig["streams"];
  pressedMask: number;
  feedback: FeedbackMark | null;
  disabled: boolean;
  onRespond: (stream: StreamId, timestamp: number) => void;
}) {
  const active = STREAMS.filter((s) => streams[s]);
  return (
    <div data-timer-clear className="nb-responses grid shrink-0 gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${active.length}, minmax(0, 1fr))` }} role="group" aria-label="Mark a match">
      {active.map((stream) => {
        const Icon = ICON[stream];
        const pressed = (pressedMask & STREAM_BIT[stream]) !== 0;
        const result = feedback?.results[stream];
        return (
          <button
            key={stream}
            type="button"
            disabled={disabled}
            aria-pressed={pressed}
            aria-keyshortcuts={STREAM_KEY[stream]}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              // Responding on press: keep the button from taking focus, so a later key press still goes to the game.
              event.preventDefault();
              onRespond(stream, event.timeStamp);
            }}
            onClick={(event) => {
              if (event.detail === 0) onRespond(stream, event.timeStamp);
            }}
            className={cn(
              "nb-response relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-2 text-center font-semibold select-none touch-manipulation sm:min-h-20",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
              "border-border bg-card hover:border-input hover:bg-accent",
              result && (result.correct ? "border-success" : "border-destructive")
            )}
          >
            <span className="flex items-center gap-1.5 text-[15px] leading-none">
              <Icon className="size-4 shrink-0" aria-hidden />
              {STREAM_LABEL[stream]}
            </span>
            <span className="flex h-4 items-center gap-1 text-[11px] font-medium leading-none" aria-hidden={!result}>
              {result ? (
                result.correct ? (
                  <span className="flex items-center gap-0.5 text-success">
                    <Check className="size-3.5" aria-hidden /> Correct
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-destructive">
                    <X className="size-3.5" aria-hidden /> Wrong
                  </span>
                )
              ) : (
                <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] opacity-70">{STREAM_KEY[stream]}</kbd>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
