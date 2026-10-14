"use client";

import { useEffect, useRef, useState } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinIcon, coinsLabel } from "@/features/rewards/components/coin-icon";
import { onWalletEvent } from "@/features/rewards/lib/wallet-store";

interface Toast {
  id: number;
  tone: "earn" | "spend" | "shield";
  text: string;
  detail?: string;
}

const SHOW_MS = 2600;
const SHIELD_SHOW_MS = 6000;
/** Rewards that arrive within this long of each other (a correct answer and the session bonus) become one message. */
const MERGE_MS = 1200;

const prettyDay = (day: string): string => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/**
 * Brief, quiet feedback for coins: "+2 coins" when something is earned, "-5 coins" when a hint is paid for, and a note when a
 * Streak Shield protects a day. It sits at the top edge, never takes focus or pointer events, is announced politely, and does
 * not animate for people who ask for less motion. Purchases and refusals are reported where they happen (the shop, the hint
 * line), not here.
 */
export function CoinToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const lastEarn = useRef<{ id: number; at: number; total: number; reasons: string[] } | null>(null);

  useEffect(() => {
    const live = timers.current;
    const dismissLater = (id: number, ms: number) => {
      clearTimeout(live.get(id));
      live.set(id, setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), ms));
    };
    const show = (toast: Omit<Toast, "id">, ms: number) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { ...toast, id }]);
      dismissLater(id, ms);
      return id;
    };

    const off = onWalletEvent((event) => {
      if (event.kind === "credited") {
        const total = event.entries.reduce((sum, e) => sum + e.amount, 0);
        if (total <= 0) return;
        const now = Date.now();
        const reasons = event.entries.map((e) => e.reason);
        const last = lastEarn.current;
        if (last && now - last.at < MERGE_MS) {
          last.at = now;
          last.total += total;
          last.reasons.push(...reasons);
          const merged = last;
          setToasts((all) => all.map((t) => (t.id === merged.id ? { ...t, text: `+${coinsLabel(merged.total)}`, detail: merged.reasons.at(-1) } : t)));
          dismissLater(last.id, SHOW_MS);
          return;
        }
        const id = show({ tone: "earn", text: `+${coinsLabel(total)}`, detail: reasons.at(-1) }, SHOW_MS);
        lastEarn.current = { id, at: now, total, reasons: [...reasons] };
      } else if (event.kind === "hint" && event.charged && event.entry) {
        show({ tone: "spend", text: `-${coinsLabel(Math.abs(event.entry.amount))}`, detail: "Hint" }, SHOW_MS);
      } else if (event.kind === "shield-used") {
        const days = event.dates.map(prettyDay).join(", ");
        show({ tone: "shield", text: "Streak Shield used", detail: `It protected ${days}.` }, SHIELD_SHOW_MS);
      }
    });
    return () => {
      off();
      live.forEach(clearTimeout);
      live.clear();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-card-foreground shadow-pop",
            "animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none"
          )}
        >
          {toast.tone === "shield" ? <Shield className="size-3.5 shrink-0 text-link" aria-hidden /> : <CoinIcon className="size-3.5" />}
          <span className={cn("font-mono tabular-nums", toast.tone === "earn" && "text-success")}>{toast.text}</span>
          {toast.detail && <span className="truncate text-muted-foreground">{toast.detail}</span>}
        </div>
      ))}
    </div>
  );
}
