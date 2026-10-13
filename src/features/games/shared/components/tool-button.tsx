import { cn } from "@/lib/utils";

/** The class of the play screen's square tool buttons (Undo, Redo, Hint ...), with a 44px target on touch screens. */
export const toolButton = cn(
  "flex h-12 flex-col items-center short:h-11 sm:h-14 justify-center gap-1 rounded-lg border border-border bg-card text-[11px] font-medium text-muted-foreground shadow-card transition-[background-color,color,border-color,transform] duration-150 select-none touch-manipulation",
  "hover:border-input hover:bg-accent hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
);
