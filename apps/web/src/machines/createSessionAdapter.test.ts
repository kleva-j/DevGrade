import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AssessmentConfiguration, PublicQuestion } from "@/domain/types";
import type {
  CreatedSession,
  ReportView,
  LegacySummaryView,
} from "@/domain/sessionContracts";

import {
  ASSESSMENT_LENGTHS,
  DIFFICULTY,
  FRAMEWORK,
  SKILL_CATEGORY,
  SESSION_VIEW,
  SESSION_STATUS,
  PROFICIENCY,
  REPORT_SNAPSHOT_VERSION,
  SCORING_VERSION,
} from "@/domain/constants";

import {
  AssessmentClientError,
  createSessionAdapter,
  unwrapAssessmentEnvelope,
  unwrapCompletionEnvelope,
} from "./createSessionAdapter";
import { ERROR_CODE } from "@/server/errors";

describe("createSessionAdapter", () => {
  for (const questionCount of ASSESSMENT_LENGTHS) {
    test(`passes ${questionCount} and all other configuration to the server, preserving returned questions`, async (t) => {
      const configuration: AssessmentConfiguration = {
        framework: FRAMEWORK.REACT,
        targetLevel: DIFFICULTY.SENIOR,
        questionCount,
      };
      // Deliberately differs from the requested count: never pad or truncate.
      const questions: PublicQuestion[] = [
        {
          id: "returned-question",
          skillCategory: SKILL_CATEGORY.ASYNC,
          title: "Returned question",
          prompt: "Select an answer.",
          codeBlock: null,
          options: ["A", "B", "C", "D"],
        },
      ];
      const response: CreatedSession = {
        kind: SESSION_VIEW.ASSESSMENT,
        sessionId: "server-session",
        sessionToken: "server-token",
        questions,
        configuration: { ...configuration, questionCount: questions.length },
        createdAt: "2026-09-25T12:00:00.000Z",
        attemptExpiresAt: "2026-09-26T12:00:00.000Z",
        accessExpiresAt: "2026-10-02T12:00:00.000Z",
        effectiveStatus: SESSION_STATUS.IN_PROGRESS,
        answeredCount: 0,
        totalQuestions: questions.length,
        nextQuestionId: questions[0]!.id,
        acceptedAnswers: [],
        blocksCreation: true,
        canResume: true,
      };
      const requests: unknown[] = [];
      const getRawClientId = t.mock.fn(() => "anonymous-client");
      const createSession = createSessionAdapter(async (request) => {
        requests.push(request);
        return { ok: true, data: response };
      }, getRawClientId);

      assert.equal(getRawClientId.mock.callCount(), 0);
      const result = await createSession(configuration);
      assert.deepEqual(requests, [
        { data: { ...configuration, rawClientId: "anonymous-client" } },
      ]);
      assert.equal(getRawClientId.mock.callCount(), 1);
      assert.deepEqual(result, {
        sessionId: response.sessionId,
        sessionToken: response.sessionToken,
        questions,
      });
      assert.equal(result.questions, questions);
    });
  }

  test("typed server failures retain their codes without parsing messages", async () => {
    const failure = {
      code: ERROR_CODE.EXISTING_ATTEMPT,
      message: "Resume or delete first",
      blockers: [],
    };
    const createSession = createSessionAdapter(
      async () => ({ ok: false, error: failure }),
      () => "anonymous-client",
    );
    await assert.rejects(
      createSession({
        framework: FRAMEWORK.REACT,
        targetLevel: DIFFICULTY.MID,
        questionCount: ASSESSMENT_LENGTHS[0],
      }),
      (error) => {
        assert.ok(error instanceof AssessmentClientError);
        assert.equal(error.code, ERROR_CODE.EXISTING_ATTEMPT);
        assert.equal(error.failure, failure);
        return true;
      },
    );
    assert.throws(
      () =>
        unwrapAssessmentEnvelope({
          ok: false,
          error: { code: ERROR_CODE.ACCESS_EXPIRED, message: "Expired" },
        }),
      AssessmentClientError,
    );
    assert.equal(unwrapAssessmentEnvelope({ ok: true, data: 42 }), 42);
  });

  test("completion unwraps the saved result only for the baseline machine; legacy stays typed", () => {
    const view: ReportView = {
      kind: SESSION_VIEW.REPORT,
      sessionId: "server-session",
      attemptExpiresAt: "2026-09-26T12:00:00.000Z",
      accessExpiresAt: "2026-10-02T12:00:00.000Z",
      surveyRating: 4,
      reportSnapshot: {
        version: REPORT_SNAPSHOT_VERSION,
        scoringVersion: SCORING_VERSION.V1,
        completedAt: "2026-09-25T13:00:00.000Z",
        result: {
          sessionId: "server-session",
          framework: FRAMEWORK.REACT,
          targetLevel: DIFFICULTY.MID,
          totalScore: 100,
          maxScore: 100,
          proficiencyLevel: PROFICIENCY.PROFICIENT,
          categoryScores: [],
          skillGaps: [],
          questionResults: [],
        },
        questions: [],
        pillars: [],
      },
    };
    assert.equal(
      unwrapCompletionEnvelope({ ok: true, data: view }),
      view.reportSnapshot.result,
    );
    const legacy: LegacySummaryView = {
      kind: SESSION_VIEW.LEGACY_SUMMARY,
      sessionId: view.sessionId,
      attemptExpiresAt: view.attemptExpiresAt,
      accessExpiresAt: view.accessExpiresAt,
      surveyRating: null,
      summary: {
        framework: FRAMEWORK.REACT,
        targetLevel: DIFFICULTY.MID,
        totalScore: 37,
        maxScore: 100,
        proficiencyLevel: PROFICIENCY.SKILL_GAP,
        completedAt: view.reportSnapshot.completedAt,
        categoryScores: [],
      },
    };
    assert.throws(
      () => unwrapCompletionEnvelope({ ok: true, data: legacy }),
      (error) =>
        error instanceof AssessmentClientError &&
        error.code === ERROR_CODE.LEGACY_SUMMARY_AVAILABLE,
    );
    assert.throws(
      () =>
        unwrapCompletionEnvelope({
          ok: false,
          error: { code: ERROR_CODE.ACCESS_EXPIRED, message: "Expired" },
        }),
      (error) =>
        error instanceof AssessmentClientError &&
        error.code === ERROR_CODE.ACCESS_EXPIRED,
    );
  });

  test("propagates creation failures so the machine can retry", async () => {
    const failure = new Error("Creation failed");
    const createSession = createSessionAdapter(
      async () => {
        throw failure;
      },
      () => "anonymous-client",
    );
    await assert.rejects(
      createSession({
        framework: FRAMEWORK.REACT,
        targetLevel: DIFFICULTY.MID,
        questionCount: ASSESSMENT_LENGTHS[0],
      }),
      (error) => error === failure,
    );
  });
});
