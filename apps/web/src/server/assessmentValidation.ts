import { z } from "zod";

import {
  ASSESSMENT_LENGTHS,
  DEFAULT_ASSESSMENT_LENGTH,
  DELETE_EXPECTATION,
  DIFFICULTIES,
  FRAMEWORKS,
  MAX_KNOWN_SESSION_CREDENTIALS,
  SURVEY_RATING_MIN,
  SURVEY_RATING_MAX,
} from "@/domain/constants";
import { AssessmentError, ERROR_CODE } from "./errors";
import { MESSAGES } from "./messages";

// Reject PostgreSQL's permissive non-UUID spellings before any DB access.
export const sessionIdSchema = z
  .uuid()
  .length(36)
  .transform((id) => id.toLowerCase());
export const sessionTokenSchema = z
  .string()
  .length(64)
  .regex(/^[a-fA-F0-9]{64}$/);
export const sessionCredentialSchema = z.object({
  sessionId: sessionIdSchema,
  sessionToken: sessionTokenSchema,
});
export const knownCredentialsSchema = z
  .array(sessionCredentialSchema)
  .max(MAX_KNOWN_SESSION_CREDENTIALS);
export const discoverSessionsInput = z.object({
  credentials: knownCredentialsSchema,
});

/** Shared by the service and wire boundary; old clients default to Quick. */
export const createSessionSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  targetLevel: z.enum(DIFFICULTIES),
  questionCount: z
    .literal(ASSESSMENT_LENGTHS)
    .default(DEFAULT_ASSESSMENT_LENGTH),
});
export const createSessionInput = createSessionSchema.extend({
  // Rate-limit metadata only, never an ownership credential.
  rawClientId: z.string().min(1).max(1024),
  knownCredentials: knownCredentialsSchema.optional(),
});
export const submitAnswerSchema = z.object({
  sessionToken: sessionTokenSchema,
  questionId: z.string().min(1).max(50),
  selectedAnswer: z.number().int().nonnegative(),
  timeSpentSeconds: z.number().int().min(0).max(3600),
});
export const completeSessionSchema = z.object({
  sessionToken: sessionTokenSchema,
});
export const submitSurveySchema = z.object({
  sessionToken: sessionTokenSchema,
  rating: z.number().int().min(SURVEY_RATING_MIN).max(SURVEY_RATING_MAX),
});
export const submitAnswerInput = submitAnswerSchema.extend({
  sessionId: sessionIdSchema,
});
export const submitSurveyInput = submitSurveySchema.extend({
  sessionId: sessionIdSchema,
});
export const deleteSessionInput = sessionCredentialSchema.extend({
  expectedState: z.enum(DELETE_EXPECTATION),
});

/** Never serialize Zod issues, which may include submitted credentials. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new AssessmentError(ERROR_CODE.BAD_REQUEST, MESSAGES.invalidRequest);
  return parsed.data;
}
