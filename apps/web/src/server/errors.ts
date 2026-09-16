import { MESSAGES } from "./messages"

/**
 * Domain error with an HTTP-friendly code, so route handlers can map errors to
 * the status codes documented in the PRD (§7.2) without leaking internals.
 */
export const ERROR_CODE = {
  BAD_REQUEST: "bad_request",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  INSUFFICIENT_QUESTIONS: "insufficient_questions",
  SESSION_COMPLETED: "session_completed",
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

const INTERNAL_ERROR = "internal_error" as const

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ERROR_CODE.BAD_REQUEST]: 400,
  [ERROR_CODE.NOT_FOUND]: 404,
  [ERROR_CODE.CONFLICT]: 409,
  [ERROR_CODE.RATE_LIMITED]: 429,
  [ERROR_CODE.INSUFFICIENT_QUESTIONS]: 409,
  [ERROR_CODE.SESSION_COMPLETED]: 409,
}

export class AssessmentError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = "AssessmentError"
    this.code = code
    this.status = STATUS_BY_CODE[code]
  }
}

export function toErrorResponse(err: unknown): {
  status: number
  body: { error: ErrorCode | typeof INTERNAL_ERROR; message: string }
} {
  if (err instanceof AssessmentError) {
    return {
      status: err.status,
      body: { error: err.code, message: err.message },
    }
  }
  return {
    status: 500,
    body: { error: INTERNAL_ERROR, message: MESSAGES.unexpectedError },
  }
}
