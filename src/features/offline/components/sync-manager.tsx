"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useViewerInfo } from "@/features/auth/components/viewer-provider";
import { pendingCountFor as mindsprintPendingFor, syncMindsprint } from "@/features/games/mindsprint/lib/sync";
import { pendingCountFor as recallPendingFor, syncRecall } from "@/features/games/recall/lib/sync";
import { pendingCountFor as game2048PendingFor, syncGame2048 } from "@/features/games/game2048/lib/sync";
import { pendingCountFor as sudokuPendingFor, syncSudoku } from "@/features/games/sudoku/lib/sync";
import { pendingCountFor as queensPendingFor, syncQueens } from "@/features/games/queens/lib/sync";
import { pendingCountFor as zipPendingFor, syncZip } from "@/features/games/zip/lib/sync";
import { pendingCountFor, syncUser } from "@/features/offline/lib/sync/client";
import { setSyncStatus } from "@/features/offline/lib/sync/status";
import { postToServiceWorker, warmOfflineCache } from "@/features/offline/lib/sw-client";

const IDENTITY_KEY = "mathz:identity";
/** While the app is open, look for unsent practice this often (the `online` event covers most reconnects). */
const POLL_MS = 60 * 1000;
const RETRY_MS = [15_000, 30_000, 60_000, 5 * 60_000];
/** Asking the service worker to refresh the offline copies of the pages is cheap, but not needed on every load. */
const WARM_EVERY_MS = 6 * 60 * 60 * 1000;
const WARMED_KEY = "mathz:warmed";

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the app still works, it only forgets this convenience.
  }
};

/**
 * Keeps the device and the server in step, with no UI of its own (the badge in the header shows the state):
 *  - uploads practice done offline when the connection returns, the app comes back to the front, or a
 *    session finishes, and retries with a growing delay if the server cannot be reached;
 *  - asks the service worker to keep the offline copies of the pages fresh;
 *  - drops the cached pages when a different person signs in on this device, so nobody is shown another
 *    person's cached screens.
 */
export function SyncManager() {
  const viewer = useViewerInfo();
  const pathname = usePathname();
  const kind = viewer.kind;
  const userId = viewer.kind === "user" ? viewer.userId : null;
  /** The current upload routine, so a navigation can ask for one without owning the timers. */
  const requestSync = useRef<(() => void) | null>(null);

  // Connectivity, for the badge.
  useEffect(() => {
    const update = () => setSyncStatus({ online: navigator.onLine });
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Who is using the device; a change means the cached pages belong to someone else.
  useEffect(() => {
    if (kind === null) {
      // Landing on the login screen means nobody is signed in here: the stored screens must not outlive that.
      if (pathname === "/login" || pathname === "/signup") {
        try {
          localStorage.removeItem(IDENTITY_KEY);
        } catch {
          // Nothing to forget.
        }
        postToServiceWorker({ type: "clear-pages" });
        writeStorage(WARMED_KEY, "0");
      }
      return;
    }
    const current = `${kind}:${userId ?? ""}`;
    const previous = readStorage(IDENTITY_KEY);
    writeStorage(IDENTITY_KEY, current);
    if (previous !== null && previous !== current) {
      writeStorage(WARMED_KEY, "0");
      postToServiceWorker({ type: "clear-pages" });
    }
  }, [kind, userId, pathname]);

  // Offline copies of the pages.
  useEffect(() => {
    if (kind === null || !navigator.onLine) return;
    const warm = () => {
      writeStorage(WARMED_KEY, String(Date.now()));
      warmOfflineCache();
    };
    const last = Number(readStorage(WARMED_KEY) ?? 0);
    // Slightly delayed so it never competes with what the user just opened.
    const timer = setTimeout(() => {
      if (Date.now() - last > WARM_EVERY_MS) warm();
    }, 4000);
    // A new service worker version has new page bundles to keep.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "sw-activated" && navigator.onLine) warm();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearTimeout(timer);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [kind]);

  // Uploading.
  useEffect(() => {
    if (userId === null) {
      requestSync.current = null;
      setSyncStatus({ pending: 0, syncing: false, failed: false });
      return;
    }
    let cancelled = false;
    let running = false;
    let failures = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // MindSprint sessions wait for upload just like practice sessions do.
    const countPending = () => pendingCountFor(userId) + mindsprintPendingFor(userId) + recallPendingFor(userId) + sudokuPendingFor(userId) + game2048PendingFor(userId) + queensPendingFor(userId) + zipPendingFor(userId);
    const refreshPending = () => setSyncStatus({ pending: countPending() });

    const run = async () => {
      refreshPending();
      if (cancelled || running || !navigator.onLine) return;
      // Only one tab uploads at a time; the others see the result in the shared storage.
      const locks = navigator.locks;
      const work = async () => {
        running = true;
        setSyncStatus({ syncing: true });
        const practice = await syncUser(userId);
        // Only reaches for the server when a game session is waiting (a game's history is pulled when its page opens).
        const mindsprint = mindsprintPendingFor(userId) > 0 ? await syncMindsprint(userId) : null;
        const recall = recallPendingFor(userId) > 0 ? await syncRecall(userId) : null;
        const sudoku = sudokuPendingFor(userId) > 0 ? await syncSudoku(userId) : null;
        const game2048 = game2048PendingFor(userId) > 0 ? await syncGame2048(userId) : null;
        const queens = queensPendingFor(userId) > 0 ? await syncQueens(userId) : null;
        const zip = zipPendingFor(userId) > 0 ? await syncZip(userId) : null;
        running = false;
        if (cancelled) return;
        const result = !practice.ok
          ? practice
          : mindsprint && !mindsprint.ok
            ? mindsprint
            : recall && !recall.ok
              ? recall
              : sudoku && !sudoku.ok
                ? sudoku
                : game2048 && !game2048.ok
                  ? game2048
                  : queens && !queens.ok
                    ? queens
                    : zip && !zip.ok
                      ? zip
                      : practice;
        failures = result.ok ? 0 : failures + 1;
        setSyncStatus({ syncing: false, failed: !result.ok && result.reason !== "signed-out", pending: countPending() });
        clearTimeout(retryTimer);
        if (!result.ok && result.reason !== "signed-out") {
          retryTimer = setTimeout(run, RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)]);
        }
      };
      if (locks) await locks.request("mathz-sync", { ifAvailable: true }, (lock) => (lock ? work() : undefined));
      else await work();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("mathz:user:")) refreshPending();
    };
    requestSync.current = run;
    run();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, POLL_MS);
    window.addEventListener("online", run);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      requestSync.current = null;
      clearInterval(poll);
      clearTimeout(retryTimer);
      window.removeEventListener("online", run);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  // Moving between screens is when a session has just ended, so check for new practice to send.
  useEffect(() => {
    if (userId === null) return;
    const timer = setTimeout(() => requestSync.current?.(), 0);
    return () => clearTimeout(timer);
  }, [pathname, userId]);

  return null;
}
