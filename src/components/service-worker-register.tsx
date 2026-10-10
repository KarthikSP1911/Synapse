"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds only. In development a worker would serve stale
 * chunks and fight hot reloading.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.error("Service worker registration failed", err);
    });
  }, []);

  return null;
}
