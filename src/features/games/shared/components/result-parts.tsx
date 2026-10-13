import type { ReactNode } from "react";
import { RotateCcw, SlidersHorizontal, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The pieces every game's end-of-game screen is built from, so the screens read the same. */

/** Whether the finished game could be written to this device's storage. */
export type SaveState = "saved" | "failed";

/** The line under a result: confirms the save, or warns that the game is not in the player's history. */
export function SaveStatus({ state, noun, className }: { state: SaveState; noun: "game" | "session"; className?: string }) {
  return (
    <p role="status" className={cn("text-xs", state === "failed" ? "text-warning" : "text-muted-foreground", className)}>
      {state === "saved" ? "Saved to your progress." : `This ${noun} could not be saved: the browser's storage is full or blocked.`}
    </p>
  );
}

/** A green "new record" message. Set `announce={false}` when an enclosing element is already the live region. */
export function RecordBanner({ children, announce = true }: { children: ReactNode; announce?: boolean }) {
  return (
    <p role={announce ? "status" : undefined} className="animate-pop flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success">
      <Trophy className="size-4" aria-hidden />
      {children}
    </p>
  );
}

/** The two header actions of a result screen: pick different settings (outline), or go again (primary, focused). */
export function ResultActions({ onChange, onReplay, changeLabel = "Change setup" }: { onChange: () => void; onReplay: () => void; changeLabel?: string }) {
  return (
    <>
      <Button variant="outline" onClick={onChange}>
        <SlidersHorizontal /> {changeLabel}
      </Button>
      <Button onClick={onReplay} autoFocus>
        <RotateCcw /> Play again
      </Button>
    </>
  );
}
