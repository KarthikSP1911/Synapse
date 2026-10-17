"use client";

import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small "?" that opens a short explanation only when asked for, so the screen stays quiet. Anything that changes the rules
 * (such as "Game Over doesn't save") belongs in a visible line instead, not in here.
 */
export function HelpTip({ label, children, className }: { /** What it explains, for the button's name: "Help: Adaptive n". */ label: string; children: ReactNode; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Help: ${label}`}
        className={cn(
          "inline-grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors pointer-coarse:size-9",
          "hover:text-foreground data-popup-open:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          className
        )}
      >
        <CircleHelp aria-hidden className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={12} className="z-[80]">
          <Popover.Popup
            className={cn(
              "max-w-72 origin-(--transform-origin) rounded-lg border border-border bg-card p-3 text-[13px] leading-relaxed text-card-foreground shadow-pop outline-none",
              "transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
            )}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
