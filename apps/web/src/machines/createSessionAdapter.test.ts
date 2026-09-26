import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssessmentEndpoints } from "./createSessionAdapter";
import type { LegacySummaryView } from "@/domain/sessionContracts";
import {
  AssessmentClientError,
  createAssessmentApi,
  unwrapAssessmentEnvelope,
} from "./createSessionAdapter";
import {
  ASSESSMENT_LENGTHS,
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  SESSION_DISCOVERY,
  SESSION_VIEW,
} from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import { configuration, makeSession } from "./sessionTestFixtures";

function endpoints(): AssessmentEndpoints {
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected endpoint");
  };
  return {
    createSession: unused,
    discoverSessions: unused,
    getSession: unused,
    resumeSession: unused,
    deleteSession: unused,
    submitAnswer: unused,
    completeSession: unused,
    submitSurvey: unused,
  };
}
for (const questionCount of ASSESSMENT_LENGTHS)
  test(`creation passes all known credentials and ${questionCount}; preserves the complete server view`, async (t) => {
    const session = makeSession();
    const known = [session.credential];
    // The returned count deliberately differs from Standard/Deep. Never pad or truncate.
    const output = { ...session.assessment, ...session.credential };
    const requests: unknown[] = [];
    const getClient = t.mock.fn(() => "client-id");
    const api = createAssessmentApi(
      {
        ...endpoints(),
        createSession: async (request) => {
          requests.push(request);
          return { ok: true, data: output };
        },
      },
      getClient,
    );
    assert.equal(getClient.mock.callCount(), 0);
    assert.equal(
      await api.createSession({ ...configuration, questionCount }, known),
      output,
    );
    assert.equal(getClient.mock.callCount(), 1);
    assert.deepEqual(requests, [
      {
        data: {
          ...configuration,
          questionCount,
          rawClientId: "client-id",
          knownCredentials: known,
        },
      },
    ]);
  });
test("all endpoints preserve lifecycle/progress/survey contracts and POST data shapes", async () => {
  const session = makeSession();
  const calls: unknown[] = [];
  const answer = {
    questionId: "question-0",
    selectedAnswer: 1,
    timeSpentSeconds: 9,
  };
  const accepted = {
    success: true as const,
    acceptedAnswer: answer,
    acceptedAnswers: [answer],
    answeredCount: 1,
    totalQuestions: 8,
    nextQuestionId: "question-1",
    sessionComplete: false,
  };
  const api = createAssessmentApi(
    {
      ...endpoints(),
      discoverSessions: async (input) => {
        calls.push(input);
        return {
          ok: true,
          data: {
            sessions: [
              {
                kind: SESSION_DISCOVERY.UNAVAILABLE,
                sessionId: session.credential.sessionId,
              },
            ],
          },
        };
      },
      getSession: async (input) => {
        calls.push(input);
        return { ok: true, data: session.report };
      },
      resumeSession: async (input) => {
        calls.push(input);
        return { ok: true, data: session.assessment };
      },
      deleteSession: async (input) => {
        calls.push(input);
        return {
          ok: true,
          data: {
            kind: DELETE_OUTCOME.CHANGED_STATE,
            currentState: DELETE_EXPECTATION.COMPLETED,
          },
        };
      },
      submitAnswer: async (input) => {
        calls.push(input);
        return { ok: true, data: accepted };
      },
      completeSession: async (input) => {
        calls.push(input);
        return { ok: true, data: session.report };
      },
      submitSurvey: async (input) => {
        calls.push(input);
        return { ok: true, data: { success: true } };
      },
    },
    () => "client",
  );
  await api.discoverSessions([session.credential]);
  assert.equal(await api.getSession(session.credential), session.report);
  assert.equal(await api.resumeSession(session.credential), session.assessment);
  assert.equal(
    (
      await api.deleteSession({
        ...session.credential,
        expectedState: DELETE_EXPECTATION.UNFINISHED,
      })
    ).kind,
    DELETE_OUTCOME.CHANGED_STATE,
  );
  assert.equal(
    await api.submitAnswer({ ...session.credential, answer }),
    accepted,
  );
  assert.equal(await api.completeSession(session.credential), session.report);
  await api.submitSurvey({ ...session.credential, rating: 4 });
  assert.deepEqual(calls, [
    { data: { credentials: [session.credential] } },
    { data: session.credential },
    { data: session.credential },
    {
      data: {
        ...session.credential,
        expectedState: DELETE_EXPECTATION.UNFINISHED,
      },
    },
    { data: { ...session.credential, ...answer } },
    { data: session.credential },
    { data: { ...session.credential, rating: 4 } },
  ]);
});
test("completion preserves legacy summaries, not an invented report", async () => {
  const session = makeSession();
  const result = session.report.reportSnapshot.result;
  const legacy: LegacySummaryView = {
    kind: SESSION_VIEW.LEGACY_SUMMARY,
    sessionId: session.credential.sessionId,
    attemptExpiresAt: session.report.attemptExpiresAt,
    accessExpiresAt: session.report.accessExpiresAt,
    surveyRating: 4,
    summary: {
      framework: result.framework,
      targetLevel: result.targetLevel,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      proficiencyLevel: result.proficiencyLevel,
      categoryScores: result.categoryScores,
      completedAt: session.report.reportSnapshot.completedAt,
    },
  };
  const api = createAssessmentApi(
    {
      ...endpoints(),
      completeSession: async () => ({ ok: true, data: legacy }),
    },
    () => "client",
  );
  assert.equal(await api.completeSession(session.credential), legacy);
});
test("safe failures retain typed blocker payloads; transport failures are not reinterpreted", async () => {
  const failure = {
    code: ERROR_CODE.EXISTING_ATTEMPT,
    message: "Resume or delete",
    blockers: [],
  };
  const api = createAssessmentApi(
    {
      ...endpoints(),
      createSession: async () => ({ ok: false, error: failure }),
    },
    () => "client",
  );
  await assert.rejects(
    api.createSession(configuration, []),
    (error) =>
      error instanceof AssessmentClientError && error.failure === failure,
  );
  for (const code of Object.values(ERROR_CODE).filter(
    (value) => value !== ERROR_CODE.EXISTING_ATTEMPT,
  ))
    assert.throws(
      () =>
        unwrapAssessmentEnvelope({
          ok: false,
          error: { code, message: "safe" },
        }),
      (error) => error instanceof AssessmentClientError && error.code === code,
    );
  const transport = new Error("offline");
  const broken = createAssessmentApi(
    {
      ...endpoints(),
      createSession: async () => {
        throw transport;
      },
    },
    () => "client",
  );
  await assert.rejects(
    broken.createSession(configuration, []),
    (error) => error === transport,
  );
});
