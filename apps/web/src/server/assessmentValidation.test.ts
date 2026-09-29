import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { randomUUID } from "node:crypto";

import {
  ASSESSMENT_CONTRACT,
  DIFFICULTIES,
  DIFFICULTY,
  FRAMEWORK,
} from "@/domain/constants";
import {
  createSessionInput,
  createSessionSchema,
  sessionContentInput,
  submitAnswerInput,
  submitAnswerWireInput,
} from "@/server/assessmentValidation";

import {
  invalidQuestionCounts,
  lengthCases,
} from "./__tests__/assessmentCases";

const configuration = {
  framework: FRAMEWORK.REACT,
  targetLevel: DIFFICULTY.MID,
};

for (const [name, schema, clientFields] of [
  ["createSessionSchema", createSessionSchema, {}],
  ["createSessionInput", createSessionInput, { rawClientId: "anonymous-test" }],
] as const) {
  describe(name, () => {
    for (const targetLevel of DIFFICULTIES) {
      for (const { questionCount } of lengthCases) {
        test(`accepts numeric ${questionCount} at ${targetLevel}`, () => {
          const input = {
            framework: FRAMEWORK.REACT,
            targetLevel,
            questionCount,
            ...clientFields,
          };
          assert.deepEqual(schema.parse(input), input);
        });
      }

      test(`omitted questionCount defaults to exactly 8 at ${targetLevel}`, () => {
        const input = { ...configuration, targetLevel, ...clientFields };
        assert.deepEqual(schema.parse(input), { ...input, questionCount: 8 });
      });
    }

    test("undefined questionCount also defaults to exactly 8", () => {
      const input = { ...configuration, ...clientFields };
      assert.deepEqual(schema.parse({ ...input, questionCount: undefined }), {
        ...input,
        questionCount: 8,
      });
    });

    for (const { label, value } of invalidQuestionCounts) {
      test(`rejects questionCount ${label} without coercion or fallback`, () => {
        const result = schema.safeParse({
          ...configuration,
          ...clientFields,
          questionCount: value,
        });
        assert.ok(!result.success);
        assert.ok(
          result.error.issues.some(
            (issue) => issue.path[0] === "questionCount",
          ),
        );
      });
    }

    for (const field of ["framework", "targetLevel"] as const) {
      for (const value of [undefined, null, "", "unsupported", 8, true]) {
        test(`still rejects invalid ${field}: ${String(value)}`, () => {
          const result = schema.safeParse({
            ...configuration,
            ...clientFields,
            questionCount: 16,
            [field]: value,
          });
          assert.ok(!result.success);
          assert.ok(
            result.error.issues.some((issue) => issue.path[0] === field),
          );
        });
      }
    }
  });
}

test("content contracts accept only the explicit option-ID marker or omission", () => {
  for (const [schema, input] of [
    [createSessionInput, { ...configuration, rawClientId: "anonymous-test" }],
    [
      sessionContentInput,
      { sessionId: randomUUID(), sessionToken: "a".repeat(64) },
    ],
  ] as const) {
    assert.ok(schema.safeParse(input).success);
    assert.ok(
      schema.safeParse({
        ...input,
        assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
      }).success,
    );
    for (const assessmentContract of [null, false, 1, "", "option_ids_v2"])
      assert.equal(
        schema.safeParse({ ...input, assessmentContract }).success,
        false,
      );
  }
});

test("wire answers require exactly one nonnegative integer field; service accepts only canonical IDs", () => {
  const base = {
    sessionId: randomUUID(),
    sessionToken: "a".repeat(64),
    questionId: "q",
    timeSpentSeconds: 2,
  };
  for (const field of ["selectedOptionId", "selectedAnswer"]) {
    for (const id of [0, 10, 42]) {
      const input = { ...base, [field]: id };
      assert.deepEqual(submitAnswerWireInput.parse(input), input);
      assert.equal(
        submitAnswerInput.safeParse(input).success,
        field === "selectedOptionId",
      );
    }
    for (const id of [-1, 0.5, "2", null, undefined, true, NaN, Infinity])
      assert.equal(
        submitAnswerWireInput.safeParse({ ...base, [field]: id }).success,
        false,
      );
  }
  assert.equal(submitAnswerWireInput.safeParse(base).success, false);
  for (const selectedAnswer of [0, 1, null, undefined])
    assert.equal(
      submitAnswerWireInput.safeParse({
        ...base,
        selectedOptionId: 0,
        selectedAnswer,
      }).success,
      false,
    );
});

describe("createSessionInput anonymous client id", () => {
  for (const rawClientId of [undefined, null, "", 123, false]) {
    test(`rejects rawClientId ${String(rawClientId)}`, () => {
      const result = createSessionInput.safeParse({
        ...configuration,
        questionCount: 32,
        rawClientId,
      });
      assert.ok(!result.success);
      assert.ok(
        result.error.issues.some((issue) => issue.path[0] === "rawClientId"),
      );
    });
  }

  test("keeps the anonymous client id and the explicitly selected length", () => {
    const input = {
      ...configuration,
      questionCount: 32,
      rawClientId: "anonymous-test-client",
    };
    assert.deepEqual(createSessionInput.parse(input), input);
  });
});
