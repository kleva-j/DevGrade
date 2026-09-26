import type { SessionLifecycle } from "@/domain/sessionLifecycle";
import type { AnswerInput } from "@/domain/types";
import type { Db, Transaction } from "@/db/client";
import type { TestSessionRow } from "@/db/schema";
import type {
  SessionCredential,
  SessionDeadlines,
  SessionMetadata,
  SessionProgress,
  SessionView,
} from "@/domain/sessionContracts";

import { and, eq, inArray, or } from "drizzle-orm";

import { sessionLifecycle } from "@/domain/sessionLifecycle";
import { toPublicQuestion } from "@/domain/types";
import { databaseTime } from "@/db/queries";

import {
  sessionAnswers,
  sessionCategoryScores,
  sessionResults,
  sessionSurveys,
  testSessions,
} from "@/db/schema";
import {
  SESSION_DISCOVERY_BATCH_SIZE,
  SESSION_STATUS,
  SESSION_VIEW,
} from "@/domain/constants";
import {
  parseQuestionSnapshot,
  parseReportSnapshot,
  SnapshotError,
} from "@/domain/sessionSnapshots";

import { AssessmentError, ERROR_CODE } from "./errors";
import { MESSAGES } from "./messages";

function credentialPredicate(credential: SessionCredential) {
  return and(
    eq(testSessions.id, credential.sessionId),
    eq(testSessions.sessionToken, credential.sessionToken),
  );
}
export async function authenticatedSession(
  tx: Transaction,
  credential: SessionCredential,
  lock = false,
) {
  const query = tx
    .select()
    .from(testSessions)
    .where(credentialPredicate(credential));
  const [session] = await (lock ? query.for("update") : query);
  if (!session)
    throw new AssessmentError(ERROR_CODE.NOT_FOUND, MESSAGES.sessionNotFound);
  return session;
}

/** Every child mutation is inside this transaction, after the authenticated parent. */
export function withLockedSession<T>(
  db: Db,
  credential: SessionCredential,
  operation: (
    tx: Transaction,
    session: TestSessionRow,
    now: Date,
  ) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const session = await authenticatedSession(tx, credential, true);
    const now = await databaseTime(tx);
    return operation(tx, session, now);
  });
}

/** No child reads until ALL known authenticated parents have been locked. */
export async function knownSessions(
  tx: Transaction,
  credentials: SessionCredential[],
  lock: boolean,
) {
  const ordered = [...credentials].sort((a, b) =>
    a.sessionId.localeCompare(b.sessionId),
  );
  const sessions = new Map<string, TestSessionRow>();
  for (
    let offset = 0;
    offset < ordered.length;
    offset += SESSION_DISCOVERY_BATCH_SIZE
  ) {
    const batch = ordered.slice(offset, offset + SESSION_DISCOVERY_BATCH_SIZE);
    const query = tx
      .select()
      .from(testSessions)
      .where(or(...batch.map(credentialPredicate)))
      .orderBy(testSessions.id);
    const rows = await (lock ? query.for("update") : query);
    for (const row of rows) sessions.set(row.id, row);
  }
  return sessions;
}

/** Metadata discovery reads only IDs in bounded batches, not per-handle full answers. */
export async function knownAnswerIds(
  tx: Transaction,
  sessions: Iterable<TestSessionRow>,
) {
  const ids = Array.from(sessions, (session) => session.id);
  const answers = new Map<string, { questionId: string }[]>();
  for (
    let offset = 0;
    offset < ids.length;
    offset += SESSION_DISCOVERY_BATCH_SIZE
  ) {
    const rows = await tx
      .select({
        sessionId: sessionAnswers.sessionId,
        questionId: sessionAnswers.questionId,
      })
      .from(sessionAnswers)
      .where(
        inArray(
          sessionAnswers.sessionId,
          ids.slice(offset, offset + SESSION_DISCOVERY_BATCH_SIZE),
        ),
      );
    for (const row of rows) {
      const existing = answers.get(row.sessionId) ?? [];
      existing.push({ questionId: row.questionId });
      answers.set(row.sessionId, existing);
    }
  }
  return answers;
}

export function savedQuestions(session: TestSessionRow) {
  if (session.questionSnapshot === null)
    throw new AssessmentError(
      ERROR_CODE.LEGACY_UNRESTORABLE,
      MESSAGES.legacyUnrestorable,
    );
  try {
    return parseQuestionSnapshot(
      session.questionSnapshot,
      session.selectedQuestionIds,
      session,
    );
  } catch (error) {
    if (!(error instanceof SnapshotError)) throw error;
    throw new AssessmentError(
      ERROR_CODE.SNAPSHOT_UNAVAILABLE,
      MESSAGES.snapshotUnavailable,
    );
  }
}
function hasSavedQuestions(session: TestSessionRow) {
  try {
    savedQuestions(session);
    return true;
  } catch (error) {
    if (!(error instanceof AssessmentError)) throw error;
    return false;
  }
}
export function lifecycle(
  session: TestSessionRow,
  now: Date,
): SessionLifecycle {
  return sessionLifecycle(
    { ...session, hasQuestionSnapshot: hasSavedQuestions(session) },
    now,
  );
}
export function deadlines(policy: SessionLifecycle): SessionDeadlines {
  return {
    attemptExpiresAt: policy.attemptExpiresAt.toISOString(),
    accessExpiresAt: policy.accessExpiresAt.toISOString(),
  };
}
export function requireAccess(policy: SessionLifecycle) {
  if (policy.accessExpired)
    throw new AssessmentError(
      ERROR_CODE.ACCESS_EXPIRED,
      MESSAGES.accessExpired,
    );
}
export function requireUnfinished(
  session: TestSessionRow,
  policy: SessionLifecycle,
) {
  requireAccess(policy);
  if (session.status === SESSION_STATUS.COMPLETED)
    throw new AssessmentError(
      ERROR_CODE.SESSION_COMPLETED,
      MESSAGES.sessionAlreadyComplete,
    );
  if (policy.attemptExpired)
    throw new AssessmentError(
      ERROR_CODE.ATTEMPT_EXPIRED,
      MESSAGES.attemptExpired,
    );
  return savedQuestions(session);
}
export async function acceptedAnswers(tx: Transaction, sessionId: string) {
  return tx
    .select({
      questionId: sessionAnswers.questionId,
      selectedAnswer: sessionAnswers.selectedAnswer,
      timeSpentSeconds: sessionAnswers.timeSpentSeconds,
    })
    .from(sessionAnswers)
    .where(eq(sessionAnswers.sessionId, sessionId));
}
export function orderedAcceptedAnswers(
  session: TestSessionRow,
  answers: readonly AnswerInput[],
): AnswerInput[] {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  return session.selectedQuestionIds.flatMap((id) => {
    const answer = byId.get(id);
    return answer ? [answer] : [];
  });
}
export function progress(
  session: TestSessionRow,
  answers: readonly { questionId: string }[],
): SessionProgress {
  const accepted = new Set(answers.map((answer) => answer.questionId));
  return {
    answeredCount: session.selectedQuestionIds.filter((id) => accepted.has(id))
      .length,
    totalQuestions: session.selectedQuestionIds.length,
    nextQuestionId:
      session.selectedQuestionIds.find((id) => !accepted.has(id)) ?? null,
  };
}
export function metadata(
  session: TestSessionRow,
  now: Date,
  answers: readonly { questionId: string }[],
): SessionMetadata {
  const policy = lifecycle(session, now);
  const current = progress(session, answers);
  return {
    ...deadlines(policy),
    sessionId: session.id,
    createdAt: session.createdAt.toISOString(),
    configuration: {
      framework: session.framework,
      targetLevel: session.targetLevel,
      questionCount: current.totalQuestions,
    },
    effectiveStatus: policy.effectiveStatus,
    answeredCount: current.answeredCount,
    totalQuestions: current.totalQuestions,
    blocksCreation: policy.blocksCreation,
    canResume: policy.canResume,
  };
}

/** Only called inside a parent-locked transaction or a read-only repeatable read. */
export async function sessionView(
  tx: Transaction,
  session: TestSessionRow,
  now: Date,
): Promise<SessionView> {
  const policy = lifecycle(session, now);
  requireAccess(policy);
  if (session.status === SESSION_STATUS.COMPLETED) {
    const [result] = await tx
      .select()
      .from(sessionResults)
      .where(eq(sessionResults.sessionId, session.id));
    if (!result)
      throw new AssessmentError(
        ERROR_CODE.SNAPSHOT_UNAVAILABLE,
        MESSAGES.snapshotUnavailable,
      );
    const [survey] = await tx
      .select({ rating: sessionSurveys.helpfulnessRating })
      .from(sessionSurveys)
      .where(eq(sessionSurveys.sessionId, session.id));
    const base = {
      sessionId: session.id,
      ...deadlines(policy),
      surveyRating: survey?.rating ?? null,
    };
    if (result.reportSnapshot !== null) {
      try {
        const reportSnapshot = parseReportSnapshot(result.reportSnapshot);
        if (
          reportSnapshot.result.sessionId !== session.id ||
          reportSnapshot.result.framework !== session.framework ||
          reportSnapshot.result.targetLevel !== session.targetLevel ||
          reportSnapshot.questions.length !==
            session.selectedQuestionIds.length ||
          !reportSnapshot.questions.every(
            (q, index) => q.id === session.selectedQuestionIds[index],
          )
        ) {
          throw new AssessmentError(
            ERROR_CODE.SNAPSHOT_UNAVAILABLE,
            MESSAGES.snapshotUnavailable,
          );
        }
        return { kind: SESSION_VIEW.REPORT, ...base, reportSnapshot };
      } catch (error) {
        if (!(error instanceof SnapshotError)) throw error;
        throw new AssessmentError(
          ERROR_CODE.SNAPSHOT_UNAVAILABLE,
          MESSAGES.snapshotUnavailable,
        );
      }
    }
    const categoryScores = await tx
      .select({
        skillCategory: sessionCategoryScores.skillCategory,
        correctWeight: sessionCategoryScores.correctWeight,
        totalWeight: sessionCategoryScores.totalWeight,
        scorePct: sessionCategoryScores.scorePct,
        proficiency: sessionCategoryScores.proficiency,
      })
      .from(sessionCategoryScores)
      .where(eq(sessionCategoryScores.sessionId, session.id))
      .orderBy(sessionCategoryScores.skillCategory);
    return {
      kind: SESSION_VIEW.LEGACY_SUMMARY,
      ...base,
      summary: {
        framework: session.framework,
        targetLevel: result.targetLevel,
        totalScore: result.totalScore,
        maxScore: result.maxScore,
        proficiencyLevel: result.proficiencyLevel,
        completedAt: (session.completedAt ?? result.createdAt).toISOString(),
        categoryScores,
      },
    };
  }
  const answers = await acceptedAnswers(tx, session.id);
  const base = metadata(session, now, answers);
  if (policy.attemptExpired)
    return { kind: SESSION_VIEW.ATTEMPT_EXPIRED, ...base };
  if (session.questionSnapshot === null)
    return { kind: SESSION_VIEW.LEGACY_UNRESTORABLE, ...base };
  const snapshot = savedQuestions(session);
  return {
    kind: SESSION_VIEW.ASSESSMENT,
    ...base,
    ...progress(session, answers),
    questions: snapshot.questions.map(toPublicQuestion),
    acceptedAnswers: orderedAcceptedAnswers(session, answers),
  };
}
