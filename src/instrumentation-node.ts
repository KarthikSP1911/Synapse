import { log } from "@/lib/logger";

/**
 * Process-wide handlers, Node.js only (kept apart from `instrumentation.ts` so the Edge runtime never sees `process.on`).
 * Anything that goes wrong outside a request (a promise nobody awaited, an exception in a timer) is logged with the same
 * structure as everything else instead of disappearing or taking the process down without a trace.
 */
export function registerNodeHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled promise rejection", reason);
  });
  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", error);
  });
}
