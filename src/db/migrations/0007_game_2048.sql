-- 2048: games that ended (no move left) or were given up, uploaded from the user's device.
--
-- `client_id` is the random id the browser gave a game; the unique index (per user) makes an upload idempotent.
-- Idempotent like 0001-0006: `npm run db:migrate` applies it in one transaction and a second run is a no-op.

CREATE TABLE IF NOT EXISTS "game2048_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"score" integer NOT NULL,
	"highest_tile" integer NOT NULL,
	"moves" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"reached_2048" boolean NOT NULL,
	"game_over" boolean NOT NULL,
	"undos_used" integer NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game2048_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game2048_sessions_user_client_idx" ON "game2048_sessions" ("user_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game2048_sessions_user_ended_idx" ON "game2048_sessions" ("user_id", "ended_at");
