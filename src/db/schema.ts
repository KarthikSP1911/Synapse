import { pgTable, serial, integer, timestamp, boolean, varchar, primaryKey, jsonb } from "drizzle-orm/pg-core";

export const practiceSessions = pgTable("practice_sessions", {
  id: serial("id").primaryKey(),
  mode: varchar("mode", { length: 20 }).notNull(), // "fixed", "endless", "timed" or "review"
  targetQuestionCount: integer("target_question_count"), // null for endless
  durationSeconds: integer("duration_seconds"), // only for timed sessions
  weakFocusPercent: integer("weak_focus_percent").default(30).notNull(),
  recentWindow: integer("recent_window").default(5).notNull(),
  pairList: jsonb("pair_list").$type<{ left: number; right: number }[]>(), // only for review sessions
  actualQuestionCount: integer("actual_question_count").default(0).notNull(),
  selectedLeftNumbers: integer("selected_left_numbers").array().notNull(),
  selectedRightNumbers: integer("selected_right_numbers").array().notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  totalCorrect: integer("total_correct").default(0).notNull(),
  totalIncorrect: integer("total_incorrect").default(0).notNull(),
  accuracy: integer("accuracy").default(0).notNull(), // percentage 0-100
  averageResponseTimeMs: integer("average_response_time_ms").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const questionAttempts = pgTable("question_attempts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => practiceSessions.id).notNull(),
  leftNumber: integer("left_number").notNull(),
  rightNumber: integer("right_number").notNull(),
  correctAnswer: integer("correct_answer").notNull(),
  userAnswer: integer("user_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  responseTimeMs: integer("response_time_ms").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
