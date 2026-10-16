-- N-Back: finished sessions (played to the end, or ended by Game Over), uploaded from the user's device.
--
-- `client_id` is the random id the browser gave a session; the unique index (per user) makes an upload idempotent.
-- `config`, `seed`, `generator` and `responses` are the record: the server rebuilds the sequence from the seed and
-- replays the responses. The remaining columns are copies of what that works out to, kept for listing.
-- Idempotent like 0001-0010: `npm run db:migrate` applies it in one transaction and a second run is a no-op.

CREATE TABLE IF NOT EXISTS "nback_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"outcome" varchar(10) NOT NULL,
	"config" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"generator" integer NOT NULL,
	"responses" jsonb NOT NULL,
	"duration_ms" integer NOT NULL,
	"n" integer NOT NULL,
	"stream_count" integer NOT NULL,
	"trials_played" integer NOT NULL,
	"lives_left" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"score" integer NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nback_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nback_sessions_user_client_idx" ON "nback_sessions" ("user_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nback_sessions_user_ended_idx" ON "nback_sessions" ("user_id", "ended_at");
