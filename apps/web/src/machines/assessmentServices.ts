import type { AssessmentServices } from "@/machines/assessmentMachine";

import { createSessionAdapter } from "./createSessionAdapter";

import {
  completeSessionFn,
  createSessionFn,
  submitAnswerFn,
  submitSurveyFn,
} from "@/server/assessmentFns";

/** localStorage key holding the anonymous, per-browser client id. */
const CLIENT_ID_KEY = "devgrade.clientId";

/**
 * Return a stable random client id for this browser, minting one on first use.
 * It is sent to `createSession` and hashed server-side for rate limiting — it is
 * not PII and is deliberately generated client-side to avoid server cookie state.
 */
export function getRawClientId(): string {
  if (typeof localStorage === "undefined") return crypto.randomUUID();
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

/**
 * Concrete `AssessmentServices` the machine consumes in the app. Each method is
 * a thin translation between the machine's argument shape and the server fns.
 */
export const assessmentServices: AssessmentServices = {
  createSession: createSessionAdapter(createSessionFn, getRawClientId),

  async submitAnswer({ sessionId, sessionToken, answer }) {
    const res = await submitAnswerFn({
      data: {
        sessionId,
        sessionToken,
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
        timeSpentSeconds: answer.timeSpentSeconds,
      },
    });
    return { sessionComplete: res.sessionComplete };
  },

  async completeSession({ sessionId, sessionToken }) {
    return completeSessionFn({ data: { sessionId, sessionToken } });
  },

  async submitSurvey({ sessionId, sessionToken, rating }) {
    return submitSurveyFn({ data: { sessionId, sessionToken, rating } });
  },
};
