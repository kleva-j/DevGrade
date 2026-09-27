import type { AssessmentResult, CategoryScore, QuestionResult } from "./types";

import type {
  ProficiencyLevel,
  SkillCategory,
  Difficulty,
  Framework,
} from "./constants";

import {
  SCORING_V1_PROFICIENCY_THRESHOLDS,
  SCORING_V1_SKILL_CATEGORIES,
  PROFICIENCY,
} from "./constants";

/** Maps a percentage to a proficiency tier. Boundaries are contiguous. */
export function proficiencyForV1(scorePct: number): ProficiencyLevel {
  if (scorePct >= SCORING_V1_PROFICIENCY_THRESHOLDS[PROFICIENCY.PROFICIENT])
    return PROFICIENCY.PROFICIENT;
  if (scorePct >= SCORING_V1_PROFICIENCY_THRESHOLDS[PROFICIENCY.DEVELOPING])
    return PROFICIENCY.DEVELOPING;
  return PROFICIENCY.SKILL_GAP;
}

/** Minimal question shape the scorer needs (keeps it decoupled from the DB row). */
export interface ScorableQuestion {
  id: string;
  skillCategory: SkillCategory;
  difficultyWeight: number;
  correctAnswer: number;
  explanation: string;
}

export interface ScorableAnswer {
  question: ScorableQuestion;
  selectedAnswer: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * V1 rule-based weighted scoring engine. Preserve this implementation and its
 * thresholds when adding a new scoring version; unfinished v1 snapshots must
 * continue to use the same rules.
 *
 *   categoryScore% = Σ(correct · weight) / Σ(weight) · 100   (per pillar)
 *   totalScore%    = Σ(correct · weight) / Σ(weight) · 100   (all pillars)
 *
 * Category order and tier thresholds are pinned to v1, independent of the
 * current question bank or future scoring versions.
 */
export function scoreAssessmentV1(
  sessionId: string,
  framework: Framework,
  targetLevel: Difficulty,
  answers: readonly ScorableAnswer[],
): AssessmentResult {
  const byCategory = new Map<
    SkillCategory,
    { correct: number; total: number }
  >();
  const questionResults: QuestionResult[] = [];
  let overallCorrect = 0;
  let overallTotal = 0;

  for (const { question, selectedAnswer } of answers) {
    const isCorrect = selectedAnswer === question.correctAnswer;
    const weight = question.difficultyWeight;

    overallTotal += weight;
    if (isCorrect) overallCorrect += weight;

    const bucket = byCategory.get(question.skillCategory) ?? {
      correct: 0,
      total: 0,
    };
    bucket.total += weight;
    if (isCorrect) bucket.correct += weight;
    byCategory.set(question.skillCategory, bucket);

    questionResults.push({
      questionId: question.id,
      isCorrect,
      explanation: question.explanation,
    });
  }

  const categoryScores: CategoryScore[] = SCORING_V1_SKILL_CATEGORIES.filter(
    (c) => byCategory.has(c),
  ).map((skillCategory) => {
    const { correct, total } = byCategory.get(skillCategory)!;
    const scorePct = total === 0 ? 0 : round2((correct / total) * 100);
    return {
      skillCategory,
      correctWeight: round2(correct),
      totalWeight: round2(total),
      scorePct,
      proficiency: proficiencyForV1(scorePct),
    };
  });

  const totalScore =
    overallTotal === 0 ? 0 : round2((overallCorrect / overallTotal) * 100);
  const skillGaps = categoryScores
    .filter((c) => c.proficiency === PROFICIENCY.SKILL_GAP)
    .map((c) => c.skillCategory);

  return {
    sessionId,
    framework,
    targetLevel,
    totalScore,
    maxScore: 100,
    proficiencyLevel: proficiencyForV1(totalScore),
    categoryScores,
    skillGaps,
    questionResults,
  };
}

/** Existing consumers retain the current scorer's names. */
export const scoreAssessment = scoreAssessmentV1;
export const proficiencyFor = proficiencyForV1;
