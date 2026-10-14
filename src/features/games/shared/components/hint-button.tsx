"use client";

import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { toolButton } from "@/features/games/shared/components/tool-button";
import { CoinIcon, coinsLabel } from "@/features/rewards/components/coin-icon";
import type { PaidHint } from "@/features/rewards/components/use-paid-hint";

/** What assistive technology hears for the Hint button. */
export const hintLabel = (hint: PaidHint): string => (hint.coolingDown ? `Hint available in ${hint.cooldownSeconds}s` : `Hint, ${coinsLabel(hint.cost)}`);

/**
 * The Hint tool button of a puzzle screen: its price in a small corner badge, and the seconds left while it cools down.
 * It stays focusable while cooling down (`aria-disabled`, not `disabled`) so a keyboard user does not lose their place; a
 * press then is refused by the wallet and says why. The price and cooldown are enforced by the wallet, not by this button.
 */
export function HintToolButton({ hint, onClick, disabled }: { hint: PaidHint; onClick: () => void; disabled?: boolean }) {
  const blocked = hint.coolingDown;
  return (
    <button
      type="button"
      className={cn(toolButton, "relative", blocked && "opacity-60")}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={blocked || undefined}
      aria-label={hintLabel(hint)}
      title={blocked ? `Hint available in ${hint.cooldownSeconds}s` : `Hint costs ${coinsLabel(hint.cost)}`}
    >
      <Lightbulb className="size-5" aria-hidden />
      <span className="tabular-nums">{blocked ? `${hint.cooldownSeconds}s` : "Hint"}</span>
      {!blocked && (
        <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 font-mono text-[10px] leading-none text-warning" aria-hidden>
          <CoinIcon className="size-2.5" />
          {hint.cost}
        </span>
      )}
    </button>
  );
}
