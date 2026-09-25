import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { AssessmentResult, Question } from "@/domain/types";
import type { SkillCategory } from "@/domain/constants";
import type { QuestionRow } from "@/db/schema";
import type { Db } from "@/db/client";
import type {
  SessionDiscoveryResult,
  AcceptedAnswerResult,
  DeleteSessionResult,
  DeleteSessionInput,
  SessionCredential,
  SessionMetadata,
  CreatedSession,
  SessionView,
} from "@/domain/sessionContracts";

import {
  countRecentSessionsByClient,
  databaseTime,
  hashClientId,
} from "@/db/queries";
import {
  questions as questionsTable,
  sessionCategoryScores,
  skillCategories,
  sessionAnswers,
  sessionResults,
  sessionSurveys,
  testSessions,
} from "@/db/schema";
import {
  MAX_SESSIONS_PER_HOUR,
  SNAPSHOT_ERROR_CODE,
  DELETE_EXPECTATION,
  SESSION_DISCOVERY,
  DELETE_OUTCOME,
  MVP_FRAMEWORKS,
  SESSION_STATUS,
  SESSION_VIEW,
} from "@/domain/constants";
import { createRng, seedFromString } from "@/domain/random";
import { stratifiedSample } from "@/domain/sampling";
import {
  createQuestionSnapshot,
  createReportSnapshot,
  SnapshotError,
} from "@/domain/sessionSnapshots";
import { toPublicQuestion } from "@/domain/types";
import {
  sessionCredentialSchema,
  discoverSessionsInput,
  createSessionInput,
  deleteSessionInput,
  submitAnswerInput,
  submitSurveyInput,
  parseInput,
} from "./assessmentValidation";
import { AssessmentError, ERROR_CODE, ExistingAttemptError } from "./errors";
import { MESSAGES } from "./messages";
import {
  authenticatedSession,
  withLockedSession,
  requireUnfinished,
  acceptedAnswers,
  knownAnswerIds,
  knownSessions,
  requireAccess,
  sessionView,
  deadlines,
  lifecycle,
  metadata,
  progress,
} from "./sessionAccess";

// Preserve validator exports for existing service consumers.
export {
  completeSessionSchema,
  submitAnswerSchema,
  submitSurveySchema,
} from "./assessmentValidation";

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

/** Framework-independent service. Invalid input is rejected before opening a DB transaction. */
export function createAssessmentService(db: Db) {
  return {
    async createSession(input: {
      framework: string;
      targetLevel: string;
      questionCount?: number;
      rawClientId: string;
      knownCredentials?: SessionCredential[];
    }): Promise<CreatedSession> {
      const {
        framework,
        targetLevel,
        questionCount,
        rawClientId,
        knownCredentials: credentials = [],
      } = parseInput(createSessionInput, input);
      if (!MVP_FRAMEWORKS.includes(framework))
        throw new AssessmentError(
          ERROR_CODE.BAD_REQUEST,
          MESSAGES.frameworkUnavailable(framework, MVP_FRAMEWORKS),
        );
      return db.transaction(async (tx) => {
        // Recheck the ENTIRE validated list; discovery responses never authorize creation.
        const known = await knownSessions(tx, credentials, true);
        const checkedAt = await databaseTime(tx);
        const answers = await knownAnswerIds(tx, known.values());
        const blockers: SessionMetadata[] = [];
        for (const session of known.values()) {
          if (lifecycle(session, checkedAt).blocksCreation) {
            blockers.push(
              metadata(session, checkedAt, answers.get(session.id) ?? []),
            );
          }
        }
        if (blockers.length) throw new ExistingAttemptError(blockers);

        const clientId = hashClientId(rawClientId);
        if (
          (await countRecentSessionsByClient(tx, clientId)) >=
          MAX_SESSIONS_PER_HOUR
        )
          throw new AssessmentError(
            ERROR_CODE.RATE_LIMITED,
            MESSAGES.rateLimited(MAX_SESSIONS_PER_HOUR),
          );
        const poolRows = await tx
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
        const { questions, shortfalls } = stratifiedSample(
          poolRows.map(rowToQuestion),
          questionCount,
          createRng(seedFromString(sessionToken)),
        );
        if (shortfalls.length || questions.length !== questionCount)
          throw new AssessmentError(
            ERROR_CODE.INSUFFICIENT_QUESTIONS,
            MESSAGES.insufficientQuestions,
          );
        const selectedQuestionIds = questions.map((q) => q.id);
        const rowsById = new Map(poolRows.map((row) => [row.id, row]));
        const pillarRows = await tx
          .select()
          .from(skillCategories)
          .orderBy(skillCategories.pillarOrder, skillCategories.name);
        const selectedCategories = new Set(
          questions.map((q) => q.skillCategory),
        );
        const questionSnapshot = createQuestionSnapshot(
          selectedQuestionIds,
          questions.map((q) => ({ ...q, source: rowsById.get(q.id)!.source })),
          pillarRows
            .filter((row) => selectedCategories.has(row.name as SkillCategory))
            .map((row) => ({
              skillCategory: row.name as SkillCategory,
              displayName: row.displayName,
              description: row.description,
              order: row.pillarOrder,
            })),
          { framework, targetLevel },
        );
        const createdAt = await databaseTime(tx);
        const [session] = await tx
          .insert(testSessions)
          .values({
            sessionToken,
            clientId,
            framework,
            targetLevel,
            selectedQuestionIds,
            questionSnapshot,
            createdAt,
            startedAt: createdAt,
            lastActivityAt: createdAt,
          })
          .returning();
        return {
          sessionId: session!.id,
          sessionToken,
          totalQuestions: questions.length,
          questions: questionSnapshot.questions.map(toPublicQuestion),
          ...deadlines(lifecycle(session!, createdAt)),
        };
      });
    },

    async discoverSessions(input: {
      credentials: SessionCredential[];
    }): Promise<SessionDiscoveryResult> {
      const { credentials } = parseInput(discoverSessionsInput, input);
      return db.transaction(
        async (tx) => {
          const known = await knownSessions(tx, credentials, false);
          const now = await databaseTime(tx);
          const answers = await knownAnswerIds(tx, known.values());
          const sessions: SessionDiscoveryResult["sessions"] = [];
          for (const credential of credentials) {
            const session = known.get(credential.sessionId);
            // No expiry/content distinction for unavailable credentials, including missing rows.
            if (
              !session ||
              session.sessionToken !== credential.sessionToken ||
              lifecycle(session, now).accessExpired
            ) {
              sessions.push({
                kind: SESSION_DISCOVERY.UNAVAILABLE,
                sessionId: credential.sessionId,
              });
            } else {
              sessions.push({
                kind: SESSION_DISCOVERY.AVAILABLE,
                metadata: metadata(session, now, answers.get(session.id) ?? []),
              });
            }
          }
          return { sessions };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },

    async getSession(input: SessionCredential): Promise<SessionView> {
      const credential = parseInput(sessionCredentialSchema, input);
      return db.transaction(
        async (tx) => {
          const session = await authenticatedSession(tx, credential);
          // Request-time authorization on one coherent snapshot; later deletion cannot recall it.
          return sessionView(tx, session, await databaseTime(tx));
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },

    async resumeSession(input: SessionCredential): Promise<SessionView> {
      const credential = parseInput(sessionCredentialSchema, input);
      return withLockedSession(db, credential, async (tx, session, now) => {
        const policy = lifecycle(session, now);
        requireAccess(policy);
        // Completed and expired/legacy attempts return their view without touching activity.
        if (!policy.canResume) return sessionView(tx, session, now);
        const resumed = {
          ...session,
          status: SESSION_STATUS.IN_PROGRESS,
          lastActivityAt: now,
        };
        await tx
          .update(testSessions)
          .set({ status: resumed.status, lastActivityAt: now })
          .where(eq(testSessions.id, session.id));
        return sessionView(tx, resumed, now);
      });
    },

    async submitAnswer(
      sessionId: string,
      input: {
        sessionToken: string;
        questionId: string;
        selectedAnswer: number;
        timeSpentSeconds: number;
      },
    ): Promise<AcceptedAnswerResult> {
      const data = parseInput(submitAnswerInput, { ...input, sessionId });
      return withLockedSession(db, data, async (tx, session, now) => {
        const snapshot = requireUnfinished(session, lifecycle(session, now));
        const question = snapshot.questions.find(
          (q) => q.id === data.questionId,
        );
        if (!question)
          throw new AssessmentError(
            ERROR_CODE.BAD_REQUEST,
            MESSAGES.questionNotInSession,
          );
        if (data.selectedAnswer >= question.options.length)
          throw new AssessmentError(
            ERROR_CODE.BAD_REQUEST,
            MESSAGES.optionOutOfRange,
          );
        const answers = await acceptedAnswers(tx, session.id);
        let accepted = answers.find(
          (answer) => answer.questionId === data.questionId,
        );
        if (accepted) {
          if (accepted.selectedAnswer !== data.selectedAnswer)
            throw new AssessmentError(
              ERROR_CODE.CONFLICT,
              MESSAGES.duplicateAnswer,
            );
          // Retry acknowledges the original duration; no status/activity/timing writes.
        } else {
          accepted = {
            questionId: data.questionId,
            selectedAnswer: data.selectedAnswer,
            timeSpentSeconds: data.timeSpentSeconds,
          };
          await tx
            .insert(sessionAnswers)
            .values({
              ...accepted,
              sessionId: session.id,
              isCorrect: data.selectedAnswer === question.correctAnswer,
              answeredAt: now,
            });
          await tx
            .update(testSessions)
            .set({ status: SESSION_STATUS.IN_PROGRESS, lastActivityAt: now })
            .where(eq(testSessions.id, session.id));
          answers.push(accepted);
        }
        const current = progress(session, answers);
        return {
          success: true,
          sessionComplete: current.nextQuestionId === null,
          acceptedAnswer: accepted,
          ...current,
        };
      });
    },

    /** Compatibility result for Stage 2 callers; Stage 3 renders getSession's saved report. */
    async completeSession(
      sessionId: string,
      input: { sessionToken: string },
    ): Promise<AssessmentResult> {
      const credential = parseInput(sessionCredentialSchema, {
        ...input,
        sessionId,
      });
      return withLockedSession(db, credential, async (tx, session, now) => {
        const policy = lifecycle(session, now);
        requireAccess(policy);
        if (session.status === SESSION_STATUS.COMPLETED) {
          const view = await sessionView(tx, session, now);
          if (view.kind === SESSION_VIEW.REPORT)
            return view.reportSnapshot.result;
          throw new AssessmentError(
            ERROR_CODE.LEGACY_SUMMARY_AVAILABLE,
            MESSAGES.legacySummaryAvailable,
          );
        }
        const questionSnapshot = requireUnfinished(session, policy);
        const answers = await acceptedAnswers(tx, session.id);
        const reportSnapshot = buildReport({
          sessionId: session.id,
          framework: session.framework,
          targetLevel: session.targetLevel,
          selectedQuestionIds: session.selectedQuestionIds,
          questionSnapshot,
          answers,
          completedAt: now,
        });
        const result = reportSnapshot.result;
        await tx
          .insert(sessionResults)
          .values({
            sessionId: session.id,
            targetLevel: session.targetLevel,
            totalScore: result.totalScore,
            maxScore: result.maxScore,
            proficiencyLevel: result.proficiencyLevel,
            reportSnapshot,
            createdAt: now,
          });
        await tx
          .insert(sessionCategoryScores)
          .values(
            result.categoryScores.map((score) => ({
              ...score,
              sessionId: session.id,
            })),
          );
        await tx
          .update(testSessions)
          .set({
            status: SESSION_STATUS.COMPLETED,
            completedAt: now,
            lastActivityAt: now,
          })
          .where(eq(testSessions.id, session.id));
        return result;
      });
    },

    async submitSurvey(
      sessionId: string,
      input: { sessionToken: string; rating: number },
    ): Promise<{ success: true }> {
      const data = parseInput(submitSurveyInput, { ...input, sessionId });
      return withLockedSession(db, data, async (tx, session, now) => {
        requireAccess(lifecycle(session, now));
        if (session.status !== SESSION_STATUS.COMPLETED)
          throw new AssessmentError(
            ERROR_CODE.BAD_REQUEST,
            MESSAGES.surveyBeforeComplete,
          );
        await tx
          .insert(sessionSurveys)
          .values({
            sessionId: session.id,
            helpfulnessRating: data.rating,
            createdAt: now,
          })
          .onConflictDoUpdate({
            target: sessionSurveys.sessionId,
            set: { helpfulnessRating: data.rating },
          });
        return { success: true };
      });
    },

    async deleteSession(
      input: DeleteSessionInput,
    ): Promise<DeleteSessionResult> {
      const data = parseInput(deleteSessionInput, input);
      return withLockedSession(db, data, async (tx, session) => {
        // Deliberately no access cutoff: authenticated explicit erasure remains allowed.
        const currentState =
          session.status === SESSION_STATUS.COMPLETED
            ? DELETE_EXPECTATION.COMPLETED
            : DELETE_EXPECTATION.UNFINISHED;
        if (data.expectedState !== currentState)
          return { kind: DELETE_OUTCOME.CHANGED_STATE, currentState };
        await tx.delete(testSessions).where(eq(testSessions.id, session.id));
        return { kind: DELETE_OUTCOME.DELETED };
      });
    },
  };
}

function buildReport(input: Parameters<typeof createReportSnapshot>[0]) {
  try {
    return createReportSnapshot(input);
  } catch (error) {
    if (!(error instanceof SnapshotError)) throw error;
    if (error.code === SNAPSHOT_ERROR_CODE.INVALID_ANSWERS)
      throw new AssessmentError(
        ERROR_CODE.BAD_REQUEST,
        MESSAGES.incompleteAssessment,
      );
    throw new AssessmentError(
      ERROR_CODE.SNAPSHOT_UNAVAILABLE,
      MESSAGES.snapshotUnavailable,
    );
  }
}
export type AssessmentService = ReturnType<typeof createAssessmentService>;
