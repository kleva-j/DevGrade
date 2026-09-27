import type { AssessmentConfiguration, AnswerInput } from "@/domain/types";
import type {
  AcceptedAnswerResult,
  CreatedSession,
  DeleteSessionInput,
  DeleteSessionResult,
  SessionCredential,
  SessionDiscoveryResult,
  SessionView,
  ReportView,
  LegacySummaryView,
} from "@/domain/sessionContracts";
import type { AssessmentEnvelope, AssessmentFailure } from "@/server/errors";

export interface AssessmentApi {
  createSession: (
    configuration: AssessmentConfiguration,
    knownCredentials: SessionCredential[],
  ) => Promise<CreatedSession>;
  discoverSessions: (
    credentials: SessionCredential[],
  ) => Promise<SessionDiscoveryResult>;
  getSession: (credential: SessionCredential) => Promise<SessionView>;
  resumeSession: (credential: SessionCredential) => Promise<SessionView>;
  deleteSession: (input: DeleteSessionInput) => Promise<DeleteSessionResult>;
  submitAnswer: (
    input: SessionCredential & { answer: AnswerInput },
  ) => Promise<AcceptedAnswerResult>;
  completeSession: (
    credential: SessionCredential,
  ) => Promise<ReportView | LegacySummaryView>;
  submitSurvey: (
    input: SessionCredential & { rating: number },
  ) => Promise<{ success: true }>;
}

/** Preserve typed codes/payloads. Never parse messages or serialize raw errors. */
export class AssessmentClientError extends Error {
  constructor(readonly failure: AssessmentFailure) {
    super(failure.message);
    this.name = "AssessmentClientError";
  }
  get code() {
    return this.failure.code;
  }
}
export function unwrapAssessmentEnvelope<T>(result: AssessmentEnvelope<T>): T {
  if (!result.ok) throw new AssessmentClientError(result.error);
  return result.data;
}

type Endpoint<TInput, TOutput> = (request: {
  data: TInput;
}) => Promise<AssessmentEnvelope<TOutput>>;
export interface AssessmentEndpoints {
  createSession: Endpoint<
    AssessmentConfiguration & {
      rawClientId: string;
      knownCredentials: SessionCredential[];
    },
    CreatedSession
  >;
  discoverSessions: Endpoint<
    { credentials: SessionCredential[] },
    SessionDiscoveryResult
  >;
  getSession: Endpoint<SessionCredential, SessionView>;
  resumeSession: Endpoint<SessionCredential, SessionView>;
  deleteSession: Endpoint<DeleteSessionInput, DeleteSessionResult>;
  submitAnswer: Endpoint<SessionCredential & AnswerInput, AcceptedAnswerResult>;
  completeSession: Endpoint<SessionCredential, ReportView | LegacySummaryView>;
  submitSurvey: Endpoint<
    SessionCredential & { rating: number },
    { success: true }
  >;
}

/** Testable transport translation, with no TanStack/server runtime imports. */
export function createAssessmentApi(
  endpoints: AssessmentEndpoints,
  getRawClientId: () => string,
): AssessmentApi {
  return {
    createSession: async (configuration, knownCredentials) =>
      unwrapAssessmentEnvelope(
        await endpoints.createSession({
          data: {
            ...configuration,
            rawClientId: getRawClientId(),
            knownCredentials,
          },
        }),
      ),
    discoverSessions: async (credentials) =>
      unwrapAssessmentEnvelope(
        await endpoints.discoverSessions({ data: { credentials } }),
      ),
    getSession: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.getSession({ data })),
    resumeSession: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.resumeSession({ data })),
    deleteSession: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.deleteSession({ data })),
    submitAnswer: async ({ answer, ...credential }) =>
      unwrapAssessmentEnvelope(
        await endpoints.submitAnswer({ data: { ...credential, ...answer } }),
      ),
    completeSession: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.completeSession({ data })),
    submitSurvey: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.submitSurvey({ data })),
  };
}
