import type { z } from "zod";
import type { AssessmentService } from "./assessmentService";

import {
  createSessionInput,
  deleteSessionInput,
  discoverSessionsInput,
  parseInput,
  sessionCredentialSchema,
  sessionContentInput,
  submitAnswerWireInput,
  submitSurveyInput,
} from "./assessmentValidation";
import { assessmentEnvelope } from "./errors";
import {
  acceptedAnswerResponse,
  createdSessionResponse,
  sessionResponse,
} from "./assessmentWire";

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
    createSession: handle(createSessionInput, async (service, input) => {
      const legacyClient = input.assessmentContract === undefined;
      return createdSessionResponse(
        await service.createSession(input, { legacyClient }),
        legacyClient,
      );
    }),
    discoverSessions: handle(discoverSessionsInput, (service, input) =>
      service.discoverSessions(input),
    ),
    getSession: handle(sessionContentInput, async (service, input) => {
      const legacyClient = input.assessmentContract === undefined;
      return sessionResponse(
        await service.getSession(input, { legacyClient }),
        legacyClient,
      );
    }),
    resumeSession: handle(sessionContentInput, async (service, input) => {
      const legacyClient = input.assessmentContract === undefined;
      return sessionResponse(
        await service.resumeSession(input, { legacyClient }),
        legacyClient,
      );
    }),
    deleteSession: handle(deleteSessionInput, (service, input) =>
      service.deleteSession(input),
    ),
    submitAnswer: handle(
      submitAnswerWireInput,
      async (service, { sessionId, ...input }) => {
        const legacyClient = input.selectedAnswer !== undefined;
        const selectedOptionId = input.selectedOptionId ?? input.selectedAnswer;
        return acceptedAnswerResponse(
          await service.submitAnswer(
            sessionId,
            {
              sessionToken: input.sessionToken,
              questionId: input.questionId,
              selectedOptionId,
              timeSpentSeconds: input.timeSpentSeconds,
            },
            { legacyClient },
          ),
          legacyClient,
        );
      },
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
