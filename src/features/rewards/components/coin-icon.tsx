import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

/** The coin symbol used everywhere a balance or price appears, so coins always look the same. */
export function CoinIcon({ className }: { className?: string }) {
  return <Coins className={cn("size-4 shrink-0 text-warning", className)} aria-hidden />;
}

/** `1,250`. A fixed locale, so the server and the browser render the same digits. */
export const formatCoins = (n: number): string => n.toLocaleString("en-US");

/** `5 coins`, `1 coin`. */
export const coinsLabel = (n: number): string => `${formatCoins(n)} ${n === 1 ? "coin" : "coins"}`;
