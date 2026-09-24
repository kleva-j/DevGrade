import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { SkillCategory } from "@/domain/constants";
import type { Question } from "@/domain/types";

import { createRng } from "@/domain/random";
import { stratifiedSample } from "@/domain/sampling";
import {
  ASSESSMENT_LENGTHS,
  ASSESSMENT_LENGTH,
  DEFAULT_ASSESSMENT_LENGTH,
  WEIGHT_ADVANCED,
  SKILL_CATEGORIES,
  SKILL_CATEGORY,
  WEIGHT_CORE,
  DIFFICULTY,
  FRAMEWORK,
} from "@/domain/constants";

function q(id: string, category: SkillCategory, weight: number): Question {
  return {
    id,
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: category,
    title: id,
    prompt: "prompt",
    codeBlock: null,
    options: ["a", "b", "c", "d"],
    correctAnswer: 0,
    explanation: "explanation",
    difficultyWeight: weight,
  };
}

function balancedPool(depth = 6): Question[] {
  return SKILL_CATEGORIES.flatMap((category) =>
    Array.from({ length: depth }, (_, index) => [
      q(`${category}-core-${index}`, category, WEIGHT_CORE),
      q(`${category}-adv-${index}`, category, WEIGHT_ADVANCED),
    ]).flat(),
  );
}

const weights = [WEIGHT_CORE, WEIGHT_ADVANCED];

describe("stratifiedSample", () => {
  for (const count of ASSESSMENT_LENGTHS) {
    test(`${count}: exact class quotas, unique ids, deterministic order, unchanged input`, () => {
      const pool = balancedPool();
      const before = structuredClone(pool);
      const quota = count / (SKILL_CATEGORIES.length * weights.length);
      for (let seed = 0; seed < 25; seed++) {
        const result = stratifiedSample(pool, count, createRng(seed));
        assert.deepEqual(result.shortfalls, []);
        assert.equal(result.questions.length, count);
        assert.equal(new Set(result.questions.map((x) => x.id)).size, count);
        for (const category of SKILL_CATEGORIES) {
          for (const weight of weights) {
            assert.equal(
              result.questions.filter(
                (x) =>
                  x.skillCategory === category && x.difficultyWeight === weight,
              ).length,
              quota,
            );
          }
        }
        assert.deepEqual(
          result,
          stratifiedSample(pool, count, createRng(seed)),
        );
      }
      assert.deepEqual(pool, before);
    });

    test(`${count}: samples the exact minimum pool and varies selection with larger pools`, () => {
      const quota = count / (SKILL_CATEGORIES.length * weights.length);
      assert.equal(
        stratifiedSample(balancedPool(quota), count).questions.length,
        count,
      );
      const pool = balancedPool();
      const sets = new Set(
        Array.from({ length: 10 }, (_, seed) =>
          stratifiedSample(pool, count, createRng(seed))
            .questions.map((x) => x.id)
            .sort()
            .join(","),
        ),
      );
      assert.ok(sets.size > 1);
    });

    for (const missingWeight of weights) {
      test(`${count}: surplus in one class cannot mask a shortfall in the other`, () => {
        const quota = count / (SKILL_CATEGORIES.length * weights.length);
        const pool = balancedPool().filter(
          (x) =>
            x.skillCategory !== SKILL_CATEGORY.LIFECYCLE ||
            x.difficultyWeight !== missingWeight,
        );
        for (let i = 0; i < quota - 1; i++) {
          pool.push(
            q(`remaining-${i}`, SKILL_CATEGORY.LIFECYCLE, missingWeight),
          );
        }
        const result = stratifiedSample(pool, count, createRng(1));
        assert.deepEqual(result.questions, []);
        assert.deepEqual(result.shortfalls, [
          {
            skillCategory: SKILL_CATEGORY.LIFECYCLE,
            difficultyWeight: missingWeight,
            needed: quota,
            available: quota - 1,
          },
        ]);
      });
    }
  }

  test("omitted length preserves Quick", () => {
    const result = stratifiedSample(balancedPool(1));
    assert.equal(result.questions.length, DEFAULT_ASSESSMENT_LENGTH);
    assert.deepEqual(result.shortfalls, []);
  });

  test("unbalanced pools still supply exact core/advanced pairs", () => {
    const pool = balancedPool(1);
    for (let i = 0; i < 10; i++)
      pool.push(q(`extra-${i}`, SKILL_CATEGORY.REACTIVITY, WEIGHT_CORE));
    for (let seed = 0; seed < 25; seed++) {
      const result = stratifiedSample(
        pool,
        ASSESSMENT_LENGTH.QUICK,
        createRng(seed),
      );
      assert.deepEqual(result.shortfalls, []);
      assert.equal(
        result.questions.filter((x) => x.difficultyWeight === WEIGHT_ADVANCED)
          .length,
        SKILL_CATEGORIES.length,
      );
    }
  });

  test("empty pool reports every missing class without returning a partial assessment", () => {
    const result = stratifiedSample([]);
    assert.deepEqual(result.questions, []);
    assert.equal(
      result.shortfalls.length,
      SKILL_CATEGORIES.length * weights.length,
    );
    assert.ok(
      result.shortfalls.every((x) => x.available === 0 && x.needed === 1),
    );
  });

  test("unknown weights do not substitute for core or advanced", () => {
    const pool = balancedPool(1).map((x) => ({
      ...x,
      difficultyWeight: x.difficultyWeight + 10,
    }));
    assert.equal(
      stratifiedSample(pool).shortfalls.length,
      SKILL_CATEGORIES.length * weights.length,
    );
  });

  test("duplicate ids do not fill a larger quota", () => {
    const pool = balancedPool(1);
    const result = stratifiedSample(
      [...pool, ...pool],
      ASSESSMENT_LENGTH.STANDARD,
    );
    assert.deepEqual(result.questions, []);
    assert.ok(
      result.shortfalls.every((x) => x.available === 1 && x.needed === 2),
    );
  });
});
