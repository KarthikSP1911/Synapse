import { log } from "@/lib/logger";

/**
 * Runs in the browser before the app starts. Errors that no component caught (a failed handler, a promise nobody
 * awaited) are written to the console as structured entries, so they show up in DevTools, in a remote-debugged
 * installed app, and with the same shape as the server's logs.
 */
window.addEventListener("error", (event) => {
  // A script or style that failed to load has no `error`: say which one.
  const target = event.target instanceof HTMLElement && event.target !== (window as unknown as HTMLElement) ? event.target : null;
  if (target) log.warn("A resource failed to load", { tag: target.tagName, src: target.getAttribute("src") ?? target.getAttribute("href") ?? undefined, page: location.pathname });
  else log.error("Uncaught error", event.error ?? event.message, { page: location.pathname, file: event.filename, line: event.lineno });
}, true);

window.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", event.reason, { page: location.pathname });
});
