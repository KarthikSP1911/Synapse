-- Accounts: email + password login, and per-user practice data.
--
-- Idempotent, like 0001: `npm run db:migrate` applies it in a single transaction, so it either
-- completes or changes nothing, and running it twice is a no-op.
--
-- Rows created before accounts existed get a NULL user_id. Nothing is deleted or rewritten: the
-- first account to sign up claims every NULL row (see `registerUser` in src/lib/auth.ts).

-- Users and login sessions ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(254) NOT NULL,
  "password_hash" text NOT NULL,
  "timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_user_idx" ON "auth_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_idx" ON "auth_sessions" ("expires_at");
--> statement-breakpoint

-- Ownership columns ---------------------------------------------------------------------------------
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "question_stats" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_sessions_user_started_idx" ON "practice_sessions" ("user_id", "started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_attempts_user_created_idx" ON "question_attempts" ("user_id", "created_at");
--> statement-breakpoint

-- question_stats: one row per (user, question) instead of one per question --------------------------
-- The question id alone can no longer be the primary key, so the table gets a surrogate key and a
-- unique index on (user_id, question_id). Legacy rows (NULL user_id) are not considered equal by
-- that index, but they were unique per question already.
ALTER TABLE "question_stats" ADD COLUMN IF NOT EXISTS "id" serial;
--> statement-breakpoint
DO $$
DECLARE
  pk_name text;
BEGIN
  SELECT c.conname INTO pk_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'question_stats'::regclass AND c.contype = 'p' AND a.attname = 'question_id';
  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE question_stats DROP CONSTRAINT %I', pk_name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'question_stats'::regclass AND contype = 'p') THEN
    ALTER TABLE question_stats ADD PRIMARY KEY (id);
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "question_stats_user_question_idx" ON "question_stats" ("user_id", "question_id");
