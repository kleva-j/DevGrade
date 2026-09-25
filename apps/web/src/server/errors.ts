import type {
  ServiceEnvelope,
  SessionMetadata,
} from "@/domain/sessionContracts";

import { MESSAGES } from "./messages";

export const ERROR_CODE = {
  BAD_REQUEST: "bad_request",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  INSUFFICIENT_QUESTIONS: "insufficient_questions",
  SESSION_COMPLETED: "session_completed",
  ATTEMPT_EXPIRED: "attempt_expired",
  ACCESS_EXPIRED: "access_expired",
  LEGACY_UNRESTORABLE: "legacy_unrestorable",
  LEGACY_SUMMARY_AVAILABLE: "legacy_summary_available",
  SNAPSHOT_UNAVAILABLE: "snapshot_unavailable",
  EXISTING_ATTEMPT: "existing_attempt",
  INTERNAL_ERROR: "internal_error",
} as const;
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export type AssessmentFailure =
  | {
      code: typeof ERROR_CODE.EXISTING_ATTEMPT;
      message: string;
      blockers: SessionMetadata[];
    }
  | {
      code: Exclude<ErrorCode, typeof ERROR_CODE.EXISTING_ATTEMPT>;
      message: string;
    };
export type AssessmentEnvelope<T> = ServiceEnvelope<T, AssessmentFailure>;

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ERROR_CODE.BAD_REQUEST]: 400,
  [ERROR_CODE.NOT_FOUND]: 404,
  [ERROR_CODE.CONFLICT]: 409,
  [ERROR_CODE.RATE_LIMITED]: 429,
  [ERROR_CODE.INSUFFICIENT_QUESTIONS]: 409,
  [ERROR_CODE.SESSION_COMPLETED]: 409,
  [ERROR_CODE.ATTEMPT_EXPIRED]: 410,
  [ERROR_CODE.ACCESS_EXPIRED]: 410,
  [ERROR_CODE.LEGACY_UNRESTORABLE]: 409,
  [ERROR_CODE.LEGACY_SUMMARY_AVAILABLE]: 409,
  [ERROR_CODE.SNAPSHOT_UNAVAILABLE]: 409,
  [ERROR_CODE.EXISTING_ATTEMPT]: 409,
  [ERROR_CODE.INTERNAL_ERROR]: 500,
};

export class AssessmentError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AssessmentError";
    this.status = STATUS_BY_CODE[code];
  }
}
export class ExistingAttemptError extends AssessmentError {
  constructor(readonly blockers: SessionMetadata[]) {
    super(ERROR_CODE.EXISTING_ATTEMPT, MESSAGES.existingAttempt);
  }
}

// Even an accidentally unsafe AssessmentError message is never sent verbatim.
const SAFE_MESSAGE: Record<ErrorCode, string> = {
  [ERROR_CODE.BAD_REQUEST]: MESSAGES.invalidRequest,
  [ERROR_CODE.NOT_FOUND]: MESSAGES.sessionNotFound,
  [ERROR_CODE.CONFLICT]: MESSAGES.duplicateAnswer,
  [ERROR_CODE.RATE_LIMITED]: MESSAGES.rateLimitRetry,
  [ERROR_CODE.INSUFFICIENT_QUESTIONS]: MESSAGES.insufficientQuestions,
  [ERROR_CODE.SESSION_COMPLETED]: MESSAGES.sessionAlreadyComplete,
  [ERROR_CODE.ATTEMPT_EXPIRED]: MESSAGES.attemptExpired,
  [ERROR_CODE.ACCESS_EXPIRED]: MESSAGES.accessExpired,
  [ERROR_CODE.LEGACY_UNRESTORABLE]: MESSAGES.legacyUnrestorable,
  [ERROR_CODE.LEGACY_SUMMARY_AVAILABLE]: MESSAGES.legacySummaryAvailable,
  [ERROR_CODE.SNAPSHOT_UNAVAILABLE]: MESSAGES.snapshotUnavailable,
  [ERROR_CODE.EXISTING_ATTEMPT]: MESSAGES.existingAttempt,
  [ERROR_CODE.INTERNAL_ERROR]: MESSAGES.unexpectedError,
};
export function toSafeFailure(error: unknown): AssessmentFailure {
  if (error instanceof ExistingAttemptError) {
    return {
      code: ERROR_CODE.EXISTING_ATTEMPT,
      message: MESSAGES.existingAttempt,
      blockers: error.blockers,
    };
  }
  if (
    error instanceof AssessmentError &&
    error.code !== ERROR_CODE.EXISTING_ATTEMPT &&
    Object.hasOwn(SAFE_MESSAGE, error.code)
  ) {
    return { code: error.code, message: SAFE_MESSAGE[error.code] };
  }
  return { code: ERROR_CODE.INTERNAL_ERROR, message: MESSAGES.unexpectedError };
}
export function toErrorResponse(error: unknown) {
  const failure = toSafeFailure(error);
  return {
    status: STATUS_BY_CODE[failure.code],
    body: { error: failure.code, message: failure.message },
  };
}
export async function assessmentEnvelope<T>(
  operation: () => Promise<T>,
): Promise<AssessmentEnvelope<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: toSafeFailure(error) };
  }
}
