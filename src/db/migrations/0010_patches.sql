-- Patches: games that ended (solved or given up), uploaded from the user's device.
--
-- `client_id` is the random id the browser gave a game; the unique index (per user) makes an upload idempotent.
-- `puzzle` is the board in text form (size and clues); its solution is unique and so is not stored.
-- Idempotent like 0001-0009: `npm run db:migrate` applies it in one transaction and a second run is a no-op.

CREATE TABLE IF NOT EXISTS "patches_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"difficulty" varchar(10) NOT NULL,
	"puzzle" varchar(600) NOT NULL,
	"completed" boolean NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"hints_used" integer NOT NULL,
	"score" integer NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "patches_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patches_sessions_user_client_idx" ON "patches_sessions" ("user_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patches_sessions_user_difficulty_ended_idx" ON "patches_sessions" ("user_id", "difficulty", "ended_at");
