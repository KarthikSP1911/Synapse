"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ACCENT } from "@/lib/accent";
import { LIVES } from "@/features/games/nback/lib/types";

/** A 3x3 board with one lit cell, drawn small. */
function MiniBoard({ lit, label, match = false }: { lit: number; label: string; match?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={cn("grid grid-cols-3 gap-0.5 rounded-md border bg-secondary p-1", match ? "border-foreground" : "border-border")} aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={cn("size-4 rounded-[3px] sm:size-5", i === lit ? "bg-[var(--accent-nback)]" : "bg-background")} />
        ))}
      </div>
      <span className="text-center text-[11px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * A short explanation in a native modal `<dialog>`: shown once before the first session, and again from the
 * setup screen's "How it works". The example is a 2-back on the Position stream, drawn from fixed cells.
 */
export function TutorialDialog({ confirmLabel, onConfirm, onCancel }: { confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      style={{ "--accent-nback": ACCENT.nback } as React.CSSProperties}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        How N-Back works
      </h2>
      <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">1. Watch.</span> One cell lights up at a time. It can also change color and show a letter, depending on the streams you chose.
        </li>
        <li>
          <span className="font-medium text-foreground">2. Compare with n steps back.</span> If what you see now is the same as it was <em>n</em> flashes ago, press that stream&apos;s button (or its key). If not, do nothing. In a 2-back:
          <div className="mt-3 flex items-start justify-center gap-3 rounded-lg bg-muted p-3">
            <MiniBoard lit={0} label="Flash 1" />
            <MiniBoard lit={4} label="Flash 2" />
            <MiniBoard lit={0} label="Flash 3: same as 2 back. Press!" match />
          </div>
        </li>
        <li>
          <span className="font-medium text-foreground">3. Mind your lives.</span> You have {LIVES} hearts. A flash with a missed match or a press with no match costs one heart, however many streams were wrong. The first <em>n</em> flashes are only for watching and never cost a heart. No hearts left ends the session.
        </li>
      </ol>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
