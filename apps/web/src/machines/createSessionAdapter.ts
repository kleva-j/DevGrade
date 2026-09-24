import type { AssessmentConfiguration } from "@/domain/types";
import type { AssessmentServices } from "./assessmentMachine";

interface CreateSessionRequest {
  data: AssessmentConfiguration & { rawClientId: string };
}

/** Keep the wire translation testable without loading the server runtime. */
export function createSessionAdapter(
  createSession: (
    request: CreateSessionRequest,
  ) => ReturnType<AssessmentServices["createSession"]>,
  getRawClientId: () => string,
): AssessmentServices["createSession"] {
  return async ({ framework, targetLevel, questionCount }) => {
    const res = await createSession({
      data: {
        framework,
        targetLevel,
        questionCount,
        rawClientId: getRawClientId(),
      },
    });
    return {
      sessionId: res.sessionId,
      sessionToken: res.sessionToken,
      questions: res.questions,
    };
  };
}
