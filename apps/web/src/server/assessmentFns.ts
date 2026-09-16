import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createAssessmentService } from "@/server/assessmentService";
import { DIFFICULTIES, FRAMEWORKS } from "@/domain/constants";
import { AssessmentError } from "@/server/errors";
import { MESSAGES } from "@/server/messages";
import { getDb } from "@/db/client";

/**
 * TanStack Start server functions — the client boundary for the assessment API.
 *
 * These are the only entry points the browser calls; the plugin extracts each
 * `.handler()` into the server bundle, so the answer key (`seedData`, the DB
 * client, `node:crypto`) never ships to the client (decision #5). The client
 * adapter in `machines/assessmentServices.ts` wires them into the XState machine.
 */

const createSessionInput = z.object({
  framework: z.enum(FRAMEWORKS),
  targetLevel: z.enum(DIFFICULTIES),
  // Stable anonymous id minted client-side (localStorage); hashed server-side
  // for rate limiting, so it never identifies a person (decision #6 / §7).
  rawClientId: z.string().min(1),
});

const submitAnswerInput = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().min(0),
  timeSpentSeconds: z.number().int().min(0).max(3600),
});

const completeSessionInput = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
});

/**
 * Convert a thrown error into a plain `Error` carrying only the user-facing
 * message. `AssessmentError` messages are already safe to show; anything else
 * is collapsed to a generic message so internals never leak to the client.
 */
function toClientError(err: unknown): never {
  if (err instanceof AssessmentError) throw new Error(err.message);
  throw new Error(MESSAGES.unexpectedError);
}

export const createSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => createSessionInput.parse(data))
  .handler(async ({ data }) => {
    try {
      return await createAssessmentService(getDb()).createSession(data);
    } catch (err) {
      toClientError(err);
    }
  });

export const submitAnswerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => submitAnswerInput.parse(data))
  .handler(async ({ data }) => {
    const { sessionId, ...rest } = data;
    try {
      return await createAssessmentService(getDb()).submitAnswer(
        sessionId,
        rest,
      );
    } catch (err) {
      toClientError(err);
    }
  });

export const completeSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => completeSessionInput.parse(data))
  .handler(async ({ data }) => {
    const { sessionId, sessionToken } = data;
    try {
      return await createAssessmentService(getDb()).completeSession(sessionId, {
        sessionToken,
      });
    } catch (err) {
      toClientError(err);
    }
  });
