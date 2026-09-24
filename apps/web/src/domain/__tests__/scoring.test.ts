import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { ScorableAnswer } from "@/domain/scoring";
import type { SkillCategory } from "@/domain/constants";

import { proficiencyFor, scoreAssessment } from "@/domain/scoring";
import {
  ASSESSMENT_LENGTHS,
  WEIGHT_ADVANCED,
  SKILL_CATEGORIES,
  SKILL_CATEGORY,
  WEIGHT_CORE,
  PROFICIENCY,
  DIFFICULTY,
  FRAMEWORK,
} from "@/domain/constants";

/** Build one scorable answer; `selected === correct (0)` marks it correct. */
function answer(
  id: string,
  category: SkillCategory,
  weight: number,
  correct: boolean,
): ScorableAnswer {
  return {
    question: {
      id,
      skillCategory: category,
      difficultyWeight: weight,
      correctAnswer: 0,
      explanation: `explanation-${id}`,
    },
    selectedAnswer: correct ? 0 : 1,
  };
}

/** A core+advanced pair for one pillar with independent correctness. */
function pillarPair(
  category: SkillCategory,
  coreCorrect: boolean,
  advCorrect: boolean,
): ScorableAnswer[] {
  return [
    answer(`${category}-core`, category, WEIGHT_CORE, coreCorrect),
    answer(`${category}-adv`, category, WEIGHT_ADVANCED, advCorrect),
  ];
}

describe("proficiencyFor", () => {
  test("proficient at and above 80", () => {
    assert.equal(proficiencyFor(100), PROFICIENCY.PROFICIENT);
    assert.equal(proficiencyFor(80), PROFICIENCY.PROFICIENT);
  });

  test("developing in [50, 80)", () => {
    assert.equal(proficiencyFor(79.99), PROFICIENCY.DEVELOPING);
    assert.equal(proficiencyFor(66.67), PROFICIENCY.DEVELOPING);
    assert.equal(proficiencyFor(50), PROFICIENCY.DEVELOPING);
  });

  test("skill_gap below 50", () => {
    assert.equal(proficiencyFor(49.99), PROFICIENCY.SKILL_GAP);
    assert.equal(proficiencyFor(33.33), PROFICIENCY.SKILL_GAP);
    assert.equal(proficiencyFor(0), PROFICIENCY.SKILL_GAP);
  });
});

describe("scoreAssessment — per-pillar 0/33/67/100 resolution", () => {
  const cat = SKILL_CATEGORY.REACTIVITY;

  test("both wrong → 0 → skill_gap", () => {
    const r = scoreAssessment(
      "s",
      FRAMEWORK.REACT,
      DIFFICULTY.MID,
      pillarPair(cat, false, false),
    );
    const c = r.categoryScores[0];
    assert.ok(c);
    assert.equal(c.scorePct, 0);
    assert.equal(c.correctWeight, 0);
    assert.equal(c.totalWeight, 3);
    assert.equal(c.proficiency, PROFICIENCY.SKILL_GAP);
    assert.equal(r.totalScore, 0);
    assert.deepEqual(r.skillGaps, [cat]);
  });

  test("core only (weight 1) → 33.33 → skill_gap", () => {
    const r = scoreAssessment(
      "s",
      FRAMEWORK.REACT,
      DIFFICULTY.MID,
      pillarPair(cat, true, false),
    );
    const c = r.categoryScores[0];
    assert.ok(c);
    assert.equal(c.scorePct, 33.33);
    assert.equal(c.correctWeight, 1);
    assert.equal(c.proficiency, PROFICIENCY.SKILL_GAP);
    assert.equal(r.totalScore, 33.33);
  });

  test("advanced only (weight 2) → 66.67 → developing", () => {
    const r = scoreAssessment(
      "s",
      FRAMEWORK.REACT,
      DIFFICULTY.MID,
      pillarPair(cat, false, true),
    );
    const c = r.categoryScores[0];
    assert.ok(c);
    assert.equal(c.scorePct, 66.67);
    assert.equal(c.correctWeight, 2);
    assert.equal(c.proficiency, PROFICIENCY.DEVELOPING);
    assert.deepEqual(r.skillGaps, []);
  });

  test("both correct → 100 → proficient", () => {
    const r = scoreAssessment(
      "s",
      FRAMEWORK.REACT,
      DIFFICULTY.MID,
      pillarPair(cat, true, true),
    );
    const c = r.categoryScores[0];
    assert.ok(c);
    assert.equal(c.scorePct, 100);
    assert.equal(c.correctWeight, 3);
    assert.equal(c.proficiency, PROFICIENCY.PROFICIENT);
  });
});

describe("scoreAssessment — all assessment lengths", () => {
  for (const count of ASSESSMENT_LENGTHS) {
    test(`${count}: equal pillar contribution and unchanged proficiency thresholds`, () => {
      const pairs = count / (SKILL_CATEGORIES.length * 2);
      for (const [coreCorrect, advancedCorrect, expected] of [
        [true, true, 100],
        [false, false, 0],
        [true, false, 33.33],
        [false, true, 66.67],
      ] as const) {
        const answers = SKILL_CATEGORIES.flatMap((category) =>
          Array.from({ length: pairs }, (_, i) =>
            pillarPair(category, coreCorrect, advancedCorrect).map((item) => ({
              ...item,
              question: { ...item.question, id: `${item.question.id}-${i}` },
            })),
          ).flat(),
        );
        const result = scoreAssessment(
          "session",
          FRAMEWORK.REACT,
          DIFFICULTY.MID,
          answers,
        );
        assert.equal(result.questionResults.length, count);
        assert.equal(result.totalScore, expected);
        assert.equal(result.proficiencyLevel, proficiencyFor(expected));
        assert.ok(
          result.categoryScores.every(
            (c) => c.totalWeight === pairs * (WEIGHT_CORE + WEIGHT_ADVANCED),
          ),
        );
      }

      for (const correctCategory of SKILL_CATEGORIES) {
        const answers = SKILL_CATEGORIES.flatMap((category) =>
          Array.from({ length: pairs }, (_, i) =>
            pillarPair(
              category,
              category === correctCategory,
              category === correctCategory,
            ).map((item) => ({
              ...item,
              question: { ...item.question, id: `${item.question.id}-${i}` },
            })),
          ).flat(),
        );
        assert.equal(
          scoreAssessment("session", FRAMEWORK.REACT, DIFFICULTY.MID, answers)
            .totalScore,
          25,
        );
      }
    });
  }
});

describe("scoreAssessment — full 8-question assessment", () => {
  function fullAssessment(coreCorrect: boolean, advCorrect: boolean) {
    const answers = SKILL_CATEGORIES.flatMap((c) =>
      pillarPair(c, coreCorrect, advCorrect),
    );
    return scoreAssessment(
      "sess-1",
      FRAMEWORK.REACT,
      DIFFICULTY.SENIOR,
      answers,
    );
  }

  test("all correct → 100 / proficient, no gaps", () => {
    const r = fullAssessment(true, true);
    assert.equal(r.totalScore, 100);
    assert.equal(r.maxScore, 100);
    assert.equal(r.proficiencyLevel, PROFICIENCY.PROFICIENT);
    assert.equal(r.categoryScores.length, SKILL_CATEGORIES.length);
    assert.ok(r.categoryScores.every((c) => c.scorePct === 100));
    assert.deepEqual(r.skillGaps, []);
    assert.equal(r.questionResults.length, SKILL_CATEGORIES.length * 2);
  });

  test("all wrong → 0, every pillar a skill gap", () => {
    const r = fullAssessment(false, false);
    assert.equal(r.totalScore, 0);
    assert.equal(r.proficiencyLevel, PROFICIENCY.SKILL_GAP);
    assert.equal(r.skillGaps.length, SKILL_CATEGORIES.length);
  });

  test("weighting: advanced-only → 8/12 = 66.67 / developing", () => {
    const r = fullAssessment(false, true);
    assert.equal(r.totalScore, 66.67);
    assert.equal(r.proficiencyLevel, PROFICIENCY.DEVELOPING);
    assert.ok(
      r.categoryScores.every((c) => c.proficiency === PROFICIENCY.DEVELOPING),
    );
  });

  test("categoryScores follow SKILL_CATEGORIES order", () => {
    const r = fullAssessment(true, true);
    assert.deepEqual(
      r.categoryScores.map((c) => c.skillCategory),
      [...SKILL_CATEGORIES],
    );
  });

  test("passes through framework and target level", () => {
    const r = fullAssessment(true, false);
    assert.equal(r.framework, FRAMEWORK.REACT);
    assert.equal(r.targetLevel, DIFFICULTY.SENIOR);
    assert.equal(r.sessionId, "sess-1");
  });
});
