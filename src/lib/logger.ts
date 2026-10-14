/**
 * The one way the app writes logs, on the server and in the browser. Every entry has a level, a message, a time and,
 * for an error, what is useful to find the cause: the error's name, message, a short stack, its `cause` chain and the
 * database error code if it has one. Anything in the context that looks like a secret or personal data (passwords,
 * tokens, cookies, e-mail addresses, the database URL) is replaced before it is written.
 *
 * `log.error` returns a short reference that is written with the entry. Show it to the person who hit the error
 * (an API reply carries it as `reference`, the error page prints it) and the matching line is one search away.
 *
 * Output: in development a readable block per entry; in production on the server one JSON object per line, which log
 * collectors (Vercel, Loki, CloudWatch) parse as fields. The level threshold is `LOG_LEVEL` (debug, info, warn, error),
 * `info` in production and `debug` otherwise. No file here imports anything server-only, so the browser can use it too.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface ErrorInfo {
  name: string;
  message: string;
  /** The first lines of the stack. */
  stack?: string;
  /** Next.js's hash of a server error, which the error page shows so the two can be matched. */
  digest?: string;
  /** A database or system error code (`23505`, `ECONNRESET`). */
  code?: string;
  cause?: ErrorInfo;
  /** Database error details that help and never hold row data. */
  db?: { severity?: string; table?: string; constraint?: string; routine?: string };
}

export interface LogEntry {
  time: string;
  level: LogLevel;
  message: string;
  /** Set for errors: the short id to quote when reporting the problem. */
  reference?: string;
  error?: ErrorInfo;
  context?: Record<string, unknown>;
}

const MAX_MESSAGE = 500;
const STACK_LINES = 12;
const MAX_DEPTH = 4;
const MAX_STRING = 300;
const MAX_KEYS = 40;

/** Keys whose values never reach a log. */
const SECRET_KEY = /pass(word|wd)?|secret|token|cookie|authorization|auth|session|e-?mail|database_?url|connection|credential|api[-_]?key/i;

const text = (value: unknown, max = MAX_MESSAGE): string => {
  const s = typeof value === "string" ? value : String(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/**
 * Database drivers write the values of a failed query into the error message ("Failed query: select ... <newline>params:
 * a@b.c,1"): an e-mail address, a session token. Those values are about people, so the line that carries them is blanked,
 * in the message and in the stack (which starts with the message). The statement itself (with `$1` placeholders) stays.
 */
const scrub = (value: string): string => value.replace(/\nparams:[^\n]*/g, "\nparams: [redacted]");

/** Plain, loggable facts about anything that was thrown (it need not be an `Error`). */
export function describeError(error: unknown, depth = 0): ErrorInfo {
  if (error === null || error === undefined) return { name: "Error", message: String(error) };
  if (typeof error !== "object") return { name: "Error", message: text(error) };

  const e = error as Record<string, unknown> & { stack?: unknown; cause?: unknown };
  const info: ErrorInfo = {
    name: typeof e.name === "string" ? e.name : (error as object).constructor?.name || "Error",
    message: typeof e.message === "string" ? text(scrub(e.message)) : text(safeJson(error)),
  };
  if (typeof e.stack === "string") info.stack = scrub(e.stack).split("\n").slice(0, STACK_LINES).join("\n");
  if (typeof e.digest === "string") info.digest = e.digest;
  if (typeof e.code === "string" || typeof e.code === "number") info.code = String(e.code);
  const db: NonNullable<ErrorInfo["db"]> = {};
  for (const key of ["severity", "table", "constraint", "routine"] as const) if (typeof e[key] === "string") db[key] = e[key] as string;
  if (Object.keys(db).length > 0) info.db = db;
  // Neon wraps the driver's error; the driver's is the one with the code.
  const inner = e.cause ?? e.sourceError;
  if (inner !== undefined && inner !== error && depth < MAX_DEPTH) {
    info.cause = describeError(inner, depth + 1);
    if (info.code === undefined && info.cause.code !== undefined) info.code = info.cause.code;
  }
  return info;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** A copy of the context that is safe to write: secrets blanked, long strings cut, deep or circular values flattened. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return text(value, MAX_STRING);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (value instanceof Error) return describeError(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[deep]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : redact((value as Record<string, unknown>)[key], depth + 1, seen);
  }
  return out;
}

/** A short random id, such as `k3x9a2fq`, easy to read out and quote. */
export function newReference(): string {
  const bytes = new Uint8Array(5);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

export function buildEntry(level: LogLevel, message: string, error?: unknown, context?: Record<string, unknown>, now: Date = new Date(), reference?: string): LogEntry {
  const entry: LogEntry = { time: now.toISOString(), level, message: text(message) };
  if (reference) entry.reference = reference;
  if (error !== undefined) entry.error = describeError(error);
  if (context && Object.keys(context).length > 0) entry.context = redact(context) as Record<string, unknown>;
  return entry;
}

/** One line of JSON (for log collectors) or a readable block (for a terminal). */
export function formatEntry(entry: LogEntry, pretty: boolean): string {
  if (!pretty) return JSON.stringify(entry);
  const head = `${entry.time.slice(11, 23)} ${entry.level.toUpperCase().padEnd(5)} ${entry.message}${entry.reference ? `  [ref ${entry.reference}]` : ""}`;
  const lines = [head];
  if (entry.context) lines.push(`      context: ${JSON.stringify(entry.context)}`);
  for (let e: ErrorInfo | undefined = entry.error, label = "error"; e; e = e.cause, label = "caused by") {
    const code = e.code ? ` (code ${e.code})` : "";
    const digest = e.digest ? ` (digest ${e.digest})` : "";
    lines.push(`      ${label}: ${e.name}: ${e.message}${code}${digest}`);
    if (e.db) lines.push(`      database: ${JSON.stringify(e.db)}`);
    if (e.stack) lines.push(e.stack.split("\n").slice(1).join("\n"));
  }
  return lines.join("\n");
}

const isServer = typeof window === "undefined";
const isProduction = process.env.NODE_ENV === "production";

function threshold(): number {
  const wanted = isServer ? process.env.LOG_LEVEL : undefined;
  if (wanted && wanted in ORDER) return ORDER[wanted as LogLevel];
  return isProduction ? ORDER.info : ORDER.debug;
}

function write(level: LogLevel, message: string, error?: unknown, context?: Record<string, unknown>, reference?: string): void {
  if (ORDER[level] < threshold()) return;
  const entry = buildEntry(level, message, error, context, new Date(), reference);
  const out = level === "error" ? console.error : level === "warn" ? console.warn : level === "info" ? console.info : console.debug;
  if (isServer) out(formatEntry(entry, !isProduction));
  // In a browser the entry stays an object, so DevTools can open it.
  else out(`[mathz] ${level.toUpperCase()} ${message}${reference ? ` [ref ${reference}]` : ""}`, entry);
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>): void => write("debug", message, undefined, context),
  info: (message: string, context?: Record<string, unknown>): void => write("info", message, undefined, context),
  warn: (message: string, context?: Record<string, unknown>, error?: unknown): void => write("warn", message, error, context),
  /** Logs a failure and returns the reference written with it (pass `reference` to reuse one, for example a digest). */
  error(message: string, error?: unknown, context?: Record<string, unknown>, reference: string = newReference()): string {
    write("error", message, error, context, reference);
    return reference;
  },
};
