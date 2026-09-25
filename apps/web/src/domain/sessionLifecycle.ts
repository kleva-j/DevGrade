import type { SessionStatus } from "./constants";

import {
  ABANDON_AFTER_MINUTES,
  SESSION_RESUME_WINDOW_HOURS,
  SESSION_RETENTION_DAYS,
  SESSION_STATUS,
} from "./constants";

export interface SessionLifecycleInput {
  createdAt: Date;
  lastActivityAt: Date;
  status: SessionStatus;
  /** True only after validating the saved format and exact selected-ID order. */
  hasQuestionSnapshot: boolean;
}

export interface SessionLifecycle {
  attemptExpiresAt: Date;
  accessExpiresAt: Date;
  effectiveStatus: SessionStatus;
  attemptExpired: boolean;
  accessExpired: boolean;
  cleanupEligible: boolean;
  blocksCreation: boolean;
  canResume: boolean;
  canSubmitAnswer: boolean;
  canComplete: boolean;
  canReadReport: boolean;
  canSubmitSurvey: boolean;
  canDelete: boolean;
}

/**
 * Temporal/content policy only: callers must authenticate and check accepted
 * answers separately. Supply authoritative time; this function never touches
 * activity or applies endpoint policy. Deletion remains possible after expiry.
 */
export function sessionLifecycle(
  session: SessionLifecycleInput,
  now: Date,
): SessionLifecycle {
  const createdAt = session.createdAt.getTime();
  const lastActivityAt = session.lastActivityAt.getTime();
  const currentTime = now.getTime();
  if (![createdAt, lastActivityAt, currentTime].every(Number.isFinite)) {
    throw new RangeError("Session lifecycle requires valid timestamps");
  }

  const attemptExpiresAt = new Date(
    createdAt + SESSION_RESUME_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const accessExpiresAt = new Date(
    createdAt + SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const attemptExpired = currentTime >= attemptExpiresAt.getTime();
  const accessExpired = currentTime >= accessExpiresAt.getTime();
  const unfinished = session.status !== SESSION_STATUS.COMPLETED;
  const inactive =
    unfinished &&
    currentTime >= lastActivityAt + ABANDON_AFTER_MINUTES * 60 * 1000;
  const canContinue =
    unfinished &&
    !attemptExpired &&
    !accessExpired &&
    session.hasQuestionSnapshot;
  const canReadReport = !unfinished && !accessExpired;

  return {
    attemptExpiresAt,
    accessExpiresAt,
    effectiveStatus: inactive ? SESSION_STATUS.ABANDONED : session.status,
    attemptExpired,
    accessExpired,
    cleanupEligible: accessExpired,
    // Even unrestorable legacy attempts require deletion before a new attempt.
    blocksCreation: unfinished && !attemptExpired,
    canResume: canContinue,
    canSubmitAnswer: canContinue,
    canComplete: canContinue,
    // Legacy completed rows may expose only their persisted summary.
    canReadReport,
    canSubmitSurvey: canReadReport,
    canDelete: true,
  };
}
