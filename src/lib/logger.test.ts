import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEntry, describeError, formatEntry, newReference, redact } from "./logger";
import { classifyError } from "./classify-error";

describe("describeError", () => {
  it("keeps what finds a cause: name, message, a short stack, the code and the chain of causes", () => {
    const inner = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    const outer = new Error("query failed", { cause: inner });
    const info = describeError(outer);
    assert.equal(info.name, "Error");
    assert.equal(info.message, "query failed");
    assert.match(info.stack ?? "", /logger\.test/);
    assert.ok((info.stack ?? "").split("\n").length <= 12);
    assert.equal(info.cause?.message, "connection reset");
    assert.equal(info.code, "ECONNRESET", "the code of the cause is surfaced");
  });

  it("reads a database error's code and where it happened, never the row it was about", () => {
    const db = Object.assign(new Error('duplicate key value violates unique constraint "users_email_idx"'), {
      code: "23505",
      severity: "ERROR",
      table: "users",
      constraint: "users_email_idx",
      detail: "Key (email)=(someone@example.com) already exists.",
    });
    const info = describeError(db);
    assert.equal(info.code, "23505");
    assert.deepEqual(info.db, { severity: "ERROR", table: "users", constraint: "users_email_idx" });
    assert.ok(!JSON.stringify(info).includes("Key (email)"), "the detail holds the e-mail address and is left out");
  });

  it("blanks the values a database driver writes into a failed query's message, in the message and the stack", () => {
    const failed = new Error('Failed query: select "id" from "users" where "users"."email" = $1 limit $2\nparams: someone@example.com,1');
    const info = describeError(failed);
    assert.match(info.message, /Failed query: select "id" from "users"/);
    assert.match(info.message, /params: \[redacted\]/);
    assert.ok(!JSON.stringify(info).includes("someone@example.com"), "neither the message nor the stack keeps the e-mail address");
    const token = describeError(new Error("Failed query: select 1 where token_hash = $1\nparams: b5d54c39e66671c9731b9f471e585d8262cd4f54963f0c93082d8dcf334d4c78,2026-10-14T16:17:13.860Z,1"));
    assert.ok(!JSON.stringify(token).includes("b5d54c39"));
  });

  it("describes anything that can be thrown", () => {
    assert.deepEqual(describeError("boom"), { name: "Error", message: "boom" });
    assert.deepEqual(describeError(undefined), { name: "Error", message: "undefined" });
    assert.equal(describeError({ message: "plain object" }).message, "plain object");
    assert.equal(describeError(42).message, "42");
    assert.equal(describeError({ digest: "abc123" }).digest, "abc123");
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    assert.ok(describeError(loop).message.length > 0, "a circular object does not break it");
    const long = describeError(new Error("x".repeat(5000)));
    assert.ok(long.message.length <= 501);
  });

  it("stops following causes that point back at themselves", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    a.cause = a;
    assert.equal(describeError(a).cause, undefined);
  });
});

describe("redact", () => {
  it("blanks secrets and personal data by key, at any depth", () => {
    const out = redact({
      route: "/api/x",
      password: "hunter2",
      user: { email: "a@b.c", id: 7, sessionToken: "t" },
      headers: { Cookie: "mathz_session=abc", authorization: "Bearer z" },
      DATABASE_URL: "postgres://u:p@h/db",
    }) as { route: string; password: string; user: { email: string; id: number; sessionToken: string }; headers: { Cookie: string; authorization: string }; DATABASE_URL: string };
    assert.equal(out.route, "/api/x");
    assert.equal(out.password, "[redacted]");
    assert.equal(out.user.email, "[redacted]");
    assert.equal(out.user.sessionToken, "[redacted]");
    assert.equal(out.user.id, 7);
    assert.equal(out.headers.Cookie, "[redacted]");
    assert.equal(out.headers.authorization, "[redacted]");
    assert.equal(out.DATABASE_URL, "[redacted]");
    assert.ok(!JSON.stringify(out).includes("hunter2"));
  });

  it("flattens what could break or flood a log", () => {
    const loop: Record<string, unknown> = { name: "loop" };
    loop.self = loop;
    assert.deepEqual(redact(loop), { name: "loop", self: "[circular]" });
    assert.equal((redact("y".repeat(1000)) as string).length, 301);
    assert.equal((redact(Array.from({ length: 100 }, (_, i) => i)) as number[]).length, 20);
    assert.equal(redact(BigInt(10)), "10");
    assert.equal(typeof redact(() => 1), "string");
    assert.equal(redact(new Date(Date.UTC(2026, 9, 14))), "2026-10-14T00:00:00.000Z");
    assert.equal(redact(new Date(NaN)), "Invalid Date");
    assert.equal((redact(new Error("e")) as { message: string }).message, "e");
  });
});

describe("log entries", () => {
  const at = new Date("2026-10-14T12:34:56.789Z");

  it("build as one flat JSON-able object with a reference on errors", () => {
    const entry = buildEntry("error", "Failed to sync", new Error("db down"), { route: "/api/sync", password: "x" }, at, "ab12cd34");
    assert.equal(entry.time, "2026-10-14T12:34:56.789Z");
    assert.equal(entry.level, "error");
    assert.equal(entry.reference, "ab12cd34");
    assert.equal(entry.error?.message, "db down");
    assert.deepEqual(entry.context, { route: "/api/sync", password: "[redacted]" });
    const line = formatEntry(entry, false);
    assert.equal(line.includes("\n"), false, "one line per entry, for log collectors");
    assert.deepEqual(JSON.parse(line).context, entry.context);
  });

  it("leave out what there is none of", () => {
    const entry = buildEntry("info", "Signed in", undefined, undefined, at);
    assert.deepEqual(Object.keys(entry), ["time", "level", "message"]);
  });

  it("read well in a terminal, with the cause chain and the reference", () => {
    const cause = Object.assign(new Error("ECONNRESET while reading"), { code: "ECONNRESET" });
    const entry = buildEntry("error", "Failed to load the wallet", new Error("fetch failed", { cause }), { route: "/api/wallet" }, at, "k3x9a2fq");
    const text = formatEntry(entry, true);
    assert.match(text, /^12:34:56\.789 ERROR Failed to load the wallet {2}\[ref k3x9a2fq\]/);
    assert.match(text, /context: {"route":"\/api\/wallet"}/);
    assert.match(text, /error: Error: fetch failed/);
    assert.match(text, /caused by: Error: ECONNRESET while reading \(code ECONNRESET\)/);
  });

  it("make references that are short, readable and different each time", () => {
    const refs = new Set(Array.from({ length: 200 }, newReference));
    assert.equal(refs.size, 200);
    for (const ref of refs) assert.match(ref, /^[0-9a-z]{8}$/);
  });
});

describe("what an error means to the person who sees it", () => {
  it("says offline when there is no connection, whatever went wrong", () => {
    assert.equal(classifyError({ message: "anything" }, false), "offline");
  });
  it("says the app was updated when a page outlived a deploy", () => {
    assert.equal(classifyError({ message: 'Failed to find Server Action "60ee8e". This request might be from an older or newer deployment.' }, true), "outdated");
    assert.equal(classifyError({ message: "Loading chunk 412 failed." }, true), "outdated");
    assert.equal(classifyError({ message: "Failed to fetch dynamically imported module: /_next/static/x.js" }, true), "outdated");
  });
  it("otherwise says the page failed", () => {
    assert.equal(classifyError({ message: "An error occurred in the Server Components render." }, true), "failed");
    assert.equal(classifyError({}, true), "failed");
  });
});
