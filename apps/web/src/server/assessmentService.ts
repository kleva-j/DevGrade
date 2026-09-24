import { randomBytes } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { QuestionRow, SessionAnswerRow } from "@/db/schema";
import type { AssessmentResult, Question } from "@/domain/types";
import type { SkillCategory } from "@/domain/constants";
import type { ScorableAnswer } from "@/domain/scoring";
import type { Db } from "@/db/client";

import { createRng, seedFromString } from "@/domain/random";
import { AssessmentError, ERROR_CODE } from "./errors";
import { stratifiedSample } from "@/domain/sampling";
import { scoreAssessment } from "@/domain/scoring";
import { toPublicQuestion } from "@/domain/types";
import { MESSAGES } from "./messages";
import { createSessionInput } from "./assessmentValidation";

import {
  countRecentSessionsByClient,
  isUniqueViolation,
  hashClientId,
} from "@/db/queries";

import {
  RATE_LIMIT_WINDOW_MINUTES,
  MAX_SESSIONS_PER_HOUR,
  SURVEY_RATING_MIN,
  SURVEY_RATING_MAX,
  MVP_FRAMEWORKS,
  SESSION_STATUS,
} from "@/domain/constants";

import {
  questions as questionsTable,
  sessionCategoryScores,
  sessionAnswers,
  sessionResults,
  sessionSurveys,
  testSessions,
} from "@/db/schema";

// --- Input validation (§7.2 → 400 on failure) -------------------------------

export const submitAnswerSchema = z.object({
  sessionToken: z.string().min(1),
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().min(0),
  timeSpentSeconds: z.number().int().min(0).max(3600),
});

export const completeSessionSchema = z.object({
  sessionToken: z.string().min(1),
});

export const submitSurveySchema = z.object({
  sessionToken: z.string().min(1),
  rating: z.number().int().min(SURVEY_RATING_MIN).max(SURVEY_RATING_MAX),
});

// --- Helpers -----------------------------------------------------------------

function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    framework: row.framework,
    difficulty: row.difficulty,
    skillCategory: row.skillCategory as SkillCategory,
    title: row.title,
    prompt: row.prompt,
    codeBlock: row.codeBlock,
    options: row.options,
    correctAnswer: row.correctAnswer,
    explanation: row.explanation,
    difficultyWeight: row.difficultyWeight,
  };
}

/**
 * Server-side implementation of the assessment API. These functions are the
 * real work behind the TanStack Start server functions / route handlers; they
 * are framework-agnostic and unit-testable with an injected `db`.
 */
export function createAssessmentService(db: Db) {
  return {
    /**
     * `POST /api/sessions` — rate-limit, sample the requested count, persist it,
     * and return ALL questions up front (decision #5) as client-safe projections
     * (no answer key). The correct answers never leave the server here.
     */
    async createSession(input: {
      framework: string;
      targetLevel: string;
      questionCount?: number;
      rawClientId: string;
    }) {
      const parsed = createSessionInput.safeParse(input);
      if (!parsed.success) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.invalidSessionConfiguration,
        );
      }
      const { framework, targetLevel, questionCount } = parsed.data;

      if (!MVP_FRAMEWORKS.includes(framework)) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.frameworkUnavailable(framework, MVP_FRAMEWORKS),
        );
      }

      const clientId = hashClientId(input.rawClientId);
      const recent = await countRecentSessionsByClient(
        db,
        clientId,
        RATE_LIMIT_WINDOW_MINUTES,
      );
      if (recent >= MAX_SESSIONS_PER_HOUR) {
        throw new AssessmentError(
          ERROR_CODE.RATE_LIMITED,
          MESSAGES.rateLimited(MAX_SESSIONS_PER_HOUR),
        );
      }

      const poolRows = await db
        .select()
        .from(questionsTable)
        .where(
          and(
            eq(questionsTable.framework, framework),
            eq(questionsTable.difficulty, targetLevel),
            eq(questionsTable.isActive, true),
          ),
        )
        .orderBy(questionsTable.id);

      const sessionToken = randomBytes(32).toString("hex");
      // Seed sampling from the token → reproducible set for a given session.
      const rng = createRng(seedFromString(sessionToken));
      const { questions, shortfalls } = stratifiedSample(
        poolRows.map(rowToQuestion),
        questionCount,
        rng,
      );

      if (shortfalls.length > 0 || questions.length !== questionCount) {
        throw new AssessmentError(
          ERROR_CODE.INSUFFICIENT_QUESTIONS,
          MESSAGES.insufficientQuestions,
        );
      }

      const [session] = await db
        .insert(testSessions)
        .values({
          sessionToken,
          clientId,
          framework,
          targetLevel,
          selectedQuestionIds: questions.map((q) => q.id),
        })
        .returning({ id: testSessions.id });

      return {
        sessionId: session!.id,
        sessionToken,
        totalQuestions: questions.length,
        questions: questions.map(toPublicQuestion),
      };
    },

    /**
     * `POST /api/sessions/:id/answers` — persist one answer with server-computed
     * correctness. Returns only `{ success, sessionComplete }` (decision #5:
     * no `next_question`; the client already holds the full set).
     */
    async submitAnswer(
      sessionId: string,
      input: {
        sessionToken: string;
        questionId: string;
        selectedAnswer: number;
        timeSpentSeconds: number;
      },
    ): Promise<{ success: true; sessionComplete: boolean }> {
      const parsed = submitAnswerSchema.safeParse(input);
      if (!parsed.success) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.invalidAnswerPayload,
        );
      }
      const { sessionToken, questionId, selectedAnswer, timeSpentSeconds } =
        parsed.data;

      const session = await loadOpenSession(db, sessionId, sessionToken);

      if (!session.selectedQuestionIds.includes(questionId)) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.questionNotInSession,
        );
      }

      const [question] = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, questionId));
      if (!question)
        throw new AssessmentError(
          ERROR_CODE.NOT_FOUND,
          MESSAGES.questionNotFound,
        );
      if (selectedAnswer >= question.options.length) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.optionOutOfRange,
        );
      }

      const isCorrect = selectedAnswer === question.correctAnswer;

      try {
        await db.insert(sessionAnswers).values({
          sessionId,
          questionId,
          selectedAnswer,
          timeSpentSeconds,
          isCorrect,
        });
      } catch (err) {
        // Only a unique (session_id, question_id) violation means "already
        // answered"; anything else is a real DB error and must surface.
        if (isUniqueViolation(err)) {
          throw new AssessmentError(
            ERROR_CODE.CONFLICT,
            MESSAGES.duplicateAnswer,
          );
        }
        throw err;
      }

      const [answeredRow] = await db
        .select({ answered: sql<number>`count(*)::int` })
        .from(sessionAnswers)
        .where(eq(sessionAnswers.sessionId, sessionId));
      const answered = answeredRow?.answered ?? 0;

      await db
        .update(testSessions)
        .set({ lastActivityAt: new Date() })
        .where(eq(testSessions.id, sessionId));

      return {
        success: true,
        sessionComplete: answered >= session.selectedQuestionIds.length,
      };
    },

    /**
     * `POST /api/sessions/:id/complete` — score the session, persist the report
     * (results + normalized per-pillar rows, decision #4) in one transaction,
     * mark the session completed, and return the full report incl. explanations.
     */
    async completeSession(
      sessionId: string,
      input: { sessionToken: string },
    ): Promise<AssessmentResult> {
      const parsed = completeSessionSchema.safeParse(input);
      if (!parsed.success) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.invalidCompletionPayload,
        );
      }
      const session = await loadOpenSession(
        db,
        sessionId,
        parsed.data.sessionToken,
      );

      const answers = await db
        .select()
        .from(sessionAnswers)
        .where(eq(sessionAnswers.sessionId, sessionId));

      if (answers.length < session.selectedQuestionIds.length) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.incompleteAssessment,
        );
      }

      const questionRows = await db
        .select()
        .from(questionsTable)
        .where(inArray(questionsTable.id, session.selectedQuestionIds));
      const questionById = new Map(
        questionRows.map((q: QuestionRow) => [q.id, q]),
      );

      const scorable: ScorableAnswer[] = answers.map((a: SessionAnswerRow) => {
        const q = questionById.get(a.questionId);
        if (!q) {
          throw new AssessmentError(
            ERROR_CODE.NOT_FOUND,
            MESSAGES.questionNotFound,
          );
        }
        return {
          question: {
            id: q.id,
            skillCategory: q.skillCategory as SkillCategory,
            difficultyWeight: q.difficultyWeight,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          },
          selectedAnswer: a.selectedAnswer,
        };
      });

      const result = scoreAssessment(
        sessionId,
        session.framework,
        session.targetLevel,
        scorable,
      );

      await db.transaction(async (tx) => {
        await tx.insert(sessionResults).values({
          sessionId,
          targetLevel: session.targetLevel,
          totalScore: result.totalScore,
          maxScore: result.maxScore,
          proficiencyLevel: result.proficiencyLevel,
        });
        await tx.insert(sessionCategoryScores).values(
          result.categoryScores.map((c) => ({
            sessionId,
            skillCategory: c.skillCategory,
            correctWeight: c.correctWeight,
            totalWeight: c.totalWeight,
            scorePct: c.scorePct,
            proficiency: c.proficiency,
          })),
        );
        await tx
          .update(testSessions)
          .set({
            status: SESSION_STATUS.COMPLETED,
            completedAt: new Date(),
            lastActivityAt: new Date(),
          })
          .where(eq(testSessions.id, sessionId));
      });

      return result;
    },

    /**
     * `POST /api/sessions/:id/survey` — record the post-assessment satisfaction
     * rating (§3 KPI). Only allowed once the session is completed; a re-submit
     * upserts so the candidate can change their rating without a 409.
     */
    async submitSurvey(
      sessionId: string,
      input: { sessionToken: string; rating: number },
    ): Promise<{ success: true }> {
      const parsed = submitSurveySchema.safeParse(input);
      if (!parsed.success) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.invalidSurveyPayload,
        );
      }
      const { sessionToken, rating } = parsed.data;

      const session = await loadSession(db, sessionId, sessionToken);
      if (session.status !== SESSION_STATUS.COMPLETED) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.surveyBeforeComplete,
        );
      }

      await db
        .insert(sessionSurveys)
        .values({ sessionId, helpfulnessRating: rating })
        .onConflictDoUpdate({
          target: sessionSurveys.sessionId,
          set: { helpfulnessRating: rating },
        });

      return { success: true };
    },
  };
}

/** Load a session and verify the caller holds its opaque token, or 404. */
async function loadSession(db: Db, sessionId: string, sessionToken: string) {
  const [session] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, sessionId));

  if (!session || session.sessionToken !== sessionToken) {
    throw new AssessmentError(ERROR_CODE.NOT_FOUND, MESSAGES.sessionNotFound);
  }
  return session;
}

/** Like `loadSession`, but rejects an already-completed session (409). */
async function loadOpenSession(
  db: Db,
  sessionId: string,
  sessionToken: string,
) {
  const session = await loadSession(db, sessionId, sessionToken);
  if (session.status === SESSION_STATUS.COMPLETED) {
    throw new AssessmentError(
      ERROR_CODE.SESSION_COMPLETED,
      MESSAGES.sessionAlreadyComplete,
    );
  }
  return session;
}

export type AssessmentService = ReturnType<typeof createAssessmentService>;
