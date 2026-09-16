/**
 * Shared domain constants for the DevGrade assessment engine.
 *
 * These are the single source of truth for the four competency pillars,
 * frameworks, difficulty tiers, session statuses, and the scoring configuration.
 *
 * Each domain enum is expressed once as a named-constant object (e.g. `PROFICIENCY`)
 * so call sites never repeat the raw string (`"skill_gap"`, `"in_progress"`, ...).
 * The `*_VALUES` arrays and union types are derived from those objects, and the
 * database `pgEnum`s and Zod validators are derived from the arrays, so the
 * literals, the type system, and the schema can never drift.
 */

function values<T extends Record<string, string>>(obj: T) {
  return Object.values(obj) as [T[keyof T], ...T[keyof T][]];
}

export const FRAMEWORK = {
  REACT: "react",
  VUE: "vue",
  ANGULAR: "angular",
} as const;
export const FRAMEWORKS = values(FRAMEWORK);
export type Framework = (typeof FRAMEWORKS)[number];

/** MVP ships React only; Vue/Angular are enabled in a later phase. */
export const MVP_FRAMEWORKS: readonly Framework[] = [FRAMEWORK.REACT];

export const DIFFICULTY = {
  JUNIOR: "junior",
  MID: "mid",
  SENIOR: "senior",
} as const;
export const DIFFICULTIES = values(DIFFICULTY);
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The four competency pillars. Order here is the default report order. */
export const SKILL_CATEGORY = {
  REACTIVITY: "reactivity",
  LIFECYCLE: "lifecycle",
  PERFORMANCE: "performance",
  ASYNC: "async",
} as const;
export const SKILL_CATEGORIES = values(SKILL_CATEGORY);
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/**
 * Human-facing metadata for each pillar — the single source of truth for the
 * `skill_categories` seed rows and the report UI (pillar labels + descriptions).
 * `order` sets both the DB `pillar_order` and the default report/radar order.
 */
export const SKILL_CATEGORY_META: Record<
  SkillCategory,
  { displayName: string; description: string; order: number }
> = {
  [SKILL_CATEGORY.REACTIVITY]: {
    displayName: "Reactivity & State",
    description:
      "State modeling, derived state, and how updates propagate through the UI.",
    order: 1,
  },
  [SKILL_CATEGORY.LIFECYCLE]: {
    displayName: "Lifecycle & Effects",
    description:
      "Component mounting/updating, effects, cleanup, and dependency handling.",
    order: 2,
  },
  [SKILL_CATEGORY.PERFORMANCE]: {
    displayName: "Performance & Optimization",
    description:
      "Rendering cost, memoization, and avoiding unnecessary work at scale.",
    order: 3,
  },
  [SKILL_CATEGORY.ASYNC]: {
    displayName: "Async & Data",
    description:
      "Data fetching, race conditions, and coordinating asynchronous work.",
    order: 4,
  },
};

/**
 * Provenance of a question's content, tracked per row for licensing and
 * attribution hygiene (see PRD §10.1 "Content sourcing & licensing").
 *
 * `ORIGINAL` items are authored for DevGrade. The others are paraphrased/adapted
 * from the referenced public, permissively-licensed banks and therefore require
 * attribution in `NOTICE` and the report footer. Stored as a plain string column
 * (not a `pgEnum`) so adding a new reference never needs a migration.
 */
export const CONTENT_SOURCE = {
  ORIGINAL: "original",
  SUDHEERJ_REACT: "sudheerj/reactjs-interview-questions",
  LYDIAHALLIE_JS: "lydiahallie/javascript-questions",
} as const;
export const CONTENT_SOURCES = values(CONTENT_SOURCE);
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const PROFICIENCY = {
  PROFICIENT: "proficient",
  DEVELOPING: "developing",
  SKILL_GAP: "skill_gap",
} as const;
export const PROFICIENCY_LEVELS = values(PROFICIENCY);
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

export const SESSION_STATUS = {
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
} as const;
export const SESSION_STATUSES = values(SESSION_STATUS);
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Score granularity (open decision #3).
 *
 * Each pillar draws exactly two questions with distinct difficulty weights:
 * a "core" item (1.0) and an "advanced" item (2.0). Weighted category scores
 * therefore resolve to 0 / 33.33 / 66.67 / 100 rather than the coarse
 * 0 / 50 / 100 you get from two equally weighted questions. This gives the
 * "Developing" band real values (66.67) instead of collapsing it to 50.
 */
export const QUESTIONS_PER_PILLAR = 2;
export const TOTAL_QUESTIONS = SKILL_CATEGORIES.length * QUESTIONS_PER_PILLAR; // 8
export const WEIGHT_CORE = 1.0;
export const WEIGHT_ADVANCED = 2.0;

/** Proficiency tier thresholds, in percent. Level-relative (see report context). */
export const PROFICIENCY_THRESHOLDS = {
  [PROFICIENCY.PROFICIENT]: 80,
  [PROFICIENCY.DEVELOPING]: 50,
} as const;

/** Anti-abuse limit, keyed on the anonymous client id (not IP; avoids NAT issues). */
export const MAX_SESSIONS_PER_HOUR = 5;

/** Trailing window (minutes) over which `MAX_SESSIONS_PER_HOUR` is counted. */
export const RATE_LIMIT_WINDOW_MINUTES = 60;

/** In-progress sessions idle longer than this are swept to `abandoned`. */
export const ABANDON_AFTER_MINUTES = 30;

/**
 * Post-assessment satisfaction survey (§3 "User Assessment Satisfaction" KPI).
 * One question — "How helpful was this assessment?" — on a 1..5 scale. These
 * bounds are the single source of truth for the Zod validators, the machine, and
 * the rating control in the report UI.
 */
export const SURVEY_RATING_MIN = 1;
export const SURVEY_RATING_MAX = 5;
