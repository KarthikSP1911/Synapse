import { sql, type SQL } from "drizzle-orm";
import { ECONOMY, type Economy } from "@/features/rewards/lib/economy";
import { hintKey, isValidKey, purchaseKey, shieldUseKey } from "@/features/rewards/lib/ledger";
import { planProtection } from "@/features/rewards/lib/protection";
import type { FailureReason, Grant, LedgerEntry, OwnedShield, ShieldUse, TransactionType } from "@/features/rewards/lib/types";

/**
 * The trusted side of the wallet: what a signed-in user's coins and shields are really worth.
 *
 * The device keeps its own copy so the app works offline, but nothing the device says about amounts is believed here:
 *  - earnings are computed from records the server has already validated (see the upload routes) and credited with the
 *    same keys the device used, so a doctored upload cannot mint coins;
 *  - hint charges arrive as "this hint of this game was delivered" and are priced from the economy;
 *  - shield purchases are priced and limited here, and shield uses are decided here from the days the account really has.
 *
 * Every change is ONE SQL statement that appends the ledger row and moves the totals together, so a failure midway leaves
 * neither half. Three things make a statement safe against concurrent requests: the wallet row is locked first (`FOR
 * UPDATE`), the ledger row's unique key arbitrates a repeated key (the loser inserts nothing, so it changes nothing), and
 * the table's CHECK constraints refuse a negative balance outright, aborting the statement, whatever else happens.
 *
 * The database is reached through `Run`, so the same code runs against Neon in production and an in-process Postgres in tests.
 */

export type Run = (query: SQL) => Promise<Record<string, unknown>[]>;

const num = (value: unknown): number => Number(value ?? 0);

/** Postgres error codes, found on the error or on its `cause` (the driver wraps them). */
function pgCode(error: unknown): string | undefined {
  for (let e = error as { code?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) if (typeof e.code === "string" && /^\d{5}$/.test(e.code)) return e.code;
  return undefined;
}
const isCheckViolation = (error: unknown) => pgCode(error) === "23514";
const isUniqueViolation = (error: unknown) => pgCode(error) === "23505";

const timestampOf = (ms: number): SQL => sql`(to_timestamp(${ms}::float8 / 1000) AT TIME ZONE 'UTC')`;

export async function ensureWallet(run: Run, userId: number): Promise<void> {
  await run(sql`INSERT INTO wallets (user_id) VALUES (${userId}::int) ON CONFLICT (user_id) DO NOTHING`);
}

// ---------------------------------------------------------------------------
// One ledger row, atomically
// ---------------------------------------------------------------------------

interface Draft {
  key: string;
  type: TransactionType;
  amount: number;
  shields: number;
  reason: string;
  ref: string | null;
  link: string | null;
  at: number;
}

export type PostOutcome = { status: "posted" } | { status: "duplicate" } | { status: "refused"; reason: Extract<FailureReason, "insufficient" | "inventory_full" | "no_shield"> };

/**
 * Appends one ledger row and applies it to the totals in a single statement. Returns `duplicate` when the key was
 * already posted (nothing changes) and `refused` when the balance or the shield count would leave its allowed range.
 */
async function post(run: Run, userId: number, d: Draft, economy: Economy): Promise<PostOutcome> {
  await ensureWallet(run, userId);
  let rows: Record<string, unknown>[];
  try {
    rows = await run(sql`
      WITH w AS (
        SELECT balance, shields_owned FROM wallets WHERE user_id = ${userId}::int FOR UPDATE
      ),
      ins AS (
        INSERT INTO wallet_transactions (user_id, key, type, amount, shields_delta, reason, ref, link, occurred_at)
        SELECT ${userId}::int, ${d.key}::varchar, ${d.type}::varchar, ${d.amount}::int, ${d.shields}::int, ${d.reason}::varchar, ${d.ref}::varchar, ${d.link}::varchar, ${timestampOf(d.at)}
        FROM w
        WHERE w.balance + ${d.amount}::int >= 0
          AND w.shields_owned + ${d.shields}::int >= 0
          AND (${d.shields}::int <= 0 OR w.shields_owned + ${d.shields}::int <= ${economy.shield.maxInventory}::int)
        ON CONFLICT (user_id, key) DO NOTHING
        RETURNING id
      ),
      upd AS (
        UPDATE wallets
        SET balance = balance + ${d.amount}::int, shields_owned = shields_owned + ${d.shields}::int, updated_at = now()
        WHERE user_id = ${userId}::int AND EXISTS (SELECT 1 FROM ins)
        RETURNING balance
      )
      SELECT (SELECT id FROM ins) AS id, (SELECT balance FROM upd) AS balance
    `);
  } catch (error) {
    // The CHECK constraints are the backstop: should two requests ever race past the guards above, the loser aborts here.
    if (isCheckViolation(error)) return { status: "refused", reason: d.shields < 0 ? "no_shield" : d.shields > 0 ? "inventory_full" : "insufficient" };
    throw error;
  }
  if (rows[0]?.id !== null && rows[0]?.id !== undefined) return { status: "posted" };

  const [existing] = await run(sql`SELECT 1 AS found FROM wallet_transactions WHERE user_id = ${userId}::int AND key = ${d.key}::varchar`);
  if (existing) return { status: "duplicate" };

  // Refused by one of the guards in the statement: say which.
  const [wallet] = await run(sql`SELECT shields_owned FROM wallets WHERE user_id = ${userId}::int`);
  const owned = num(wallet?.shields_owned);
  if (d.shields < 0 && owned + d.shields < 0) return { status: "refused", reason: "no_shield" };
  if (d.shields > 0 && owned + d.shields > economy.shield.maxInventory) return { status: "refused", reason: "inventory_full" };
  return { status: "refused", reason: "insufficient" };
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

const CREDIT_CHUNK = 200;

/**
 * Credits rewards computed by the server from records it validated. A grant whose key is already in the ledger changes
 * nothing, so the same upload can arrive twice, or two requests can race, and each reward is paid once. Returns the coins newly paid.
 */
export async function creditGrants(run: Run, userId: number, grants: readonly Grant[], economy: Economy = ECONOMY, now: number = Date.now()): Promise<number> {
  const valid = grants.filter((g) => isValidKey(g.key, economy) && Number.isSafeInteger(g.amount) && g.amount > 0 && g.amount <= economy.ledger.maxSingleCredit);
  if (valid.length === 0) return 0;
  await ensureWallet(run, userId);

  let paid = 0;
  for (let i = 0; i < valid.length; i += CREDIT_CHUNK) {
    const rows = sql.join(
      valid.slice(i, i + CREDIT_CHUNK).map(
        (g) =>
          sql`(${userId}::int, ${g.key}::varchar, 'earning'::varchar, ${g.amount}::int, 0::int, ${g.reason.slice(0, 200)}::varchar, ${g.ref.slice(0, economy.ledger.maxKeyLength)}::varchar, ${timestampOf(Math.min(Math.max(g.at, 1), now))})`
      ),
      sql`, `
    );
    const result = await run(sql`
      WITH ins AS (
        INSERT INTO wallet_transactions (user_id, key, type, amount, shields_delta, reason, ref, occurred_at)
        VALUES ${rows}
        ON CONFLICT (user_id, key) DO NOTHING
        RETURNING amount
      ),
      upd AS (
        UPDATE wallets
        SET balance = balance + (SELECT COALESCE(SUM(amount), 0) FROM ins)::int, updated_at = now()
        WHERE user_id = ${userId}::int AND EXISTS (SELECT 1 FROM ins)
        RETURNING balance
      )
      SELECT COALESCE((SELECT SUM(amount) FROM ins), 0)::int AS paid
    `);
    paid += num(result[0]?.paid);
  }
  return paid;
}

// ---------------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------------

export type SpendResult = { ok: true; duplicate: boolean } | { ok: false; reason: FailureReason; message: string };

const MESSAGES: Record<string, string> = {
  insufficient: "Not enough coins.",
  inventory_full: "You already have the maximum number of Streak Shields.",
  no_shield: "No Streak Shield was available for that day.",
  invalid: "That request is not valid.",
};

const fromOutcome = (outcome: PostOutcome): SpendResult =>
  outcome.status === "refused" ? { ok: false, reason: outcome.reason, message: MESSAGES[outcome.reason] } : { ok: true, duplicate: outcome.status === "duplicate" };

/** Buys one Streak Shield at the server's price, if the user can pay and has room. `id` is the purchase attempt's token. */
export async function purchaseShield(run: Run, userId: number, request: { id: string; today: string }, economy: Economy = ECONOMY, now: number = Date.now()): Promise<SpendResult> {
  const key = purchaseKey(request.id);
  if (!isValidKey(key, economy) || !/^\d{4}-\d{2}-\d{2}$/.test(request.today)) return { ok: false, reason: "invalid", message: MESSAGES.invalid };
  return fromOutcome(await post(run, userId, { key, type: "purchase", amount: -economy.shield.price, shields: 1, reason: "Bought a Streak Shield", ref: request.today, link: null, at: now }, economy));
}

export interface HintIntent {
  chargeScope: string;
  ordinal: number;
  at: number;
}

/** Charges one hint that the device says it delivered. The price is the server's; the same hint is never charged twice. */
export async function chargeHintIntent(run: Run, userId: number, intent: HintIntent, economy: Economy = ECONOMY, now: number = Date.now()): Promise<SpendResult> {
  if (!isValidKey(intent.chargeScope, economy) || !Number.isSafeInteger(intent.ordinal) || intent.ordinal < 1 || intent.ordinal > 10_000) return { ok: false, reason: "invalid", message: MESSAGES.invalid };
  const key = hintKey(intent.chargeScope, intent.ordinal);
  if (!isValidKey(key, economy)) return { ok: false, reason: "invalid", message: MESSAGES.invalid };
  const at = Number.isSafeInteger(intent.at) && intent.at > 0 ? Math.min(intent.at, now) : now;
  return fromOutcome(await post(run, userId, { key, type: "hint_charge", amount: -economy.hint.cost, shields: 0, reason: "Hint", ref: intent.chargeScope, link: null, at }, economy));
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const SNAPSHOT_ENTRIES = 100;
const SNAPSHOT_USES = 400;

export interface WalletSnapshot {
  balance: number;
  /** Shields owned, oldest purchase first. */
  shields: OwnedShield[];
  /** Days protected by a shield. */
  uses: ShieldUse[];
  /** The latest transactions, oldest first, each with the balance after it. */
  entries: LedgerEntry[];
}

export async function getSnapshot(run: Run, userId: number): Promise<WalletSnapshot> {
  await ensureWallet(run, userId);
  const [wallet] = await run(sql`SELECT balance FROM wallets WHERE user_id = ${userId}::int`);
  const balance = num(wallet?.balance);

  const recent = await run(sql`
    SELECT id, key, type, amount, shields_delta, reason, ref, floor(extract(epoch FROM occurred_at) * 1000)::float8 AS at_ms
    FROM wallet_transactions WHERE user_id = ${userId}::int ORDER BY id DESC LIMIT ${SNAPSHOT_ENTRIES}::int
  `);
  let running = balance;
  const entries: LedgerEntry[] = recent.map((row) => {
    const entry: LedgerEntry = {
      id: String(row.id),
      key: String(row.key),
      type: row.type as TransactionType,
      amount: num(row.amount),
      shields: num(row.shields_delta),
      reason: String(row.reason),
      ref: row.ref === null || row.ref === undefined ? null : String(row.ref),
      at: num(row.at_ms),
      balanceAfter: running,
    };
    running -= entry.amount;
    return entry;
  });
  entries.reverse();

  const owned = await run(sql`
    SELECT p.key, p.ref AS bought_on FROM wallet_transactions p
    WHERE p.user_id = ${userId}::int AND p.type = 'purchase'
      AND NOT EXISTS (SELECT 1 FROM wallet_transactions u WHERE u.user_id = ${userId}::int AND u.type = 'shield_use' AND u.link = p.key)
    ORDER BY p.ref, p.id
  `);
  const used = await run(sql`
    SELECT ref AS date, link, floor(extract(epoch FROM occurred_at) * 1000)::float8 AS at_ms
    FROM wallet_transactions WHERE user_id = ${userId}::int AND type = 'shield_use' ORDER BY ref DESC LIMIT ${SNAPSHOT_USES}::int
  `);

  return {
    balance,
    shields: owned.map((r) => ({ key: String(r.key), boughtOn: String(r.bought_on) })),
    uses: used.map((r) => ({ date: String(r.date), shieldKey: String(r.link ?? ""), at: num(r.at_ms) })).reverse(),
    entries,
  };
}

/** Which of these keys the ledger already holds. */
export async function knownKeys(run: Run, userId: number, keys: readonly string[]): Promise<string[]> {
  const list = keys.filter((k) => typeof k === "string" && k.length <= ECONOMY.ledger.maxKeyLength).slice(0, 500);
  if (list.length === 0) return [];
  const rows = await run(sql`SELECT key FROM wallet_transactions WHERE user_id = ${userId}::int AND key IN (${sql.join(list.map((k) => sql`${k}::varchar`), sql`, `)})`);
  return rows.map((r) => String(r.key));
}

// ---------------------------------------------------------------------------
// Streak protection
// ---------------------------------------------------------------------------

/**
 * Uses a shield on every missed day the account's shields can cover, deciding from the days the account really has (every
 * device's, once uploaded). Safe to run as often as you like: a protected day is covered, so a second run finds nothing, and
 * the ledger key `shield:use:<day>` refuses a second shield for the same day even if two runs race. Returns the days newly protected.
 */
export async function protectStreak(run: Run, userId: number, input: { activeDays: ReadonlySet<string>; today: string }, economy: Economy = ECONOMY, now: number = Date.now()): Promise<string[]> {
  const snapshot = await getSnapshot(run, userId);
  if (snapshot.shields.length === 0) return [];
  const plan = planProtection({
    activeDays: input.activeDays,
    protectedDays: new Set(snapshot.uses.map((u) => u.date)),
    shields: snapshot.shields,
    today: input.today,
    lookbackDays: economy.shield.lookbackDays,
  });
  const protectedNow: string[] = [];
  for (const { date, shieldKey } of plan.assignments) {
    try {
      const outcome = await post(run, userId, { key: shieldUseKey(date), type: "shield_use", amount: 0, shields: -1, reason: `Streak Shield protected ${date}`, ref: date, link: shieldKey, at: now }, economy);
      if (outcome.status === "posted") protectedNow.push(date);
    } catch (error) {
      // Another request used this very shield for another day first: the unique link index refused it. Nothing to undo.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return protectedNow;
}
