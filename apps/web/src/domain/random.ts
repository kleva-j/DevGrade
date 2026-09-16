/**
 * Deterministic PRNG utilities.
 *
 * Sampling accepts a seeded rng so a given (framework, level, seed) produces a
 * reproducible question set. This is what makes "deterministic" defensible in
 * the PRD and lets two candidates at the same level be given comparable sets
 * when desired, while still randomizing across the pool for anti-leakage.
 */

/** mulberry32: small, fast, good-enough 32-bit PRNG. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a string hash, used to derive a numeric seed from a session token. */
export function seedFromString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Fisher–Yates shuffle using the supplied rng (pure; does not mutate input). */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Pick one element uniformly at random, or `undefined` if empty. */
export function pickOne<T>(
  items: readonly T[],
  rng: () => number
): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(rng() * items.length)]
}
