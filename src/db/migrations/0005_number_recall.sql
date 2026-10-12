-- Number Recall: finished sessions of the digit-memory game, uploaded from the user's device.
--
-- `client_id` is the random id the browser gave a session; the unique index (per user) makes an upload idempotent.
-- `mode` is single or pair, so single-digit and two-digit history stay separate.
-- Idempotent like 0001-0004: `npm run db:migrate` applies it in one transaction and a second run is a no-op.

CREATE TABLE IF NOT EXISTS "recall_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"mode" varchar(10) NOT NULL,
	"config" jsonb NOT NULL,
	"rounds" jsonb NOT NULL,
	"round_count" integer NOT NULL,
	"perfect_count" integer NOT NULL,
	"score" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"longest_recalled" integer NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recall_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recall_sessions_user_client_idx" ON "recall_sessions" ("user_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recall_sessions_user_mode_ended_idx" ON "recall_sessions" ("user_id", "mode", "ended_at");
