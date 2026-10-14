import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Run } from "@/features/rewards/server/wallet";

/**
 * A real Postgres for tests, in-process (PGlite), with the project's own wallet migration applied. The wallet's SQL runs
 * here exactly as written for Neon, so the statements, the constraints and the unique keys are tested, not imitated.
 */

const dialect = new PgDialect();

export async function createTestDb(): Promise<{ db: PGlite; run: Run; addUser: (id: number) => Promise<void> }> {
  const db = new PGlite();
  // The wallet tables hang off `users`; the earlier migrations assume tables that predate them, so only that one is recreated here.
  await db.exec(`CREATE TABLE users (id serial PRIMARY KEY, email varchar(254) NOT NULL, password_hash text NOT NULL, timezone varchar(64) NOT NULL DEFAULT 'UTC', created_at timestamp NOT NULL DEFAULT now())`);
  const file = join(process.cwd(), "src", "db", "migrations", "0009_wallet.sql");
  for (const statement of readFileSync(file, "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) await db.exec(statement);
  const run: Run = async (query: SQL) => {
    const { sql, params } = dialect.sqlToQuery(query);
    const result = await db.query<Record<string, unknown>>(sql, params as unknown[]);
    return result.rows;
  };
  const addUser = async (id: number) => {
    await db.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'x') ON CONFLICT DO NOTHING", [id, `u${id}@example.com`]);
  };
  return { db, run, addUser };
}
