import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { getDb } from "@/db/client";
import { createAssessmentHandlers } from "./assessmentHandlers";
import { createAssessmentService } from "./assessmentService";

function handlers() {
  return createAssessmentHandlers(
    () => createAssessmentService(getDb()),
    () => setResponseHeader("Cache-Control", "no-store"),
  );
}

// Validation is inside the safe boundary, not Start's throwing Zod validator.
// POST only: credentials must never be encoded in URLs or shared caches.
export const createSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().createSession(data));
export const discoverSessionsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().discoverSessions(data));
export const getSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().getSession(data));
export const resumeSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().resumeSession(data));
export const deleteSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().deleteSession(data));
export const submitAnswerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().submitAnswer(data));
export const completeSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().completeSession(data));
export const submitSurveyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(({ data }) => handlers().submitSurvey(data));
