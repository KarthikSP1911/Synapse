"use client";

import Link from "next/link";
import { Shield, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoinIcon, formatCoins } from "@/features/rewards/components/coin-icon";
import { useWallet } from "@/features/rewards/components/use-wallet";
import { ECONOMY } from "@/features/rewards/lib/economy";

const prettyDay = (day: string): string => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

/**
 * The profile's view of the user's Streak Shields: how many they hold, whether the streak is protected right now, which days a
 * shield has covered, and the way to the Rewards Shop. Reads the same wallet the shop and the streak do.
 */
export function ShieldPanel({ className }: { className?: string }) {
  const { wallet, shields, balance, ready } = useWallet();
  const max = ECONOMY.shield.maxInventory;
  const recent = [...wallet.uses].reverse().slice(0, 5);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-link" aria-hidden /> Streak Shields
        </CardTitle>
        <CardDescription>A shield covers one missed day so your streak survives. A protected day is not counted as practice and earns no coins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready ? (
          <div className="h-16 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" role="status" aria-label="Loading your shields" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5" aria-hidden>
                  {Array.from({ length: max }, (_, i) => (
                    <Shield key={i} className={cn("size-5", i < shields ? "fill-link/20 text-link" : "text-border")} />
                  ))}
                </div>
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">{shields}</span> of {max} owned
                </p>
              </div>
              <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CoinIcon className="size-3.5" />
                <span className="font-mono tabular-nums">{formatCoins(balance)}</span>
                <span className="sr-only"> coins</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground" role="status">
              {shields > 0
                ? `Your streak is protected: the next missed day will be covered automatically (${shields} ${shields === 1 ? "shield" : "shields"} ready).`
                : "No shields: a missed day will end your streak."}
            </p>
            {recent.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium">Recently protected</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {recent.map((use) => (
                    <li key={use.date} className="flex items-center gap-2">
                      <ShieldCheck className="size-3.5 text-success" aria-hidden />
                      {prettyDay(use.date)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <Link href="/rewards" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Open the Rewards Shop
        </Link>
      </CardContent>
    </Card>
  );
}
