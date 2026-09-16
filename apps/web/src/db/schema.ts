/**
 * DevGrade PostgreSQL schema (Drizzle ORM).
 *
 * Decision #1: PostgreSQL in every environment — no SQLite/Postgres split.
 * Decision #4: per-pillar results are normalized into `session_category_scores`
 * rather than hardcoded `reactivity_score`/`lifecycle_score`/... columns, so the
 * schema generalizes to future pillars/frameworks.
 */

import {
  uniqueIndex,
  timestamp,
  integer,
  boolean,
  pgTable,
  varchar,
  pgEnum,
  index,
  jsonb,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import {
  PROFICIENCY_LEVELS,
  SESSION_STATUSES,
  SESSION_STATUS,
  CONTENT_SOURCE,
  DIFFICULTIES,
  FRAMEWORKS,
} from "@/domain/constants";

export const frameworkEnum = pgEnum("framework", FRAMEWORKS);
export const difficultyEnum = pgEnum("difficulty", DIFFICULTIES);
export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const proficiencyEnum = pgEnum("proficiency", PROFICIENCY_LEVELS);

/** Competency pillars as data (extensible), referenced by FK from questions. */
export const skillCategories = pgTable("skill_categories", {
  name: varchar("name", { length: 50 }).primaryKey(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  description: text("description"),
  pillarOrder: integer("pillar_order").notNull(),
});

export const questions = pgTable(
  "questions",
  {
    id: varchar("id", { length: 50 }).primaryKey(),
    framework: frameworkEnum("framework").notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    skillCategory: varchar("skill_category", { length: 50 })
      .notNull()
      .references(() => skillCategories.name),
    title: varchar("title", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    codeBlock: text("code_block"),
    options: jsonb("options").$type<string[]>().notNull(),
    correctAnswer: integer("correct_answer").notNull(),
    explanation: text("explanation").notNull(),
    /** 1.0 = core, 2.0 = advanced; drives weighted scoring + sampling spread (#3). */
    difficultyWeight: real("difficulty_weight").notNull().default(1),
    /** Content provenance for licensing/attribution (see PRD §10.1). */
    source: varchar("source", { length: 100 })
      .notNull()
      .default(CONTENT_SOURCE.ORIGINAL),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_questions_framework_difficulty").on(t.framework, t.difficulty),
    index("idx_questions_category").on(t.skillCategory),
  ],
);

export const testSessions = pgTable(
  "test_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Opaque handle for anonymous access + the user's data-deletion request. */
    sessionToken: varchar("session_token", { length: 64 }).notNull().unique(),
    /** Hashed anonymous cookie id — used for per-client rate limiting, not PII. */
    clientId: varchar("client_id", { length: 64 }).notNull(),
    framework: frameworkEnum("framework").notNull(),
    targetLevel: difficultyEnum("target_level").notNull(),
    status: sessionStatusEnum("status")
      .notNull()
      .default(SESSION_STATUS.IN_PROGRESS),
    /** The 8 selected question ids, in presentation order. */
    selectedQuestionIds: jsonb("selected_question_ids")
      .$type<string[]>()
      .notNull(),
    /** Behavioral anti-cheat signal (not identifying; no fingerprint stored). */
    focusLossCount: integer("focus_loss_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Drives the `abandoned` sweep. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_sessions_status").on(t.status),
    index("idx_sessions_client_recent").on(t.clientId, t.createdAt),
  ],
);

export const sessionAnswers = pgTable(
  "session_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => testSessions.id, { onDelete: "cascade" }),
    questionId: varchar("question_id", { length: 50 })
      .notNull()
      .references(() => questions.id),
    selectedAnswer: integer("selected_answer").notNull(),
    timeSpentSeconds: integer("time_spent_seconds").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One answer per question per session — enforces the API's 409 on duplicates.
    uniqueIndex("uq_answer_session_question").on(t.sessionId, t.questionId),
    index("idx_session_answers_session").on(t.sessionId),
  ],
);

export const sessionResults = pgTable("session_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => testSessions.id, { onDelete: "cascade" }),
  /** Stored so the tier is interpreted relative to the level that was tested. */
  targetLevel: difficultyEnum("target_level").notNull(),
  totalScore: real("total_score").notNull(),
  maxScore: integer("max_score").notNull().default(100),
  proficiencyLevel: proficiencyEnum("proficiency_level").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** #4: normalized per-pillar scores (one row per competency pillar per session). */
export const sessionCategoryScores = pgTable(
  "session_category_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => testSessions.id, { onDelete: "cascade" }),
    skillCategory: varchar("skill_category", { length: 50 })
      .notNull()
      .references(() => skillCategories.name),
    correctWeight: real("correct_weight").notNull(),
    totalWeight: real("total_weight").notNull(),
    scorePct: real("score_pct").notNull(),
    proficiency: proficiencyEnum("proficiency").notNull(),
  },
  (t) => [
    uniqueIndex("uq_category_session").on(t.sessionId, t.skillCategory),
    index("idx_category_scores_session").on(t.sessionId),
  ],
);

/**
 * Post-assessment satisfaction survey — one row per session (§3 KPI).
 * `helpfulnessRating` is a 1..5 score bounded by `SURVEY_RATING_MIN/MAX`.
 */
export const sessionSurveys = pgTable("session_surveys", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => testSessions.id, { onDelete: "cascade" }),
  helpfulnessRating: integer("helpfulness_rating").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type QuestionRow = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type TestSessionRow = typeof testSessions.$inferSelect;
export type SessionAnswerRow = typeof sessionAnswers.$inferSelect;
