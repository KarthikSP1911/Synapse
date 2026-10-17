"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Check, CloudOff, Lightbulb, LoaderCircle, Shield, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useViewerInfo } from "@/features/auth/components/viewer-provider";
import { dayKey } from "@/features/progress/lib/activity";
import { browserTimeZone } from "@/features/progress/lib/streak";
import { CoinIcon, coinsLabel, formatCoins } from "@/features/rewards/components/coin-icon";
import { useWallet } from "@/features/rewards/components/use-wallet";
import { ECONOMY } from "@/features/rewards/lib/economy";
import { balanceOf } from "@/features/rewards/lib/ledger";
import { buyShieldLocally } from "@/features/rewards/lib/service";
import { purchaseShieldOnline, syncWallet } from "@/features/rewards/lib/sync";
import type { LedgerEntry, TransactionType } from "@/features/rewards/lib/types";
import { loadWallet, pendingEntries } from "@/features/rewards/lib/wallet-store";

const PAGE_SIZE = 20;

type Status = { kind: "idle" } | { kind: "buying" } | { kind: "success"; message: string } | { kind: "error"; message: string };

const TYPE_LABEL: Record<TransactionType, string> = {
  earning: "Earned",
  spending: "Spent",
  purchase: "Purchase",
  hint_charge: "Hint",
  refund: "Refund",
  shield_use: "Shield used",
};

const prettyDay = (day: string): string => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

const prettyTime = (at: number): string => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const newPurchaseId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `buy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** Pips showing how full the shield inventory is. */
function ShieldPips({ owned, max }: { owned: number; max: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <Shield key={i} className={cn("size-5", i < owned ? "fill-link/20 text-link" : "text-border")} />
      ))}
    </div>
  );
}

function TransactionRow({ entry }: { entry: LedgerEntry }) {
  const gain = entry.amount > 0;
  const none = entry.amount === 0;
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", gain ? "bg-success-soft text-success" : none ? "bg-secondary text-link" : "bg-secondary text-muted-foreground")} aria-hidden>
        {entry.type === "shield_use" || entry.type === "purchase" ? <ShieldCheck className="size-4" /> : entry.type === "hint_charge" ? <Lightbulb className="size-4" /> : gain ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.reason}</p>
        <p className="truncate text-xs text-muted-foreground">
          {TYPE_LABEL[entry.type]} · {prettyTime(entry.at)}
          {entry.pending && " · waiting to sync"}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("font-mono text-sm font-semibold tabular-nums", gain && "text-success")}>{none ? "—" : `${gain ? "+" : "−"}${formatCoins(Math.abs(entry.amount))}`}</p>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          <span className="sr-only">Balance after: </span>
          {formatCoins(entry.balanceAfter)}
        </p>
      </div>
    </li>
  );
}

const earningRows: { what: string; coins: string }[] = [
  { what: "A correct practice answer", coins: `${ECONOMY.practice.correctAnswer}` },
  { what: `A practice session finished (${ECONOMY.practice.minAnsweredForBonus}+ answered, ${ECONOMY.practice.minAccuracyPercentForBonus}%+ right)`, coins: `${ECONOMY.practice.sessionBonus} bonus` },
  { what: "A correct MindSprint round", coins: `${ECONOMY.mindsprint.correctRound}` },
  { what: `A MindSprint session finished (${ECONOMY.mindsprint.minRoundsForBonus}+ rounds, ${ECONOMY.mindsprint.minAccuracyPercentForBonus}%+ right)`, coins: `${ECONOMY.mindsprint.sessionBonus} bonus` },
  { what: "A correct Number Recall round", coins: `${ECONOMY.recall.correctRound}` },
  { what: `A Number Recall session finished (${ECONOMY.recall.minRoundsForBonus}+ rounds, ${ECONOMY.recall.minAccuracyPercentForBonus}%+ right)`, coins: `${ECONOMY.recall.sessionBonus} bonus` },
  { what: "A solved Sudoku, Queens, Zip or Patches, or an N-Back session played to the end", coins: `${ECONOMY.puzzle.easy} / ${ECONOMY.puzzle.medium} / ${ECONOMY.puzzle.hard} / ${ECONOMY.puzzle.expert} (Easy / Medium / Hard / Expert)` },
  { what: "A 2048 run, by its highest tile", coins: ECONOMY.game2048.byHighestTile.map(([tile, coins]) => `${tile}: ${coins}`).join(" · ") },
];

export function RewardsShop() {
  const viewer = useViewerInfo();
  const { store, wallet, balance, shields, ready } = useWallet();
  const userId = viewer.kind === "user" ? viewer.userId : null;

  const [refresh, setRefresh] = useState<"loading" | "done" | "failed">(userId === null ? "done" : "loading");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  /** One token per purchase attempt: a retry after a failed request reuses it, so it can never buy twice. */
  const purchaseId = useRef<string | null>(null);

  // A signed-in user's wallet is refreshed from the account when the page opens.
  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    syncWallet(userId).then((result) => {
      if (!cancelled) setRefresh(result.ok ? "done" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { price, maxInventory } = ECONOMY.shield;
  const full = shields >= maxInventory;
  const shortBy = Math.max(0, price - balance);
  const buying = status.kind === "buying";
  const canBuy = ready && !full && shortBy === 0 && !buying;
  const history = useMemo(() => [...wallet.entries].reverse(), [wallet.entries]);
  const waiting = pendingEntries(wallet).length;

  async function buy() {
    if (!store || buying) return;
    setConfirming(false);
    setStatus({ kind: "buying" });
    purchaseId.current ??= newPurchaseId();
    const id = purchaseId.current;
    const result = userId !== null ? await purchaseShieldOnline(userId, id) : buyShieldLocally(store, { id, today: dayKey(new Date(), browserTimeZone()) });
    if (result.ok) {
      purchaseId.current = null;
      const now = loadWallet(store);
      setStatus({ kind: "success", message: `Streak Shield added. You now have ${now.shields.length} of ${maxInventory} and ${coinsLabel(balanceOf(now))} left.` });
    } else {
      // A failed request keeps its token so that trying again is the same purchase; a refusal ends the attempt.
      if (result.reason !== "offline" && result.reason !== "server" && result.reason !== "storage") purchaseId.current = null;
      setStatus({ kind: "error", message: result.message });
    }
  }

  if (!ready) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading your wallet">
        <div className="h-32 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
        <div className="h-56 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
        <span className="sr-only">Loading your wallet…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your coins</p>
            <p className="flex items-center gap-2.5 text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">
              <CoinIcon className="size-8" />
              {formatCoins(balance)}
              <span className="sr-only"> coins</span>
            </p>
          </div>
          <div className="max-w-xs space-y-1 text-sm text-muted-foreground">
            {viewer.kind === "guest" ? (
              <p>You are a guest, so your coins and shields are saved in this browser only and are not carried over to a new account.</p>
            ) : refresh === "loading" ? (
              <p className="flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Checking your account…
              </p>
            ) : refresh === "failed" ? (
              <p className="flex items-start gap-2">
                <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden /> Could not reach your account. Showing what is saved on this device; it will sync when you are back online.
              </p>
            ) : (
              <p>Saved to your account.</p>
            )}
            {waiting > 0 && viewer.kind === "user" && <p>{waiting} {waiting === 1 ? "change is" : "changes are"} waiting to sync.</p>}
          </div>
        </CardContent>
      </Card>

      {/* The shop */}
      <Card>
        <CardHeader>
          <CardTitle>Shop</CardTitle>
          <CardDescription>Spend coins on things that keep you going.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-secondary text-link" aria-hidden>
              <ShieldCheck className="size-8" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold tracking-tight">Streak Shield</h2>
                <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums">
                  <CoinIcon /> {formatCoins(price)}
                  <span className="sr-only"> coins</span>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Protects your streak for one missed day. If you skip a day, a shield is used for it automatically the next time you open Synapse. A protected day does not count as
                practice and earns no coins. Buy one before you need it: a shield cannot bring back a streak that has already broken.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <ShieldPips owned={shields} max={maxInventory} />
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">{shields}</span> of {maxInventory} owned
                </p>
              </div>
            </div>
            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
              <Button onClick={() => setConfirming(true)} disabled={!canBuy} aria-describedby="shield-note" className="sm:min-w-36">
                {buying ? (
                  <>
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" /> Buying…
                  </>
                ) : (
                  <>
                    <CoinIcon className="text-current" /> Buy for {formatCoins(price)}
                  </>
                )}
              </Button>
              <p id="shield-note" className="text-xs text-muted-foreground sm:text-right">
                {full ? `Inventory full (${shields} of ${maxInventory}).` : shortBy > 0 ? `You need ${coinsLabel(shortBy)} more.` : "Ready to buy."}
              </p>
            </div>
          </div>

          <div role="status" aria-live="polite" className="min-h-5">
            {status.kind === "success" && (
              <p className="flex items-start gap-2 text-sm font-medium text-success">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> {status.message}
              </p>
            )}
            {status.kind === "error" && (
              <p className="flex items-start gap-2 text-sm font-medium text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {status.message}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-secondary/60 p-4 text-sm">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Hints</span> cost {coinsLabel(ECONOMY.hint.cost)} each, taken only when a hint is actually shown, and the next one is available {ECONOMY.hint.cooldownMs / 1000} seconds later. Nothing is charged
              when there is no hint to give.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Shields owned and used */}
      <Card>
        <CardHeader>
          <CardTitle>Your Streak Shields</CardTitle>
          <CardDescription>{shields === 0 ? "You have no shields. A missed day ends your streak." : "Each one covers a missed day automatically."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {wallet.shields.length > 0 && (
            <ul className="divide-y divide-border">
              {wallet.shields.map((shield) => (
                <li key={shield.key} className="flex items-center gap-3 py-2.5 text-sm">
                  <Shield className="size-4 text-link" aria-hidden />
                  <span className="font-medium">Ready</span>
                  <span className="text-muted-foreground">bought {prettyDay(shield.boughtOn)}</span>
                </li>
              ))}
            </ul>
          )}
          {wallet.uses.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Used</h3>
              <ul className="divide-y divide-border">
                {[...wallet.uses].reverse().slice(0, 10).map((use) => (
                  <li key={use.date} className="flex items-center gap-3 py-2.5 text-sm">
                    <ShieldCheck className="size-4 text-success" aria-hidden />
                    <span className="font-medium">Protected {prettyDay(use.date)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {wallet.shields.length} {wallet.shields.length === 1 ? "shield" : "shields"} left.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Every coin earned or spent, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nothing yet. Answer a practice question correctly or solve a puzzle to earn your first coins.{" "}
              <Link href="/" className="font-medium text-link underline-offset-2 hover:underline">
                Start practising
              </Link>
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {history.slice(0, shown).map((entry) => (
                  <TransactionRow key={entry.id} entry={entry} />
                ))}
              </ul>
              {history.length > shown && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                  Show more
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* How to earn */}
      <Card>
        <CardHeader>
          <CardTitle>How to earn coins</CardTitle>
          <CardDescription>Coins are paid for finished work, never for opening a page or starting a game. Wrong, skipped and abandoned attempts earn nothing.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            {earningRows.map((row) => (
              <div key={row.what} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <dt className="text-muted-foreground">{row.what}</dt>
                <dd className="font-mono tabular-nums sm:text-right">{row.coins}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {confirming && (
        <ConfirmDialog
          title="Buy a Streak Shield?"
          message={`This costs ${coinsLabel(price)}, leaving you ${coinsLabel(balance - price)}. The shield covers one missed day automatically.`}
          confirmLabel={`Buy for ${formatCoins(price)} coins`}
          cancelLabel="Not now"
          onCancel={() => setConfirming(false)}
          onConfirm={buy}
        />
      )}
    </div>
  );
}
