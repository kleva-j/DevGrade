import type { AssessmentConfiguration } from "@/domain/types";
import type { AssessmentEnvelope, AssessmentFailure } from "@/server/errors";
import type { AssessmentServices } from "./assessmentMachine";

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
