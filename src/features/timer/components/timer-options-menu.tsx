"use client";

import { useEffect, useRef } from "react";
import { Plus, Square } from "lucide-react";

/** Opened by a long-press, a right-click, the Menu key or the ⋯ button on a running timer. */
export function TimerOptionsMenu({ canExtend, onExtend, onStop }: { canExtend: boolean; onExtend: () => void; onStop: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      event.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
  };

  const item = "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11";

  return (
    <div ref={rootRef} role="menu" aria-label="Study timer options" onKeyDown={onKeyDown} className="w-44 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-pop">
      {canExtend && (
        <button type="button" role="menuitem" className={item} onClick={onExtend}>
          <Plus className="size-4" aria-hidden /> Add 5 min
        </button>
      )}
      <button type="button" role="menuitem" className={`${item} text-destructive`} onClick={onStop}>
        <Square className="size-4" aria-hidden /> Stop timer
      </button>
    </div>
  );
}
