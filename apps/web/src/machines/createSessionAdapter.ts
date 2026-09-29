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
import type {
  WireCreatedSession,
  WireSessionView,
  WireAcceptedAnswerResult,
} from "@/server/assessmentWire";

import { ASSESSMENT_CONTRACT } from "@/domain/constants";
import { sessionCredentialSchema } from "@/domain/sessionContracts";
import { ERROR_CODE } from "@/server/errors";
import { MESSAGES } from "@/server/messages";
import {
  assessmentResponseSchema,
  sessionResponseSchema,
  acceptedAnswerResponseSchema,
} from "./assessmentResponse";

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
/** Credentials from an incompatible creation stay out of serializable errors/UI state. */
export class ClientUpdateRequiredError extends AssessmentClientError {
  #createdCredential: SessionCredential | null;

  constructor(createdResponse?: unknown) {
    super({
      code: ERROR_CODE.CLIENT_UPDATE_REQUIRED,
      message: MESSAGES.clientUpdateRequired,
    });
    const parsed = sessionCredentialSchema.safeParse(createdResponse);
    this.#createdCredential = parsed.success ? parsed.data : null;
  }

  takeCreatedCredential() {
    const credential = this.#createdCredential;
    this.#createdCredential = null;
    return credential;
  }
}

/** Accepts either a transport error or the machine's public error code. */
export function isClientUpdateRequired(error: unknown) {
  return (
    error === ERROR_CODE.CLIENT_UPDATE_REQUIRED ||
    (error instanceof AssessmentClientError &&
      error.code === ERROR_CODE.CLIENT_UPDATE_REQUIRED)
  );
}

export function unwrapAssessmentEnvelope<T>(result: AssessmentEnvelope<T>): T {
  if (!result.ok) throw new AssessmentClientError(result.error);
  return result.data;
}

type ContractRequest = {
  assessmentContract: typeof ASSESSMENT_CONTRACT.OPTION_IDS;
};

type Endpoint<TInput, TOutput> = (request: {
  data: TInput;
}) => Promise<AssessmentEnvelope<TOutput>>;
export interface AssessmentEndpoints {
  createSession: Endpoint<
    AssessmentConfiguration &
      ContractRequest & {
        rawClientId: string;
        knownCredentials: SessionCredential[];
      },
    WireCreatedSession
  >;
  discoverSessions: Endpoint<
    { credentials: SessionCredential[] },
    SessionDiscoveryResult
  >;
  getSession: Endpoint<SessionCredential & ContractRequest, WireSessionView>;
  resumeSession: Endpoint<SessionCredential & ContractRequest, WireSessionView>;
  deleteSession: Endpoint<DeleteSessionInput, DeleteSessionResult>;
  submitAnswer: Endpoint<
    SessionCredential & AnswerInput,
    WireAcceptedAnswerResult
  >;
  completeSession: Endpoint<SessionCredential, ReportView | LegacySummaryView>;
  submitSurvey: Endpoint<
    SessionCredential & { rating: number },
    { success: true }
  >;
}

function createdSession(
  data: WireCreatedSession | null | undefined,
): CreatedSession {
  if (
    data?.assessmentContract !== ASSESSMENT_CONTRACT.OPTION_IDS ||
    !assessmentResponseSchema.safeParse(data).success ||
    !sessionCredentialSchema.safeParse(data).success
  ) {
    // Creation may already have committed. Recovery must keep any valid token
    // before surfacing the refresh-required failure, even for an old response.
    throw new ClientUpdateRequiredError(data);
  }
  return data;
}

function sessionView(data: WireSessionView | null | undefined): SessionView {
  if (
    data?.assessmentContract !== ASSESSMENT_CONTRACT.OPTION_IDS ||
    !sessionResponseSchema.safeParse(data).success
  )
    throw new ClientUpdateRequiredError();
  return data;
}

function acceptedAnswer(
  data: WireAcceptedAnswerResult | null | undefined,
): AcceptedAnswerResult {
  if (
    data?.assessmentContract !== ASSESSMENT_CONTRACT.OPTION_IDS ||
    !acceptedAnswerResponseSchema.safeParse(data).success
  )
    throw new ClientUpdateRequiredError();
  return data;
}

/** Testable transport translation, with no TanStack/server execution imports. */
export function createAssessmentApi(
  endpoints: AssessmentEndpoints,
  getRawClientId: () => string,
): AssessmentApi {
  return {
    createSession: async (configuration, knownCredentials) =>
      createdSession(
        unwrapAssessmentEnvelope(
          await endpoints.createSession({
            data: {
              ...configuration,
              rawClientId: getRawClientId(),
              knownCredentials,
              assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
            },
          }),
        ),
      ),
    discoverSessions: async (credentials) =>
      unwrapAssessmentEnvelope(
        await endpoints.discoverSessions({ data: { credentials } }),
      ),
    getSession: async (data) =>
      sessionView(
        unwrapAssessmentEnvelope(
          await endpoints.getSession({
            data: {
              ...data,
              assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
            },
          }),
        ),
      ),
    resumeSession: async (data) =>
      sessionView(
        unwrapAssessmentEnvelope(
          await endpoints.resumeSession({
            data: {
              ...data,
              assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
            },
          }),
        ),
      ),
    deleteSession: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.deleteSession({ data })),
    submitAnswer: async ({ answer, ...credential }) =>
      acceptedAnswer(
        unwrapAssessmentEnvelope(
          await endpoints.submitAnswer({ data: { ...credential, ...answer } }),
        ),
      ),
    completeSession: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.completeSession({ data })),
    submitSurvey: async (data) =>
      unwrapAssessmentEnvelope(await endpoints.submitSurvey({ data })),
  };
}
