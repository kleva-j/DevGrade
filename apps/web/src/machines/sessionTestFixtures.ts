import { randomUUID } from "node:crypto";
import type {
  AssessmentConfiguration,
  AnswerInput,
  PublicQuestion,
} from "@/domain/types";
import type {
  AssessmentView,
  ReportView,
  SessionCredential,
  SessionMetadata,
  SessionView,
} from "@/domain/sessionContracts";
import type { AssessmentApi } from "./createSessionAdapter";
import type { StoragePort } from "./sessionStorage";
import {
  ASSESSMENT_LENGTH,
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  DIFFICULTY,
  FRAMEWORK,
  PROFICIENCY,
  REPORT_SNAPSHOT_VERSION,
  SCORING_VERSION,
  SESSION_DISCOVERY,
  SESSION_STATUS,
  SESSION_VIEW,
  SKILL_CATEGORY,
} from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import type { ErrorCode } from "@/server/errors";
import { AssessmentClientError } from "./createSessionAdapter";

export const configuration: AssessmentConfiguration = {
  framework: FRAMEWORK.REACT,
  targetLevel: DIFFICULTY.MID,
  questionCount: ASSESSMENT_LENGTH.QUICK,
};
export const createdAt = "2026-09-25T12:00:00.000Z";
export const attemptExpiresAt = "2026-09-26T12:00:00.000Z";
export const accessExpiresAt = "2026-10-02T12:00:00.000Z";
export function clientFailure(
  code: Exclude<ErrorCode, typeof ERROR_CODE.EXISTING_ATTEMPT>,
) {
  return new AssessmentClientError({ code, message: "Safe service failure" });
}
export class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  blockRead = false;
  blockWrite = false;
  blockRemove = false;
  writes: string[] = [];
  get length() {
    if (this.blockRead) throw new Error("blocked");
    return this.values.size;
  }
  key(index: number) {
    if (this.blockRead) throw new Error("blocked");
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    if (this.blockRead) throw new Error("blocked");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.blockWrite) throw new Error("full");
    this.writes.push(key);
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.blockRemove) throw new Error("blocked");
    this.values.delete(key);
  }
}
export function makeSession(config = configuration) {
  const credential: SessionCredential = {
    sessionId: randomUUID(),
    sessionToken: "a".repeat(64),
  };
  const questions: PublicQuestion[] = Array.from(
    { length: config.questionCount },
    (_, i) => ({
      id: `question-${i}`,
      skillCategory: SKILL_CATEGORY.ASYNC,
      title: `Saved question ${i}`,
      prompt: "Saved prompt",
      codeBlock: "savedCode()",
      options: ["A", "B", "C", "D"],
    }),
  );
  const assessment: AssessmentView = {
    sessionId: credential.sessionId,
    kind: SESSION_VIEW.ASSESSMENT,
    configuration: { ...config },
    createdAt,
    attemptExpiresAt,
    accessExpiresAt,
    effectiveStatus: SESSION_STATUS.IN_PROGRESS,
    answeredCount: 0,
    totalQuestions: questions.length,
    nextQuestionId: questions[0]!.id,
    blocksCreation: true,
    canResume: true,
    questions,
    acceptedAnswers: [],
  };

  const report: ReportView = {
    kind: SESSION_VIEW.REPORT,
    sessionId: credential.sessionId,
    attemptExpiresAt,
    accessExpiresAt,
    surveyRating: null,
    reportSnapshot: {
      version: REPORT_SNAPSHOT_VERSION,
      scoringVersion: SCORING_VERSION.V1,
      completedAt: createdAt,
      questions: structuredClone(questions),
      pillars: [
        {
          skillCategory: SKILL_CATEGORY.ASYNC,
          displayName: "Saved pillar name",
          description: "Saved guidance",
          order: 1,
        },
      ],
      result: {
        sessionId: credential.sessionId,
        framework: config.framework,
        targetLevel: config.targetLevel,
        totalScore: 50,
        maxScore: 100,
        proficiencyLevel: PROFICIENCY.DEVELOPING,
        categoryScores: [
          {
            skillCategory: SKILL_CATEGORY.ASYNC,
            correctWeight: 1,
            totalWeight: 2,
            scorePct: 50,
            proficiency: PROFICIENCY.DEVELOPING,
          },
        ],
        skillGaps: [],
        questionResults: questions.map((q) => ({
          questionId: q.id,
          isCorrect: true,
          explanation: "Saved explanation",
        })),
      },
    },
  };
  return { credential, assessment, report, completed: false, legacy: false };
}
export type TestSession = ReturnType<typeof makeSession>;
export function accept(
  session: TestSession,
  index: number,
  selectedAnswer = 0,
  timeSpentSeconds = 1,
): AnswerInput {
  const answer = {
    questionId: session.assessment.questions[index]!.id,
    selectedAnswer,
    timeSpentSeconds,
  };
  session.assessment.acceptedAnswers.push(answer);
  return answer;
}
export function fakeServer(initial: TestSession[] = []) {
  const sessions = new Map(
    initial.map((session) => [session.credential.sessionId, session]),
  );
  const calls = {
    create: 0,
    discover: 0,
    get: 0,
    resume: 0,
    answer: 0,
    complete: 0,
    delete: 0,
    survey: 0,
  };
  let now = Date.parse(createdAt);
  function get(credential: SessionCredential) {
    const session = sessions.get(credential.sessionId);
    if (!session || session.credential.sessionToken !== credential.sessionToken)
      throw clientFailure(ERROR_CODE.NOT_FOUND);
    return session;
  }
  function metadata(session: TestSession): SessionMetadata {
    const a = session.assessment;
    return {
      sessionId: a.sessionId,
      createdAt: a.createdAt,
      configuration: a.configuration,
      attemptExpiresAt: a.attemptExpiresAt,
      accessExpiresAt: a.accessExpiresAt,
      effectiveStatus: session.completed
        ? SESSION_STATUS.COMPLETED
        : a.effectiveStatus,
      answeredCount: a.acceptedAnswers.length,
      totalQuestions: a.questions.length,
      blocksCreation:
        !session.completed && now < Date.parse(a.attemptExpiresAt),
      canResume:
        !session.completed &&
        !session.legacy &&
        now < Date.parse(a.attemptExpiresAt),
    };
  }
  function view(session: TestSession): SessionView {
    if (now >= Date.parse(session.assessment.accessExpiresAt))
      throw clientFailure(ERROR_CODE.ACCESS_EXPIRED);
    const meta = metadata(session);
    if (session.completed) {
      if (session.legacy)
        return {
          kind: SESSION_VIEW.LEGACY_SUMMARY,
          sessionId: meta.sessionId,
          attemptExpiresAt: meta.attemptExpiresAt,
          accessExpiresAt: meta.accessExpiresAt,
          surveyRating: session.report.surveyRating,
          summary: {
            ...session.report.reportSnapshot.result,
            completedAt: createdAt,
          },
        };
      return structuredClone(session.report);
    }
    if (!meta.blocksCreation)
      return { ...meta, kind: SESSION_VIEW.ATTEMPT_EXPIRED };
    if (session.legacy)
      return { ...meta, kind: SESSION_VIEW.LEGACY_UNRESTORABLE };
    return structuredClone({
      ...session.assessment,
      ...meta,
      nextQuestionId:
        session.assessment.questions.find(
          (q) =>
            !session.assessment.acceptedAnswers.some(
              (a) => a.questionId === q.id,
            ),
        )?.id ?? null,
    });
  }
  function writable(session: TestSession) {
    const current = view(session);
    if (session.completed) throw clientFailure(ERROR_CODE.SESSION_COMPLETED);
    if (current.kind === SESSION_VIEW.ATTEMPT_EXPIRED)
      throw clientFailure(ERROR_CODE.ATTEMPT_EXPIRED);
  }
  const api: AssessmentApi = {
    async createSession(config, known) {
      calls.create++;
      const blockers = known.flatMap((credential) => {
        try {
          const session = get(credential);
          return metadata(session).blocksCreation ? [metadata(session)] : [];
        } catch {
          return [];
        }
      });
      if (blockers.length)
        throw new AssessmentClientError({
          code: ERROR_CODE.EXISTING_ATTEMPT,
          message: "Blocked",
          blockers,
        });
      const session = makeSession(config);
      session.assessment.createdAt = new Date(now).toISOString();
      session.assessment.attemptExpiresAt = new Date(
        now + 24 * 3600_000,
      ).toISOString();
      session.assessment.accessExpiresAt = new Date(
        now + 7 * 24 * 3600_000,
      ).toISOString();
      session.report.attemptExpiresAt = session.assessment.attemptExpiresAt;
      session.report.accessExpiresAt = session.assessment.accessExpiresAt;
      sessions.set(session.credential.sessionId, session);
      return structuredClone({ ...session.assessment, ...session.credential });
    },
    async discoverSessions(credentials) {
      calls.discover++;
      return {
        sessions: credentials.map((credential) => {
          try {
            const session = get(credential);
            view(session);
            return {
              kind: SESSION_DISCOVERY.AVAILABLE,
              metadata: metadata(session),
            };
          } catch {
            return {
              kind: SESSION_DISCOVERY.UNAVAILABLE,
              sessionId: credential.sessionId,
            };
          }
        }),
      };
    },
    async getSession(credential) {
      calls.get++;
      return view(get(credential));
    },
    async resumeSession(credential) {
      calls.resume++;
      return view(get(credential));
    },
    async submitAnswer({ answer, ...credential }) {
      calls.answer++;
      const session = get(credential);
      writable(session);
      const previous = session.assessment.acceptedAnswers.find(
        (a) => a.questionId === answer.questionId,
      );
      if (previous && previous.selectedAnswer !== answer.selectedAnswer)
        throw clientFailure(ERROR_CODE.CONFLICT);
      if (!previous)
        session.assessment.acceptedAnswers.push(structuredClone(answer));
      const nextQuestionId =
        session.assessment.questions.find(
          (q) =>
            !session.assessment.acceptedAnswers.some(
              (a) => a.questionId === q.id,
            ),
        )?.id ?? null;
      return {
        success: true,
        acceptedAnswer: previous ?? answer,
        acceptedAnswers: structuredClone(
          session.assessment.questions.flatMap((q) =>
            session.assessment.acceptedAnswers.filter(
              (a) => a.questionId === q.id,
            ),
          ),
        ),
        answeredCount: session.assessment.acceptedAnswers.length,
        totalQuestions: session.assessment.questions.length,
        nextQuestionId,
        sessionComplete: nextQuestionId === null,
      };
    },
    async completeSession(credential) {
      calls.complete++;
      const session = get(credential);
      if (!session.completed) {
        writable(session);
        if (
          session.assessment.acceptedAnswers.length !==
          session.assessment.questions.length
        )
          throw clientFailure(ERROR_CODE.CONFLICT);
        session.completed = true;
      }
      const completed = view(session);
      if (
        completed.kind !== SESSION_VIEW.REPORT &&
        completed.kind !== SESSION_VIEW.LEGACY_SUMMARY
      )
        throw new Error("Expected a completed fixture");
      return completed;
    },
    async deleteSession({ expectedState, ...credential }) {
      calls.delete++;
      const session = get(credential);
      const currentState = session.completed
        ? DELETE_EXPECTATION.COMPLETED
        : DELETE_EXPECTATION.UNFINISHED;
      if (currentState !== expectedState)
        return { kind: DELETE_OUTCOME.CHANGED_STATE, currentState };
      sessions.delete(credential.sessionId);
      return { kind: DELETE_OUTCOME.DELETED };
    },
    async submitSurvey({ rating, ...credential }) {
      calls.survey++;
      const session = get(credential);
      view(session);
      session.report.surveyRating = rating;
      return { success: true };
    },
  };
  return {
    api,
    calls,
    sessions,
    metadata,
    view,
    setNow: (value: number) => {
      now = value;
    },
  };
}
