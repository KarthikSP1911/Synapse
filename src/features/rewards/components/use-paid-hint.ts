"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ECONOMY } from "@/features/rewards/lib/economy";
import { useWallet } from "@/features/rewards/components/use-wallet";
import { requestHint, type HintCharge } from "@/features/rewards/lib/service";
import type { FailureReason } from "@/features/rewards/lib/types";

/**
 * The one hint mechanism every hint-enabled game and drill uses. A game asks the pure question "is there a hint to give?"
 * itself; only if there is does it call `request`, and it shows the hint only when `request` says ok. The charge and the
 * cooldown are checked and saved inside `request` (see `requestHint`), against the wallet in storage, so clicking fast,
 * pressing the shortcut, tapping twice or reloading cannot get around either of them: this hook only reads the cooldown
 * back to draw the countdown.
 *
 * `chargeScope` identifies what a hint is charged against (one attempt at a puzzle, one question of a drill) and
 * `cooldownScope` what shares a cooldown (the puzzle, the whole practice session); null while there is nothing to hint at.
 */

export interface HintFeedback {
  text: string;
  reason: FailureReason;
}

export interface PaidHint {
  cost: number;
  balance: number;
  canAfford: boolean;
  /** Milliseconds until the next hint may be delivered; 0 when it may. */
  cooldownLeftMs: number;
  coolingDown: boolean;
  /** Whole seconds left, rounded up (4 while 3.2s remain), for "Hint available in 4s". */
  cooldownSeconds: number;
  /** Why the last request was refused; cleared by the next success and after a few seconds. */
  feedback: HintFeedback | null;
  /** Charges for hint number `ordinal` of this scope and starts the cooldown. Show the hint only if the result is ok. */
  request: (ordinal: number) => HintCharge;
}

const FEEDBACK_MS = 6000;

export function usePaidHint({ chargeScope, cooldownScope }: { chargeScope: string | null; cooldownScope: string | null }): PaidHint {
  const { store, wallet, balance } = useWallet();
  const [feedback, setFeedback] = useState<HintFeedback | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const readyAt = cooldownScope ? (wallet.cooldowns[cooldownScope] ?? 0) : 0;
  // A clock set backwards cannot make the wait longer than the cooldown itself.
  const cooldownLeftMs = readyAt > now ? Math.min(ECONOMY.hint.cooldownMs, readyAt - now) : 0;

  // Redraws the countdown while one is running, and not at all otherwise.
  useEffect(() => {
    if (readyAt === 0) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [readyAt]);

  useEffect(() => () => clearTimeout(clearTimer.current), []);

  const request = useCallback(
    (ordinal: number): HintCharge => {
      if (chargeScope === null || cooldownScope === null) return { ok: false, reason: "invalid", message: "There is nothing to give a hint for yet." };
      const result = requestHint(store, { chargeScope, cooldownScope, ordinal });
      clearTimeout(clearTimer.current);
      if (result.ok) {
        setFeedback(null);
        setNow(Date.now());
      } else {
        setFeedback({ text: result.message, reason: result.reason });
        clearTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
      }
      return result;
    },
    [store, chargeScope, cooldownScope]
  );

  return {
    cost: ECONOMY.hint.cost,
    balance,
    canAfford: balance >= ECONOMY.hint.cost,
    cooldownLeftMs,
    coolingDown: cooldownLeftMs > 0,
    cooldownSeconds: Math.ceil(cooldownLeftMs / 1000),
    feedback,
    request,
  };
}

/** The scope strings for a puzzle attempt. Restarting gives the game a new start time, so a restarted puzzle is a new attempt that pays for its own hints. */
export const puzzleHintScope = (game: "queens" | "zip" | "sudoku" | "patches", state: { clientId: string; startedAt: number }): string => `${game}:${state.clientId}:${state.startedAt}`;
