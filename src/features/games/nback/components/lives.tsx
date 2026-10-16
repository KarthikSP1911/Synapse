import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIVES } from "@/features/games/nback/lib/types";

/**
 * The hearts. A life that is gone is an empty outline, a life that is left is solid, so the count never depends on
 * colour. `flash` is the heart that emptied last; it pulses once (see `.nb-heart` in globals.css).
 */
export function Lives({ lives, flash = null, className }: { lives: number; flash?: number | null; className?: string }) {
  return (
    <span role="img" aria-label={`${lives} of ${LIVES} lives left`} className={cn("inline-flex items-center gap-1", className)}>
      {Array.from({ length: LIVES }, (_, i) => {
        const alive = i < lives;
        return <Heart key={i} aria-hidden className={cn("nb-heart size-5", alive ? "fill-destructive text-destructive" : "text-muted-foreground")} data-flash={flash === i && !alive ? "true" : undefined} />;
      })}
    </span>
  );
}
