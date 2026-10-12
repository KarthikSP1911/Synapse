import type { CSSProperties } from "react";
import { Brain, Zap, type LucideIcon } from "lucide-react";
import { SKILL_ICONS } from "@/components/skill-icon";
import { cn } from "@/lib/utils";
import { ACCENT, type AccentId } from "@/lib/skills/accent";

/** Symbols for everything that gets a tile. Sudoku has a colour but no page yet, so it has no symbol. */
const ICONS: Record<Exclude<AccentId, "sudoku">, LucideIcon> = {
  ...SKILL_ICONS,
  mindsprint: Zap,
  recall: Brain,
};

/** Puts an item's accent on an element, so `AccentTile` and `.accent-label` inside it can read `--accent`. */
export const accentStyle = (id: AccentId): CSSProperties => ({ "--accent": ACCENT[id] }) as CSSProperties;

/**
 * The rounded-square icon used on hub cards and page headers. Its three states live in `globals.css` (`.accent-tile`):
 *
 * - inactive: dark tile, accent-coloured symbol, no outline;
 * - hover: the same as active, but only while an ancestor marked `data-accent-host` is hovered or keyboard-focused
 *   (hover is ignored on touch screens);
 * - active (`active`): accent-filled tile, near-black symbol and one thin outline.
 */
export function AccentTile({ id, active = false, className }: { id: Exclude<AccentId, "sudoku">; active?: boolean; className?: string }) {
  const Icon = ICONS[id];
  return (
    <span className={cn("accent-tile", className)} data-active={active} style={accentStyle(id)}>
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}
