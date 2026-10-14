"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { CoinIcon, coinsLabel, formatCoins } from "@/features/rewards/components/coin-icon";
import type { PaidHint } from "@/features/rewards/components/use-paid-hint";

/** Why the last hint was refused, announced politely, with a way to the Rewards Shop when the coins ran out. Renders nothing otherwise. */
export function HintFeedback({ hint, className }: { hint: PaidHint; className?: string }) {
  const broke = hint.feedback?.reason === "insufficient";
  return (
    <p role="status" aria-live="polite" className={cn(hint.feedback ? "text-xs leading-4 text-foreground" : "sr-only", className)}>
      {hint.feedback?.text}
      {broke && (
        <>
          {" "}
          {/* A new tab, so the game or session in progress is not left. */}
          <Link href="/rewards" target="_blank" rel="noopener" className="font-medium text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Rewards Shop
          </Link>
        </>
      )}
    </p>
  );
}

/**
 * A single quiet line under the tool buttons of a puzzle: the price and the balance, then the cooldown while one runs, or the
 * reason a hint was refused. Refusals are announced; the countdown is not, so a screen reader is not interrupted every second.
 */
export function HintStatusLine({ hint, className }: { hint: PaidHint; className?: string }) {
  return (
    <div className={cn("min-h-4 text-xs leading-4 text-muted-foreground", className)}>
      <HintFeedback hint={hint} />
      {!hint.feedback && (
        <p className="flex items-center gap-1.5">
          {hint.coolingDown ? <span>Hint available in {hint.cooldownSeconds}s</span> : <span>Hint · {coinsLabel(hint.cost)}</span>}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <CoinIcon className="size-3" />
            <span className="font-mono tabular-nums">{formatCoins(hint.balance)}</span>
            <span className="sr-only"> coins in your wallet</span>
          </span>
        </p>
      )}
    </div>
  );
}
