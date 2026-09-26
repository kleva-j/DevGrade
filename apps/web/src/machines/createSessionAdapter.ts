import type { AssessmentConfiguration, AssessmentResult } from "@/domain/types";
import type { ReportView, LegacySummaryView } from "@/domain/sessionContracts";
import type { AssessmentEnvelope, AssessmentFailure } from "@/server/errors";
import type { AssessmentServices } from "./assessmentMachine";

import { SESSION_VIEW } from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import { MESSAGES } from "@/server/messages";

interface CreateSessionRequest {
  data: AssessmentConfiguration & { rawClientId: string };
}

/** Preserve typed codes/payloads without parsing messages or importing server runtime. */
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

/** Temporary bridge for the baseline machine, which cannot render saved views yet. */
export function unwrapCompletionEnvelope(
  result: AssessmentEnvelope<ReportView | LegacySummaryView>,
): AssessmentResult {
  const view = unwrapAssessmentEnvelope(result);
  if (view.kind === SESSION_VIEW.REPORT) return view.reportSnapshot.result;
  throw new AssessmentClientError({
    code: ERROR_CODE.LEGACY_SUMMARY_AVAILABLE,
    message: MESSAGES.legacySummaryAvailable,
  });
}

/** Keep the wire translation testable without loading the server runtime. */
export function createSessionAdapter(
  createSession: (
    request: CreateSessionRequest,
  ) => Promise<
    AssessmentEnvelope<Awaited<ReturnType<AssessmentServices["createSession"]>>>
  >,
  getRawClientId: () => string,
): AssessmentServices["createSession"] {
  return async ({ framework, targetLevel, questionCount }) => {
    const res = unwrapAssessmentEnvelope(
      await createSession({
        data: {
          framework,
          targetLevel,
          questionCount,
          rawClientId: getRawClientId(),
        },
      }),
    );
    return {
      sessionId: res.sessionId,
      sessionToken: res.sessionToken,
      questions: res.questions,
    };
  };
}
