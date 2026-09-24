import type { AssessmentLength, SkillCategory } from "./constants";
import type { Question } from "./types";

import { shuffle } from "./random";
import {
  DEFAULT_ASSESSMENT_LENGTH,
  SKILL_CATEGORIES,
  WEIGHT_ADVANCED,
  WEIGHT_CORE,
} from "./constants";

const SAMPLING_WEIGHTS = [WEIGHT_CORE, WEIGHT_ADVANCED] as const;

export interface Shortfall {
  skillCategory: SkillCategory;
  difficultyWeight: number;
  needed: number;
  available: number;
}

export interface SamplingResult {
  questions: Question[];
  /** Weight-class quotas that the pool cannot meet. No partial set is returned. */
  shortfalls: Shortfall[];
}

/**
 * Pick equal core/advanced pairs per pillar: Quick 1, Standard 2, Deep 4.
 * The caller supplies a pool filtered by framework, level, and active status.
 * No replacement or class substitution: a shortfall returns no questions.
 * Given the same ordered pool, count, and seeded RNG, selection is reproducible.
 */
export function stratifiedSample(
  pool: readonly Question[],
  count: AssessmentLength = DEFAULT_ASSESSMENT_LENGTH,
  rng: () => number = Math.random,
): SamplingResult {
  const quota = count / (SKILL_CATEGORIES.length * SAMPLING_WEIGHTS.length);
  const byCategory = new Map<SkillCategory, Question[]>();
  const seen = new Set<string>();
  for (const question of pool) {
    // DB ids are unique; keep that guarantee for any other caller as well.
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    const bucket = byCategory.get(question.skillCategory) ?? [];
    bucket.push(question);
    byCategory.set(question.skillCategory, bucket);
  }

  const buckets: Question[][] = [];
  const shortfalls: Shortfall[] = [];
  for (const skillCategory of SKILL_CATEGORIES) {
    const pillar = byCategory.get(skillCategory) ?? [];
    for (const difficultyWeight of SAMPLING_WEIGHTS) {
      const bucket = pillar.filter(
        (question) => question.difficultyWeight === difficultyWeight,
      );
      if (bucket.length < quota) {
        shortfalls.push({
          skillCategory,
          difficultyWeight,
          needed: quota,
          available: bucket.length,
        });
      }
      buckets.push(bucket);
    }
  }

  if (shortfalls.length > 0) return { questions: [], shortfalls };

  const selected = buckets.flatMap((bucket) =>
    shuffle(bucket, rng).slice(0, quota),
  );
  return { questions: shuffle(selected, rng), shortfalls: [] };
}
