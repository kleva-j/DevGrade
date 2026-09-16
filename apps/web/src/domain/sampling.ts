import type { SkillCategory } from "./constants";
import type { Question } from "./types";

import { QUESTIONS_PER_PILLAR, SKILL_CATEGORIES } from "./constants";
import { pickOne, shuffle } from "./random";

export interface Shortfall {
  skillCategory: SkillCategory;
  needed: number;
  available: number;
}

export interface SamplingResult {
  questions: Question[];
  /** Pillars that could not supply the full quota (US-6 "handle gracefully"). */
  shortfalls: Shortfall[];
}

/**
 * Stratified sampling across the four competency pillars.
 *
 * For each pillar we pick `QUESTIONS_PER_PILLAR` questions. To realize the
 * score-granularity decision (#3) we deliberately spread the pick across the
 * difficulty-weight range: one question of the lightest weight present ("core")
 * and one of the heaviest ("advanced"). Selection *within* each weight class is
 * random, preserving pool diversity for anti-leakage.
 *
 * Pass a seeded `rng` (see `createRng`) for reproducible sessions.
 */
export function stratifiedSample(
  pool: readonly Question[],
  rng: () => number = Math.random,
): SamplingResult {
  const byCategory = new Map<SkillCategory, Question[]>();
  for (const q of pool) {
    const bucket = byCategory.get(q.skillCategory);
    if (bucket) bucket.push(q);
    else byCategory.set(q.skillCategory, [q]);
  }

  const questions: Question[] = [];
  const shortfalls: Shortfall[] = [];

  for (const category of SKILL_CATEGORIES) {
    const available = byCategory.get(category) ?? [];
    const picked = pickWithWeightSpread(available, QUESTIONS_PER_PILLAR, rng);
    if (picked.length < QUESTIONS_PER_PILLAR) {
      shortfalls.push({
        skillCategory: category,
        needed: QUESTIONS_PER_PILLAR,
        available: available.length,
      });
    }
    questions.push(...picked);
  }

  return { questions, shortfalls };
}

/**
 * Picks `count` questions maximizing difficulty-weight spread. For the common
 * `count === 2` case this returns one question of the lightest weight present
 * and one of the heaviest, each chosen at random within its weight class. This
 * guarantees the intended 0/33/67/100 category resolution whenever the pillar
 * holds ≥ 2 distinct weights — regardless of how many of each it holds (a median
 * split would fail to pair core+advanced for an unbalanced pool).
 */
function pickWithWeightSpread(
  pool: readonly Question[],
  count: number,
  rng: () => number,
): Question[] {
  if (pool.length <= count) return shuffle(pool, rng);

  if (count === 2) {
    const weights = pool.map((q) => q.difficultyWeight);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);

    if (minWeight !== maxWeight) {
      const low = pickOne(
        pool.filter((q) => q.difficultyWeight === minWeight),
        rng,
      );
      const high = pickOne(
        pool.filter((q) => q.difficultyWeight === maxWeight),
        rng,
      );
      // Different weight classes → different questions; randomize display order.
      if (low && high) return shuffle([low, high], rng);
    }
    // Degenerate (all weights equal): fall back to a plain random pick.
    return shuffle(pool, rng).slice(0, 2);
  }

  return shuffle(pool, rng).slice(0, count);
}
