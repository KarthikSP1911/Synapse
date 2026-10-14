"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CoinIcon, coinsLabel, formatCoins } from "@/features/rewards/components/coin-icon";
import { useWallet } from "@/features/rewards/components/use-wallet";

/**
 * The coin balance in the header, beside the profile button. It links to the Rewards Shop. Hidden until the wallet has been
 * read so it never flashes a wrong number.
 */
export function CoinBadge({ className }: { className?: string }) {
  const { balance, ready } = useWallet();
  const pathname = usePathname();
  if (!ready) return <span aria-hidden className={cn("h-8 w-14 rounded-full", className)} />;
  const active = pathname.startsWith("/rewards");
  return (
    <Link
      href="/rewards"
      aria-label={`${coinsLabel(balance)}. Open the Rewards Shop`}
      aria-current={active ? "page" : undefined}
      title="Rewards Shop"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-2.5 font-mono text-xs font-semibold tabular-nums text-foreground transition-colors pointer-coarse:h-10",
        "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active && "bg-accent",
        className
      )}
    >
      <CoinIcon className="size-3.5" />
      {formatCoins(balance)}
    </Link>
  );
}
