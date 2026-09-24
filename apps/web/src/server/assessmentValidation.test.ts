import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DIFFICULTIES, DIFFICULTY, FRAMEWORK } from "@/domain/constants";
import {
  createSessionInput,
  createSessionSchema,
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
