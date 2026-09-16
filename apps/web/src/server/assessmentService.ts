import { randomBytes } from "node:crypto"

import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { QuestionRow, SessionAnswerRow } from "../db/schema"
import type { AssessmentResult, Question } from "../domain/types"
import type { SkillCategory } from "../domain/constants"
import type { ScorableAnswer } from "../domain/scoring"
import type { Db } from "../db/client"

import { countRecentSessionsByClient, hashClientId } from "../db/queries"
import { createRng, seedFromString } from "../domain/random"
import { AssessmentError, ERROR_CODE } from "./errors"
import { stratifiedSample } from "../domain/sampling"
import { scoreAssessment } from "../domain/scoring"
import { toPublicQuestion } from "../domain/types"
import { MESSAGES } from "./messages"

import {
  MAX_SESSIONS_PER_HOUR,
  TOTAL_QUESTIONS,
  MVP_FRAMEWORKS,
  DIFFICULTIES,
  FRAMEWORKS,
  SESSION_STATUS,
} from "../domain/constants"

import {
  questions as questionsTable,
  sessionCategoryScores,
  sessionAnswers,
  sessionResults,
  testSessions,
} from "../db/schema"

// --- Input validation (§7.2 → 400 on failure) -------------------------------

export const createSessionSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  targetLevel: z.enum(DIFFICULTIES),
})

export const submitAnswerSchema = z.object({
  sessionToken: z.string().min(1),
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().min(0),
  timeSpentSeconds: z.number().int().min(0).max(3600),
})

export const completeSessionSchema = z.object({
  sessionToken: z.string().min(1),
})

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
  }
}

/**
 * Server-side implementation of the assessment API. These functions are the
 * real work behind the TanStack Start server functions / route handlers; they
 * are framework-agnostic and unit-testable with an injected `db`.
 */
export function createAssessmentService(db: Db) {
  return {
    /**
     * `POST /api/sessions` — rate-limit, sample 8 questions, persist the session,
     * and return ALL questions up front (decision #5) as client-safe projections
     * (no answer key). The correct answers never leave the server here.
     */
    async createSession(input: {
      framework: string
      targetLevel: string
      rawClientId: string
    }) {
      const parsed = createSessionSchema.safeParse(input)
      if (!parsed.success) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.invalidFrameworkOrLevel
        )
      }
      const { framework, targetLevel } = parsed.data

      if (!MVP_FRAMEWORKS.includes(framework)) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.frameworkUnavailable(framework, MVP_FRAMEWORKS)
        )
      }

      const clientId = hashClientId(input.rawClientId)
      const recent = await countRecentSessionsByClient(db, clientId, 60)
      if (recent >= MAX_SESSIONS_PER_HOUR) {
        throw new AssessmentError(
          ERROR_CODE.RATE_LIMITED,
          MESSAGES.rateLimited(MAX_SESSIONS_PER_HOUR)
        )
      }

      const poolRows = await db
        .select()
        .from(questionsTable)
        .where(
          and(
            eq(questionsTable.framework, framework),
            eq(questionsTable.difficulty, targetLevel),
            eq(questionsTable.isActive, true)
          )
        )

      const sessionToken = randomBytes(32).toString("hex")
      // Seed sampling from the token → reproducible set for a given session.
      const rng = createRng(seedFromString(sessionToken))
      const { questions, shortfalls } = stratifiedSample(
        poolRows.map(rowToQuestion),
        rng
      )

      if (shortfalls.length > 0 || questions.length < TOTAL_QUESTIONS) {
        throw new AssessmentError(
          ERROR_CODE.INSUFFICIENT_QUESTIONS,
          MESSAGES.insufficientQuestions
        )
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
        .returning({ id: testSessions.id })

      return {
        sessionId: session.id,
        sessionToken,
        totalQuestions: questions.length,
        questions: questions.map(toPublicQuestion),
      }
    },

    /**
     * `POST /api/sessions/:id/answers` — persist one answer with server-computed
     * correctness. Returns only `{ success, sessionComplete }` (decision #5:
     * no `next_question`; the client already holds the full set).
     */
    async submitAnswer(
      sessionId: string,
      input: {
        sessionToken: string
        questionId: string
        selectedAnswer: number
        timeSpentSeconds: number
      }
    ): Promise<{ success: true; sessionComplete: boolean }> {
      const parsed = submitAnswerSchema.safeParse(input)
      if (!parsed.success) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.invalidAnswerPayload
        )
      }
      const { sessionToken, questionId, selectedAnswer, timeSpentSeconds } =
        parsed.data

      const session = await loadOpenSession(db, sessionId, sessionToken)

      if (!session.selectedQuestionIds.includes(questionId)) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.questionNotInSession
        )
      }

      const [question] = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, questionId))
      if (!question)
        throw new AssessmentError(
          ERROR_CODE.NOT_FOUND,
          MESSAGES.questionNotFound
        )
      if (selectedAnswer >= question.options.length) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.optionOutOfRange
        )
      }

      const isCorrect = selectedAnswer === question.correctAnswer

      try {
        await db.insert(sessionAnswers).values({
          sessionId,
          questionId,
          selectedAnswer,
          timeSpentSeconds,
          isCorrect,
        })
      } catch {
        // Unique (session_id, question_id) violation → already answered.
        throw new AssessmentError(ERROR_CODE.CONFLICT, MESSAGES.duplicateAnswer)
      }

      const answered = await db
        .select({ questionId: sessionAnswers.questionId })
        .from(sessionAnswers)
        .where(eq(sessionAnswers.sessionId, sessionId))

      await db
        .update(testSessions)
        .set({ lastActivityAt: new Date() })
        .where(eq(testSessions.id, sessionId))

      return {
        success: true,
        sessionComplete: answered.length >= session.selectedQuestionIds.length,
      }
    },

    /**
     * `POST /api/sessions/:id/complete` — score the session, persist the report
     * (results + normalized per-pillar rows, decision #4) in one transaction,
     * mark the session completed, and return the full report incl. explanations.
     */
    async completeSession(
      sessionId: string,
      input: { sessionToken: string }
    ): Promise<AssessmentResult> {
      const parsed = completeSessionSchema.safeParse(input)
      if (!parsed.success) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.invalidCompletionPayload
        )
      }
      const session = await loadOpenSession(
        db,
        sessionId,
        parsed.data.sessionToken
      )

      const answers = await db
        .select()
        .from(sessionAnswers)
        .where(eq(sessionAnswers.sessionId, sessionId))

      if (answers.length < session.selectedQuestionIds.length) {
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.incompleteAssessment
        )
      }

      const questionRows = await db
        .select()
        .from(questionsTable)
        .where(inArray(questionsTable.id, session.selectedQuestionIds))
      const questionById = new Map(
        questionRows.map((q: QuestionRow) => [q.id, q])
      )

      const scorable: ScorableAnswer[] = answers.map((a: SessionAnswerRow) => {
        const q = questionById.get(a.questionId) as Question
        return {
          question: {
            id: q.id,
            skillCategory: q.skillCategory,
            difficultyWeight: q.difficultyWeight,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          },
          selectedAnswer: a.selectedAnswer,
        }
      })

      const result = scoreAssessment(
        sessionId,
        session.framework,
        session.targetLevel,
        scorable
      )

      await db.transaction(async (tx) => {
        await tx.insert(sessionResults).values({
          sessionId,
          targetLevel: session.targetLevel,
          totalScore: result.totalScore,
          maxScore: result.maxScore,
          proficiencyLevel: result.proficiencyLevel,
        })
        await tx.insert(sessionCategoryScores).values(
          result.categoryScores.map((c) => ({
            sessionId,
            skillCategory: c.skillCategory,
            correctWeight: c.correctWeight,
            totalWeight: c.totalWeight,
            scorePct: c.scorePct,
            proficiency: c.proficiency,
          }))
        )
        await tx
          .update(testSessions)
          .set({
            status: SESSION_STATUS.COMPLETED,
            completedAt: new Date(),
            lastActivityAt: new Date(),
          })
          .where(eq(testSessions.id, sessionId))
      })

      return result
    },
  }
}

async function loadOpenSession(
  db: Db,
  sessionId: string,
  sessionToken: string
) {
  const [session] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, sessionId))

  if (!session || session.sessionToken !== sessionToken) {
    throw new AssessmentError(ERROR_CODE.NOT_FOUND, MESSAGES.sessionNotFound)
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    throw new AssessmentError(
      ERROR_CODE.SESSION_COMPLETED,
      MESSAGES.sessionAlreadyComplete
    )
  }
  return session
}

export type AssessmentService = ReturnType<typeof createAssessmentService>
