-- Profiles: a username chosen at sign-up, plus the optional details shown on the profile page.
--
-- Every column is nullable or has a default, so existing accounts keep working untouched; they simply have no
-- username until they set one on the edit-profile page. `username` is stored lower-cased and the partial unique
-- index ignores the NULLs of those older accounts.
-- Idempotent like 0001-0011: `npm run db:migrate` applies it in one transaction and a second run is a no-op.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(20);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" varchar(40);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" varchar(24) DEFAULT 'brain' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" varchar(160);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" varchar(60);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "goal" varchar(16);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "level" varchar(16);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username") WHERE "username" IS NOT NULL;
