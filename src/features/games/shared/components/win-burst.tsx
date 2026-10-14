import type { ReactNode } from "react";
import { Crown, LayoutTemplate, Route } from "lucide-react";
import { accentStyle } from "@/components/common/accent-tile";
import type { AccentId } from "@/lib/accent";

/** How long the burst plays before the win card opens (the card waits for it; see puzzle-app.tsx). */
export const BURST_MS = 1600;

const ICONS: Partial<Record<AccentId, ReactNode>> = {
  queens: <Crown className="win-burst-icon" strokeWidth={1.75} aria-hidden />,
  zip: <Route className="win-burst-icon" strokeWidth={1.75} aria-hidden />,
  patches: <LayoutTemplate className="win-burst-icon" strokeWidth={1.75} aria-hidden />,
};

/**
 * The win animation on the board itself: the game's symbol, a giant crown for Queens, a giant route mark for Zip and a giant patchwork mark for Patches,
 * springs up over the solved board, holds for a moment and fades. Purely decorative (`aria-hidden`), and not shown at
 * all for people who prefer reduced motion. Place it inside the board's relatively positioned square.
 */
export function WinBurst({ accent }: { accent: AccentId }) {
  return (
    <div className="win-burst" data-accent={accent} style={accentStyle(accent)} aria-hidden>
      {ICONS[accent]}
    </div>
  );
}
