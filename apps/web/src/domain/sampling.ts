import type { SkillCategory } from "./constants"
import type { Question } from "./types"

import { QUESTIONS_PER_PILLAR, SKILL_CATEGORIES } from "./constants"
import { pickOne, shuffle } from "./random"

export interface Shortfall {
  skillCategory: SkillCategory
  needed: number
  available: number
}

export interface SamplingResult {
  questions: Question[]
  /** Pillars that could not supply the full quota (US-6 "handle gracefully"). */
  shortfalls: Shortfall[]
}

/**
 * Stratified sampling across the four competency pillars.
 *
 * For each pillar we pick `QUESTIONS_PER_PILLAR` questions. To realize the
 * score-granularity decision (#3) we deliberately spread the pick across the
 * difficulty-weight range: one question from the lighter half ("core") and one
 * from the heavier half ("advanced"). Selection *within* each half is random,
 * preserving pool diversity for anti-leakage.
 *
 * Pass a seeded `rng` (see `createRng`) for reproducible sessions.
 */
export function stratifiedSample(
  pool: readonly Question[],
  rng: () => number = Math.random
): SamplingResult {
  const byCategory = new Map<SkillCategory, Question[]>()
  for (const q of pool) {
    const bucket = byCategory.get(q.skillCategory)
    if (bucket) bucket.push(q)
    else byCategory.set(q.skillCategory, [q])
  }

  const questions: Question[] = []
  const shortfalls: Shortfall[] = []

  for (const category of SKILL_CATEGORIES) {
    const available = byCategory.get(category) ?? []
    const picked = pickWithWeightSpread(available, QUESTIONS_PER_PILLAR, rng)
    if (picked.length < QUESTIONS_PER_PILLAR) {
      shortfalls.push({
        skillCategory: category,
        needed: QUESTIONS_PER_PILLAR,
        available: available.length,
      })
    }
    questions.push(...picked)
  }

  return { questions, shortfalls }
}

/**
 * Picks `count` questions maximizing difficulty-weight spread. For the common
 * `count === 2` case this returns one lighter-weight and one heavier-weight
 * question (chosen at random within each half), guaranteeing the intended
 * 0/33/67/100 category resolution whenever the pillar holds ≥2 distinct weights.
 */
function pickWithWeightSpread(
  pool: readonly Question[],
  count: number,
  rng: () => number
): Question[] {
  if (pool.length <= count) return shuffle(pool, rng)

  if (count === 2) {
    const sorted = [...pool].sort(
      (a, b) => a.difficultyWeight - b.difficultyWeight
    )
    const mid = Math.floor(sorted.length / 2)
    const lower = sorted.slice(0, mid)
    const upper = sorted.slice(mid)
    const low = pickOne(lower, rng)
    const high = pickOne(upper, rng)
    if (low && high && low.id !== high.id) return [low, high]
    // Degenerate (all equal / tiny pool): fall back to a plain random pick.
    return shuffle(pool, rng).slice(0, 2)
  }

  return shuffle(pool, rng).slice(0, count)
}
