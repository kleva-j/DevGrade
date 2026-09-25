import { createAssessmentApi } from "./createSessionAdapter";
import { createSessionRecovery } from "./sessionRecovery";
import { createSessionLock, createSessionStorage } from "./sessionStorage";
import {
  completeSessionFn,
  createSessionFn,
  deleteSessionFn,
  discoverSessionsFn,
  getSessionFn,
  resumeSessionFn,
  submitAnswerFn,
  submitSurveyFn,
} from "@/server/assessmentFns";

const CLIENT_ID_KEY = "devgrade.clientId";

/** Construct per mounted flow, never a credential-bearing SSR singleton. */
export function createBrowserRecovery() {
  let clientId: string | undefined;
  function getRawClientId() {
    if (!clientId) {
      const saved = window.localStorage.getItem(CLIENT_ID_KEY);
      clientId = saved || crypto.randomUUID();
      window.localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
  }
  return createSessionRecovery(
    createAssessmentApi(
      {
        createSession: createSessionFn,
        discoverSessions: discoverSessionsFn,
        getSession: getSessionFn,
        resumeSession: resumeSessionFn,
        deleteSession: deleteSessionFn,
        submitAnswer: submitAnswerFn,
        completeSession: completeSessionFn,
        submitSurvey: submitSurveyFn,
      },
      getRawClientId,
    ),
    createSessionStorage(),
    createSessionLock(),
  );
}
