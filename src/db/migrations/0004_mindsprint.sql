-- MindSprint: finished sessions of the flash-arithmetic game, uploaded from the user's device.
--
-- `client_id` is the random id the browser gave a session. The unique index (per user) makes an upload
-- idempotent: sending the same session twice, or resuming after a dropped connection, never duplicates it.
-- Idempotent like 0001-0003: `npm run db:migrate` applies it in one transaction and a second run is a no-op.

CREATE TABLE IF NOT EXISTS "mindsprint_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"rounds" jsonb NOT NULL,
	"round_count" integer NOT NULL,
	"correct_count" integer NOT NULL,
	"score" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"average_response_time_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mindsprint_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mindsprint_sessions_user_client_idx" ON "mindsprint_sessions" ("user_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mindsprint_sessions_user_ended_idx" ON "mindsprint_sessions" ("user_id", "ended_at");
