-- Multi-skill support (multiplication, percentage, fraction, square).
--
-- Additive and idempotent: it only adds columns, tables and indexes, relaxes four NOT NULL
-- constraints, and back-fills new columns from existing rows. No existing row or column is
-- removed or rewritten, and running it twice is a no-op. `npm run db:migrate` applies it in a
-- single transaction, so it either completes or changes nothing.

-- Sessions ------------------------------------------------------------------------------------
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "skill" varchar(20) DEFAULT 'multiplication' NOT NULL;
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "focus" varchar(10) DEFAULT 'adaptive' NOT NULL;
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "config" jsonb;
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "question_time_limit_seconds" integer;
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "question_list" jsonb;
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "paused_at" timestamp;
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "paused_ms" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_sessions_skill_started_idx" ON "practice_sessions" ("skill", "started_at");
--> statement-breakpoint

-- Attempts: skill-independent columns -----------------------------------------------------------
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "skill" varchar(20) DEFAULT 'multiplication' NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "exercise_type" varchar(20) DEFAULT 'multiply' NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "question_id" varchar(120);
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "difficulty" varchar(20);
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "prompt" text;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "correct_answer_text" text;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "user_answer_text" text;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "outcome" varchar(12) DEFAULT 'correct' NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "hinted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Existing attempts are all multiplication: describe them in the new columns.
UPDATE "question_attempts"
SET "question_id" = 'multiplication:' || "left_number" || ':' || "right_number",
    "prompt" = "left_number" || ' × ' || "right_number",
    "correct_answer_text" = "correct_answer"::text,
    "user_answer_text" = "user_answer"::text,
    "difficulty" = CASE
      WHEN GREATEST("left_number", "right_number") <= 10 THEN 'beginner'
      WHEN GREATEST("left_number", "right_number") <= 15 THEN 'intermediate'
      ELSE 'advanced'
    END,
    "outcome" = CASE WHEN "is_correct" THEN 'correct' ELSE 'incorrect' END
WHERE "question_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "question_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "difficulty" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "prompt" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "correct_answer_text" SET NOT NULL;
--> statement-breakpoint

-- The multiplication-specific columns stay (and stay filled for multiplication) but are no longer
-- required, because other skills have no left/right operand or integer answer.
ALTER TABLE "question_attempts" ALTER COLUMN "left_number" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "right_number" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "correct_answer" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "user_answer" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_attempts_session_idx" ON "question_attempts" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_attempts_question_idx" ON "question_attempts" ("question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_attempts_skill_created_idx" ON "question_attempts" ("skill", "created_at");
--> statement-breakpoint

-- Per-question statistics and review state for every skill ---------------------------------------
CREATE TABLE IF NOT EXISTS "question_stats" (
  "question_id" varchar(120) PRIMARY KEY NOT NULL,
  "skill" varchar(20) NOT NULL,
  "exercise_type" varchar(20) NOT NULL,
  "concept" varchar(120) NOT NULL,
  "difficulty" varchar(20) NOT NULL,
  "prompt" text NOT NULL,
  "total_attempts" integer DEFAULT 0 NOT NULL,
  "correct_attempts" integer DEFAULT 0 NOT NULL,
  "incorrect_attempts" integer DEFAULT 0 NOT NULL,
  "hinted_attempts" integer DEFAULT 0 NOT NULL,
  "accuracy" integer DEFAULT 0 NOT NULL,
  "average_response_time_ms" integer DEFAULT 0 NOT NULL,
  "fastest_response_time_ms" integer,
  "slowest_response_time_ms" integer,
  "current_correct_streak" integer DEFAULT 0 NOT NULL,
  "current_incorrect_streak" integer DEFAULT 0 NOT NULL,
  "best_correct_streak" integer DEFAULT 0 NOT NULL,
  "weakness_score" integer DEFAULT 50 NOT NULL,
  "box" integer DEFAULT 1 NOT NULL,
  "due_at" timestamp,
  "last_attempted_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_stats_skill_type_idx" ON "question_stats" ("skill", "exercise_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_stats_skill_weakness_idx" ON "question_stats" ("skill", "weakness_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_stats_skill_due_idx" ON "question_stats" ("skill", "due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_stats_concept_idx" ON "question_stats" ("concept");
--> statement-breakpoint

-- Carry the multiplication history (accuracy, streaks, weakness, Leitner box, due date) over from
-- pair_statistics. Rows already present are left alone, so re-running never overwrites newer data.
INSERT INTO "question_stats" (
  "question_id", "skill", "exercise_type", "concept", "difficulty", "prompt",
  "total_attempts", "correct_attempts", "incorrect_attempts", "hinted_attempts", "accuracy",
  "average_response_time_ms", "fastest_response_time_ms", "slowest_response_time_ms",
  "current_correct_streak", "current_incorrect_streak", "best_correct_streak",
  "weakness_score", "box", "due_at", "last_attempted_at", "updated_at"
)
SELECT
  'multiplication:' || "left_number" || ':' || "right_number",
  'multiplication',
  'multiply',
  'multiplication:' || "left_number" || 'x' || "right_number",
  CASE
    WHEN GREATEST("left_number", "right_number") <= 10 THEN 'beginner'
    WHEN GREATEST("left_number", "right_number") <= 15 THEN 'intermediate'
    ELSE 'advanced'
  END,
  "left_number" || ' × ' || "right_number",
  "total_attempts", "correct_attempts", "incorrect_attempts", 0, "accuracy",
  "average_response_time_ms", "fastest_response_time_ms", "slowest_response_time_ms",
  "current_correct_streak", "current_incorrect_streak", "best_correct_streak",
  "weakness_score", "box", "due_at", "last_attempted_at", "updated_at"
FROM "pair_statistics"
ON CONFLICT ("question_id") DO NOTHING;
