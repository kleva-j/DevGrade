import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { SkillCategory } from "@/domain/constants";
import type { Question } from "@/domain/types";

import { createRng, seedFromString } from "@/domain/random";
import { stratifiedSample } from "@/domain/sampling";
import {
  WEIGHT_ADVANCED,
  SKILL_CATEGORIES,
  SKILL_CATEGORY,
  TOTAL_QUESTIONS,
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

/** A balanced pool: one core + one advanced for every pillar. */
function balancedPool(): Question[] {
  return SKILL_CATEGORIES.flatMap((c) => [
    q(`${c}-core`, c, WEIGHT_CORE),
    q(`${c}-adv`, c, WEIGHT_ADVANCED),
  ]);
}

function weightsByCategory(questions: Question[], category: SkillCategory) {
  return questions
    .filter((x) => x.skillCategory === category)
    .map((x) => x.difficultyWeight)
    .sort((a, b) => a - b);
}

describe("stratifiedSample", () => {
  test("balanced pool → 8 questions, no shortfalls, core+advanced per pillar", () => {
    const rng = createRng(seedFromString("balanced"));
    const { questions, shortfalls } = stratifiedSample(balancedPool(), rng);

    assert.equal(questions.length, TOTAL_QUESTIONS);
    assert.equal(shortfalls.length, 0);
    for (const c of SKILL_CATEGORIES) {
      assert.deepEqual(
        weightsByCategory(questions, c),
        [WEIGHT_CORE, WEIGHT_ADVANCED],
        `pillar ${c} should draw one core + one advanced`,
      );
    }
  });

  test("C2: unbalanced pool still pairs core+advanced across many seeds", () => {
    // REACTIVITY holds 3 core + 1 advanced; a median split could pick two cores.
    const pool: Question[] = [
      q("react-core-1", SKILL_CATEGORY.REACTIVITY, WEIGHT_CORE),
      q("react-core-2", SKILL_CATEGORY.REACTIVITY, WEIGHT_CORE),
      q("react-core-3", SKILL_CATEGORY.REACTIVITY, WEIGHT_CORE),
      q("react-adv-1", SKILL_CATEGORY.REACTIVITY, WEIGHT_ADVANCED),
      ...SKILL_CATEGORIES.filter(
        (c) => c !== SKILL_CATEGORY.REACTIVITY,
      ).flatMap((c) => [
        q(`${c}-core`, c, WEIGHT_CORE),
        q(`${c}-adv`, c, WEIGHT_ADVANCED),
      ]),
    ];

    for (let seed = 0; seed < 25; seed++) {
      const { questions, shortfalls } = stratifiedSample(pool, createRng(seed));
      assert.equal(shortfalls.length, 0);
      assert.deepEqual(
        weightsByCategory(questions, SKILL_CATEGORY.REACTIVITY),
        [WEIGHT_CORE, WEIGHT_ADVANCED],
        `seed ${seed} must still yield one core + one advanced`,
      );
    }
  });

  test("records a shortfall when a pillar cannot supply the quota", () => {
    const pool = balancedPool().filter(
      (x) => x.skillCategory !== SKILL_CATEGORY.LIFECYCLE,
    );
    // Give LIFECYCLE a single question (needs 2).
    pool.push(q("life-only", SKILL_CATEGORY.LIFECYCLE, WEIGHT_CORE));

    const { questions, shortfalls } = stratifiedSample(
      pool,
      createRng(seedFromString("short")),
    );

    assert.equal(shortfalls.length, 1);
    assert.deepEqual(shortfalls[0], {
      skillCategory: SKILL_CATEGORY.LIFECYCLE,
      needed: 2,
      available: 1,
    });
    assert.ok(questions.length < TOTAL_QUESTIONS);
  });

  test("empty pillar reports available: 0", () => {
    const pool = balancedPool().filter(
      (x) => x.skillCategory !== SKILL_CATEGORY.ASYNC,
    );
    const { shortfalls } = stratifiedSample(
      pool,
      createRng(seedFromString("empty")),
    );
    const asyncShort = shortfalls.find(
      (s) => s.skillCategory === SKILL_CATEGORY.ASYNC,
    );
    assert.ok(asyncShort);
    assert.equal(asyncShort.available, 0);
  });

  test("seeded sampling is deterministic (same seed → identical order)", () => {
    const pool = balancedPool();
    const ids = () =>
      stratifiedSample(pool, createRng(seedFromString("repeat"))).questions.map(
        (x) => x.id,
      );
    assert.deepEqual(ids(), ids());
  });
});
