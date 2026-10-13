"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A bottom sheet in a native modal `<dialog>` for the actions a phone has no room for on the play screen. The browser
 * traps focus in it and closes it on Escape; a tap on the dimmed area behind it closes it too.
 */
export function MoreSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
        onClose();
      }}
      // A click that lands on the dialog itself, not on something inside it, is a tap on the backdrop.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl rounded-b-none border border-b-0 border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-sm sm:inset-x-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 space-y-5">{children}</div>
      <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
        Close
      </Button>
    </dialog>
  );
}
