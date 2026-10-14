"use client";

import { log } from "@/lib/logger";
import { useEffect } from "react";

/**
 * Registers the service worker (what makes Mathz open offline) in production builds only. In development a
 * worker would serve stale chunks and fight hot reloading.
 *
 * It also asks the browser not to evict this site's storage under pressure. Practice done offline lives in
 * that storage until it is uploaded, so losing it would lose scores. Installed apps are usually granted this
 * automatically; for a plain browser tab the request may be declined, which is harmless.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      log.error("Service worker registration failed (the app still works, but not offline)", err);
    });
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  return null;
}
