/** Page-side helpers for talking to the service worker (`public/sw.js`). */

/** Every screen that should open with no connection. `/play*` are the shells all local sessions share. */
const OFFLINE_ROUTES = ["/", "/play", "/play/summary", "/progress", "/tables", "/settings"];

export type ServiceWorkerMessage = { type: "warm"; urls: string[] } | { type: "clear-pages" } | { type: "skip-waiting" };

/** Sends a message to the active worker (waiting for it if the page has not been claimed yet). Silently does nothing without one. */
export function postToServiceWorker(message: ServiceWorkerMessage): void {
  if (!("serviceWorker" in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (controller) {
    controller.postMessage(message);
    return;
  }
  navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage(message)).catch(() => {});
}

/**
 * Asks the worker to download the app's screens (and the scripts and styles they use) now, while there is a
 * connection, so they open instantly and offline later.
 */
export function warmOfflineCache(signedIn: boolean): void {
  postToServiceWorker({ type: "warm", urls: signedIn ? [...OFFLINE_ROUTES, "/profile"] : OFFLINE_ROUTES });
}
