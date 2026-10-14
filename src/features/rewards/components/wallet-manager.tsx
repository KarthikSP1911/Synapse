"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocalStore } from "@/features/auth/components/viewer-provider";
import { dayKey } from "@/features/progress/lib/activity";
import { guestActivityDays } from "@/features/progress/lib/local-activity";
import { browserTimeZone } from "@/features/progress/lib/streak";
import { CoinToaster } from "@/features/rewards/components/coin-toaster";
import { protectStreakLocally } from "@/features/rewards/lib/service";
import { loadWallet } from "@/features/rewards/lib/wallet-store";

/**
 * Keeps a guest's Streak Shields working: whenever the app opens, comes back to the front or moves between screens, it checks
 * the days the guest was active and uses a shield on any missed day one can cover. It is cheap when there is nothing to do (no
 * shield owned: it returns at once) and safe to repeat (a protected day is already covered, so a second look finds nothing).
 * A signed-in user's days are known better by the server, which makes the same decision during the wallet sync.
 *
 * It also hosts the coin toasts.
 */
export function WalletManager() {
  const store = useLocalStore();
  const pathname = usePathname();

  // A new screen is a natural moment to look again (midnight may have passed, a session may have just ended), hence `pathname`.
  useEffect(() => {
    if (!store || store.syncable) return;
    const protect = () => {
      if (loadWallet(store).shields.length === 0) return;
      protectStreakLocally(store, new Set(guestActivityDays(store)), dayKey(new Date(), browserTimeZone()));
    };
    const first = setTimeout(protect, 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") protect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [store, pathname]);

  return <CoinToaster />;
}
