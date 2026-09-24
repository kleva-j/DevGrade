import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AssessmentConfiguration, PublicQuestion } from "@/domain/types";

import {
  ASSESSMENT_LENGTHS,
  DIFFICULTY,
  FRAMEWORK,
  SKILL_CATEGORY,
} from "@/domain/constants";

import { createSessionAdapter } from "./createSessionAdapter";

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
      const response = {
        sessionId: "server-session",
        sessionToken: "server-token",
        questions,
      };
      const requests: unknown[] = [];
      const getRawClientId = t.mock.fn(() => "anonymous-client");
      const createSession = createSessionAdapter(async (request) => {
        requests.push(request);
        return response;
      }, getRawClientId);

      assert.equal(getRawClientId.mock.callCount(), 0);
      const result = await createSession(configuration);
      assert.deepEqual(requests, [
        { data: { ...configuration, rawClientId: "anonymous-client" } },
      ]);
      assert.equal(getRawClientId.mock.callCount(), 1);
      assert.deepEqual(result, response);
      assert.equal(result.questions, questions);
    });
  }

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
