import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

/**
 * A failed API call: logs what went wrong (with the route and anything that helps find it) and answers 500 with
 * the message and a `reference`, the same id as in the log line, so a report from a device can be matched to it.
 * `extra` fields go in the reply as well (a sync route reports what it did store before it failed).
 */
export function serverFailure(message: string, error: unknown, context: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): NextResponse {
  const reference = log.error(message, error, context);
  return NextResponse.json({ error: message, reference, ...extra }, { status: 500 });
}
