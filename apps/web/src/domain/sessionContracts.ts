import type {
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  SESSION_DISCOVERY,
  SESSION_VIEW,
  SessionStatus,
} from "./constants";
import type { ReportSnapshot } from "./sessionSnapshots";
import type {
  AnswerInput,
  AssessmentConfiguration,
  AssessmentResult,
  CategoryScore,
  PublicQuestion,
} from "./types";

export interface SessionCredential {
  sessionId: string;
  sessionToken: string;
}

/** ISO UTC strings, never promises of physical erasure. */
export interface SessionDeadlines {
  attemptExpiresAt: string;
  accessExpiresAt: string;
}

export interface SessionProgress {
  answeredCount: number;
  totalQuestions: number;
  nextQuestionId: string | null;
}

export interface SessionMetadata extends SessionDeadlines {
  sessionId: string;
  createdAt: string;
  configuration: Omit<AssessmentConfiguration, "questionCount"> & {
    questionCount: number;
  };
  effectiveStatus: SessionStatus;
  answeredCount: number;
  totalQuestions: number;
  blocksCreation: boolean;
  canResume: boolean;
}

export type AssessmentView = SessionMetadata &
  SessionProgress & {
    kind: typeof SESSION_VIEW.ASSESSMENT;
    questions: PublicQuestion[];
    acceptedAnswers: AnswerInput[];
  };
export type ReportView = SessionDeadlines & {
  kind: typeof SESSION_VIEW.REPORT;
  sessionId: string;
  reportSnapshot: ReportSnapshot;
  surveyRating: number | null;
};
export type LegacySummaryView = SessionDeadlines & {
  kind: typeof SESSION_VIEW.LEGACY_SUMMARY;
  sessionId: string;
  summary: Pick<
    AssessmentResult,
    "framework" | "targetLevel" | "totalScore" | "proficiencyLevel"
  > & {
    maxScore: number;
    completedAt: string;
    categoryScores: (Omit<CategoryScore, "skillCategory"> & {
      skillCategory: string;
    })[];
  };
  surveyRating: number | null;
};
export type SessionView =
  | AssessmentView
  | ReportView
  | LegacySummaryView
  | (SessionMetadata & {
      kind:
        | typeof SESSION_VIEW.ATTEMPT_EXPIRED
        | typeof SESSION_VIEW.LEGACY_UNRESTORABLE;
    });

export type SessionDiscoveryEntry =
  | { kind: typeof SESSION_DISCOVERY.AVAILABLE; metadata: SessionMetadata }
  | { kind: typeof SESSION_DISCOVERY.UNAVAILABLE; sessionId: string };
export interface SessionDiscoveryResult {
  sessions: SessionDiscoveryEntry[];
}

export interface CreatedSession extends SessionCredential, SessionDeadlines {
  totalQuestions: number;
  questions: PublicQuestion[];
}
export interface AcceptedAnswerResult extends SessionProgress {
  success: true;
  sessionComplete: boolean;
  acceptedAnswer: AnswerInput;
}
export interface DeleteSessionInput extends SessionCredential {
  expectedState: (typeof DELETE_EXPECTATION)[keyof typeof DELETE_EXPECTATION];
}
export type DeleteSessionResult =
  | { kind: typeof DELETE_OUTCOME.DELETED }
  | {
      kind: typeof DELETE_OUTCOME.CHANGED_STATE;
      currentState: DeleteSessionInput["expectedState"];
    };

/** Error codes are owned by server/errors; the generic keeps domain pure. */
export type ServiceEnvelope<
  T,
  TError extends { code: string; message: string },
> = { ok: true; data: T } | { ok: false; error: TError };
