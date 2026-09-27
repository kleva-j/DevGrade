import type { z } from "zod";
import type { AssessmentService } from "./assessmentService";

import {
  createSessionInput,
  deleteSessionInput,
  discoverSessionsInput,
  parseInput,
  sessionCredentialSchema,
  submitAnswerInput,
  submitSurveyInput,
} from "./assessmentValidation";
import { assessmentEnvelope } from "./errors";

/** Testable wire boundary: even validation/DB initialization failures use safe envelopes. */
export function createAssessmentHandlers(
  getService: () => AssessmentService,
  noStore: () => void,
) {
  function handle<TInput, TOutput>(
    schema: z.ZodType<TInput>,
    operation: (service: AssessmentService, input: TInput) => Promise<TOutput>,
  ) {
    return (data: unknown) => {
      noStore();
      return assessmentEnvelope(async () => {
        const input = parseInput(schema, data);
        return operation(getService(), input);
      });
    };
  }
  return {
    createSession: handle(createSessionInput, (service, input) =>
      service.createSession(input),
    ),
    discoverSessions: handle(discoverSessionsInput, (service, input) =>
      service.discoverSessions(input),
    ),
    getSession: handle(sessionCredentialSchema, (service, input) =>
      service.getSession(input),
    ),
    resumeSession: handle(sessionCredentialSchema, (service, input) =>
      service.resumeSession(input),
    ),
    deleteSession: handle(deleteSessionInput, (service, input) =>
      service.deleteSession(input),
    ),
    submitAnswer: handle(
      submitAnswerInput,
      (service, { sessionId, ...input }) =>
        service.submitAnswer(sessionId, input),
    ),
    completeSession: handle(
      sessionCredentialSchema,
      (service, { sessionId, ...input }) =>
        service.completeSession(sessionId, input),
    ),
    submitSurvey: handle(
      submitSurveyInput,
      (service, { sessionId, ...input }) =>
        service.submitSurvey(sessionId, input),
    ),
  };
}
