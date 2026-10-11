-- Offline practice: sessions run on the user's device and are uploaded later.
--
-- `client_id` is the random id the browser gave a session. The unique index (per user) makes an upload
-- idempotent: sending the same session twice, or resuming after a dropped connection, never duplicates it.
-- Idempotent like 0001/0002: `npm run db:migrate` applies it in one transaction and a second run is a no-op.
-- Existing rows keep a NULL client_id; NULLs never collide in a unique index.

ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "client_id" varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "practice_sessions_user_client_idx" ON "practice_sessions" ("user_id", "client_id");
