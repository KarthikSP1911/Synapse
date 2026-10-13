"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * A yes/no question in a native modal `<dialog>`: the browser traps focus inside it, closes it on Escape and
 * returns focus to the button that opened it. The safe answer has the initial focus.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Keep playing",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // showModal focuses the first button, which is the destructive one; the safe answer should have the focus.
      dialog.querySelector<HTMLElement>("[data-cancel]")?.focus();
    }
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      // Escape fires "cancel"; closing by any other route (backdrop) is not offered.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-card p-5 text-card-foreground shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p id={`${id}-message`} className="mt-1.5 text-sm text-muted-foreground">
        {message}
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="outline" onClick={onCancel} data-cancel>
          {cancelLabel}
        </Button>
      </div>
    </dialog>
  );
}
