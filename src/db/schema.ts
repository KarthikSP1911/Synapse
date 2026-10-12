import { pgTable, serial, integer, timestamp, boolean, varchar, primaryKey, jsonb, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { PracticeConfig } from "@/lib/skills/types";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** Stored lower-cased, so the unique index makes sign-ups case-insensitive. */
    email: varchar("email", { length: 254 }).notNull(),
    /** `scrypt$<salt>$<hash>`; see `src/lib/password.ts`. */
    passwordHash: text("password_hash").notNull(),
    /** IANA zone name (e.g. "Asia/Kolkata"), refreshed at each login; decides which day an attempt counts toward. */
    timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
);

/** Login sessions. Only a SHA-256 hash of the cookie token is stored, so a leaked table cannot be replayed. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId), index("auth_sessions_expires_idx").on(table.expiresAt)]
);

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: serial("id").primaryKey(),
    /** Owner. Null only for sessions that predate accounts; the first account to sign up claims them. */
    userId: integer("user_id").references(() => users.id),
    skill: varchar("skill", { length: 20 }).default("multiplication").notNull(), // multiplication | percentage | fraction | square
    mode: varchar("mode", { length: 20 }).notNull(), // "fixed", "endless", "timed" or "review"
    focus: varchar("focus", { length: 10 }).default("adaptive").notNull(), // adaptive | weak | due
    /** What the session may ask. Null on sessions created before multi-skill support: derived from the selected numbers. */
    config: jsonb("config").$type<PracticeConfig>(),
    targetQuestionCount: integer("target_question_count"), // null for endless
    durationSeconds: integer("duration_seconds"), // only for timed sessions
    /** Optional per-question limit; an unanswered question past it is recorded as timed out. */
    questionTimeLimitSeconds: integer("question_time_limit_seconds"),
    weakFocusPercent: integer("weak_focus_percent").default(30).notNull(),
    recentWindow: integer("recent_window").default(5).notNull(),
    /** Review sessions of multiplication created before multi-skill support. New review sessions use questionList. */
    pairList: jsonb("pair_list").$type<{ left: number; right: number }[]>(),
    /** The stable question ids of a review session. */
    questionList: jsonb("question_list").$type<string[]>(),
    actualQuestionCount: integer("actual_question_count").default(0).notNull(),
    selectedLeftNumbers: integer("selected_left_numbers").array().notNull(), // multiplication only; empty otherwise
    selectedRightNumbers: integer("selected_right_numbers").array().notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    /** Set while the session is paused. */
    pausedAt: timestamp("paused_at"),
    /** Total time spent paused; pushes a timed session's deadline back. */
    pausedMs: integer("paused_ms").default(0).notNull(),
    totalCorrect: integer("total_correct").default(0).notNull(),
    totalIncorrect: integer("total_incorrect").default(0).notNull(),
    accuracy: integer("accuracy").default(0).notNull(), // percentage 0-100
    averageResponseTimeMs: integer("average_response_time_ms").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Set on sessions practised on the user's device and uploaded later: the browser's random id for it, which makes re-uploads idempotent. */
    clientId: varchar("client_id", { length: 64 }),
  },
  (table) => [
    uniqueIndex("practice_sessions_user_client_idx").on(table.userId, table.clientId),
    index("practice_sessions_skill_started_idx").on(table.skill, table.startedAt),
    index("practice_sessions_user_started_idx").on(table.userId, table.startedAt),
  ]
);

export const questionAttempts = pgTable(
  "question_attempts",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").references(() => practiceSessions.id).notNull(),
    userId: integer("user_id").references(() => users.id),
    skill: varchar("skill", { length: 20 }).default("multiplication").notNull(),
    exerciseType: varchar("exercise_type", { length: 20 }).default("multiply").notNull(),
    /** Stable id of the question, e.g. `percentage:of:25:80`. */
    questionId: varchar("question_id", { length: 120 }).notNull(),
    difficulty: varchar("difficulty", { length: 20 }).notNull(),
    /** The question as shown, kept so history stays readable if generators change. */
    prompt: text("prompt").notNull(),
    // Operands of multiplication attempts, kept filled for those so older queries keep working.
    leftNumber: integer("left_number"),
    rightNumber: integer("right_number"),
    correctAnswer: integer("correct_answer"),
    userAnswer: integer("user_answer"),
    /** Skill-independent answers as text ("3/4", "60%"). User answer is null when skipped or timed out. */
    correctAnswerText: text("correct_answer_text").notNull(),
    userAnswerText: text("user_answer_text"),
    isCorrect: boolean("is_correct").notNull(),
    /** correct | incorrect | skipped | timed_out */
    outcome: varchar("outcome", { length: 12 }).default("correct").notNull(),
    hinted: boolean("hinted").default(false).notNull(),
    responseTimeMs: integer("response_time_ms").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("question_attempts_session_idx").on(table.sessionId),
    index("question_attempts_question_idx").on(table.questionId),
    index("question_attempts_skill_created_idx").on(table.skill, table.createdAt),
    index("question_attempts_user_created_idx").on(table.userId, table.createdAt),
  ]
);

/**
 * Per-user, per-question performance and review state for every skill (the learning item is the
 * stable question id; each user has their own row for it). Multiplication pairs were copied here from `pair_statistics` by the multi-skill
 * migration, which is no longer written to.
 */
export const questionStats = pgTable(
  "question_stats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    questionId: varchar("question_id", { length: 120 }).notNull(),
    skill: varchar("skill", { length: 20 }).notNull(),
    exerciseType: varchar("exercise_type", { length: 20 }).notNull(),
    /** Related questions share a concept, e.g. `square:17` or `percentage:pct:25`. */
    concept: varchar("concept", { length: 120 }).notNull(),
    difficulty: varchar("difficulty", { length: 20 }).notNull(),
    prompt: text("prompt").notNull(),
    totalAttempts: integer("total_attempts").default(0).notNull(),
    correctAttempts: integer("correct_attempts").default(0).notNull(),
    incorrectAttempts: integer("incorrect_attempts").default(0).notNull(),
    hintedAttempts: integer("hinted_attempts").default(0).notNull(),
    accuracy: integer("accuracy").default(0).notNull(),
    averageResponseTimeMs: integer("average_response_time_ms").default(0).notNull(),
    fastestResponseTimeMs: integer("fastest_response_time_ms"),
    slowestResponseTimeMs: integer("slowest_response_time_ms"),
    currentCorrectStreak: integer("current_correct_streak").default(0).notNull(),
    currentIncorrectStreak: integer("current_incorrect_streak").default(0).notNull(),
    bestCorrectStreak: integer("best_correct_streak").default(0).notNull(),
    weaknessScore: integer("weakness_score").default(50).notNull(), // 0-100, default neutral
    box: integer("box").default(1).notNull(), // Leitner box 1-5
    dueAt: timestamp("due_at"), // next review; null = never scheduled, treated as due
    lastAttemptedAt: timestamp("last_attempted_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("question_stats_user_question_idx").on(table.userId, table.questionId),
    index("question_stats_skill_type_idx").on(table.skill, table.exerciseType),
    index("question_stats_skill_weakness_idx").on(table.skill, table.weaknessScore),
    index("question_stats_skill_due_idx").on(table.skill, table.dueAt),
    index("question_stats_concept_idx").on(table.concept),
  ]
);

/** Legacy multiplication-only statistics. Superseded by `question_stats`; kept so no data is lost. */
export const pairStatistics = pgTable("pair_statistics", {
  leftNumber: integer("left_number").notNull(),
  rightNumber: integer("right_number").notNull(),
  totalAttempts: integer("total_attempts").default(0).notNull(),
  correctAttempts: integer("correct_attempts").default(0).notNull(),
  incorrectAttempts: integer("incorrect_attempts").default(0).notNull(),
  accuracy: integer("accuracy").default(0).notNull(),
  averageResponseTimeMs: integer("average_response_time_ms").default(0).notNull(),
  fastestResponseTimeMs: integer("fastest_response_time_ms"),
  slowestResponseTimeMs: integer("slowest_response_time_ms"),
  currentCorrectStreak: integer("current_correct_streak").default(0).notNull(),
  currentIncorrectStreak: integer("current_incorrect_streak").default(0).notNull(),
  bestCorrectStreak: integer("best_correct_streak").default(0).notNull(),
  weaknessScore: integer("weakness_score").default(50).notNull(), // 0-100, default neutral
  box: integer("box").default(1).notNull(), // Leitner box 1-5
  dueAt: timestamp("due_at"), // next review; null = never scheduled, treated as due
  lastAttemptedAt: timestamp("last_attempted_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.leftNumber, table.rightNumber] }),
  };
});

export const tableStatistics = pgTable("table_statistics", {
  number: integer("number").primaryKey(),
  totalAttempts: integer("total_attempts").default(0).notNull(),
  correctAttempts: integer("correct_attempts").default(0).notNull(),
  incorrectAttempts: integer("incorrect_attempts").default(0).notNull(),
  accuracy: integer("accuracy").default(0).notNull(),
  averageResponseTimeMs: integer("average_response_time_ms").default(0).notNull(),
  weaknessScore: integer("weakness_score").default(50).notNull(),
  lastAttemptedAt: timestamp("last_attempted_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Finished MindSprint sessions of a signed-in user. `rounds` holds each round's settings, the numbers that were
 * flashed and the answer given (see `src/lib/mindsprint/records.ts`); correctness and points are worked out from
 * it again, so the figures below are only copies kept for listing and aggregating.
 */
export const mindsprintSessions = pgTable(
  "mindsprint_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /** The browser's random id for the session; unique per user, which makes uploads idempotent. */
    clientId: varchar("client_id", { length: 64 }).notNull(),
    rounds: jsonb("rounds").$type<unknown[]>().notNull(),
    roundCount: integer("round_count").notNull(),
    correctCount: integer("correct_count").notNull(),
    score: integer("score").notNull(),
    accuracy: integer("accuracy").notNull(), // percentage 0-100
    averageResponseTimeMs: integer("average_response_time_ms").default(0).notNull(),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mindsprint_sessions_user_client_idx").on(table.userId, table.clientId),
    index("mindsprint_sessions_user_ended_idx").on(table.userId, table.endedAt),
  ]
);

/**
 * Finished Number Recall sessions of a signed-in user. `config` and `rounds` hold the settings, each round's
 * sequence (as text, so leading zeros survive) and the answer given (see `src/lib/recall/records.ts`); points are
 * worked out from them again, so the figures below are only copies kept for listing and aggregating. Single-digit
 * and two-digit sessions are told apart by `mode`.
 */
export const recallSessions = pgTable(
  "recall_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /** The browser's random id for the session; unique per user, which makes uploads idempotent. */
    clientId: varchar("client_id", { length: 64 }).notNull(),
    mode: varchar("mode", { length: 10 }).notNull(), // single | pair
    config: jsonb("config").$type<unknown>().notNull(),
    rounds: jsonb("rounds").$type<unknown[]>().notNull(),
    roundCount: integer("round_count").notNull(),
    perfectCount: integer("perfect_count").notNull(),
    score: integer("score").notNull(),
    accuracy: integer("accuracy").notNull(), // percentage of rounds recalled perfectly, 0-100
    longestRecalled: integer("longest_recalled").notNull(),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("recall_sessions_user_client_idx").on(table.userId, table.clientId),
    index("recall_sessions_user_mode_ended_idx").on(table.userId, table.mode, table.endedAt),
  ]
);
