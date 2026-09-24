import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_LENGTHS,
  MIN_ADVANCED_PER_BUCKET,
  MIN_CORE_PER_BUCKET,
  WEIGHT_ADVANCED,
  SKILL_CATEGORIES,
  CONTENT_SOURCES,
  DIFFICULTIES,
  WEIGHT_CORE,
  FRAMEWORK,
} from "@/domain/constants";
import { seedQuestions } from "@/db/seedData";

const OPTION_COUNT = 4;

/**
 * Id convention: `react-{level}-{pillar}-{core|adv}` with an optional two-digit
 * suffix for additional items in the same bucket (`-02`, `-03`, ...). Built from
 * the domain enums so the pattern can't drift from the real level/pillar values.
 */
const ID_PATTERN = new RegExp(
  `^(${FRAMEWORK.REACT})-(${DIFFICULTIES.join("|")})-(${SKILL_CATEGORIES.join(
    "|",
  )})-(core|adv)(-\\d{2})?$`,
);

const bucketKey = (difficulty: string, skillCategory: string) =>
  `${difficulty}::${skillCategory}`;

describe("seedQuestions bank integrity", () => {
  test("ids are unique", () => {
    const seen = new Set<string>();
    for (const q of seedQuestions) {
      assert.ok(!seen.has(q.id), `duplicate id: ${q.id}`);
      seen.add(q.id);
    }
  });

  test("every row is well-formed", () => {
    for (const q of seedQuestions) {
      assert.match(q.id, ID_PATTERN, `id off-convention: ${q.id}`);

      // Id must agree with the row's own difficulty/pillar fields (catches
      // copy-paste drift where the id says one thing and the columns another).
      const [, , level, pillar] = ID_PATTERN.exec(q.id)!;
      assert.equal(q.difficulty, level, `${q.id}: id level vs difficulty`);
      assert.equal(q.skillCategory, pillar, `${q.id}: id pillar vs category`);

      assert.equal(q.framework, FRAMEWORK.REACT, `${q.id}: framework`);
      assert.ok(q.title.trim().length > 0, `${q.id}: empty title`);
      assert.ok(q.prompt.trim().length > 0, `${q.id}: empty prompt`);
      assert.ok(q.explanation.trim().length > 0, `${q.id}: empty explanation`);

      assert.equal(q.options.length, OPTION_COUNT, `${q.id}: option count`);
      assert.ok(
        q.options.every((o) => o.trim().length > 0),
        `${q.id}: blank option`,
      );
      assert.ok(
        Number.isInteger(q.correctAnswer) &&
          q.correctAnswer >= 0 &&
          q.correctAnswer < q.options.length,
        `${q.id}: correctAnswer out of range`,
      );

      assert.ok(
        q.difficultyWeight === WEIGHT_CORE ||
          q.difficultyWeight === WEIGHT_ADVANCED,
        `${q.id}: weight must be core (${WEIGHT_CORE}) or advanced (${WEIGHT_ADVANCED})`,
      );

      assert.ok(
        CONTENT_SOURCES.includes(q.source as (typeof CONTENT_SOURCES)[number]),
        `${q.id}: unknown source ${q.source}`,
      );
    }
  });

  test("seed depth leaves a reserve beyond every preset quota", () => {
    for (const count of ASSESSMENT_LENGTHS) {
      const quota = count / (SKILL_CATEGORIES.length * 2);
      assert.ok(Number.isInteger(quota));
      assert.ok(MIN_CORE_PER_BUCKET > quota);
      assert.ok(MIN_ADVANCED_PER_BUCKET > quota);
    }
  });

  test("every (level \u00d7 pillar) bucket meets the minimum pool depth", () => {
    const core = new Map<string, number>();
    const advanced = new Map<string, number>();

    for (const q of seedQuestions) {
      if (q.framework !== FRAMEWORK.REACT) continue;
      const key = bucketKey(q.difficulty, q.skillCategory);
      const target = q.difficultyWeight === WEIGHT_CORE ? core : advanced;
      target.set(key, (target.get(key) ?? 0) + 1);
    }

    for (const difficulty of DIFFICULTIES) {
      for (const skillCategory of SKILL_CATEGORIES) {
        const key = bucketKey(difficulty, skillCategory);
        assert.ok(
          (core.get(key) ?? 0) >= MIN_CORE_PER_BUCKET,
          `${key}: needs >= ${MIN_CORE_PER_BUCKET} core, has ${core.get(key) ?? 0}`,
        );
        assert.ok(
          (advanced.get(key) ?? 0) >= MIN_ADVANCED_PER_BUCKET,
          `${key}: needs >= ${MIN_ADVANCED_PER_BUCKET} advanced, has ${advanced.get(key) ?? 0}`,
        );
      }
    }
  });
});
