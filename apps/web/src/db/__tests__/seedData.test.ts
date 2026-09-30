import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_LENGTHS,
  QUESTION_OPTION_COUNT,
  OPTION_ID_MAX,
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

function authoredCorrectPosition(q: (typeof seedQuestions)[number]) {
  const position = q.options.findIndex(({ id }) => id === q.correctOptionId);
  assert.notEqual(position, -1, `${q.id}: correct option ID missing`);
  return position;
}

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

      assert.equal(
        q.options.length,
        QUESTION_OPTION_COUNT,
        `${q.id}: option count`,
      );
      assert.equal(
        new Set(q.options.map(({ id }) => id)).size,
        QUESTION_OPTION_COUNT,
        `${q.id}: duplicate option ID`,
      );
      assert.ok(
        q.options.every(
          ({ id, text }) =>
            Number.isInteger(id) &&
            id >= 0 &&
            id <= OPTION_ID_MAX &&
            text.trim().length > 0,
        ),
        `${q.id}: invalid option ID or blank text`,
      );
      authoredCorrectPosition(q);

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

  test("correct-answer positions are balanced by level, pillar, and weight", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const skillCategory of [undefined, ...SKILL_CATEGORIES]) {
        for (const weight of [undefined, WEIGHT_CORE, WEIGHT_ADVANCED]) {
          const group = seedQuestions.filter(
            (q) =>
              q.difficulty === difficulty &&
              (skillCategory === undefined ||
                q.skillCategory === skillCategory) &&
              (weight === undefined || q.difficultyWeight === weight),
          );
          const counts = Array.from(
            { length: QUESTION_OPTION_COUNT },
            (_, index) =>
              group.filter((q) => authoredCorrectPosition(q) === index).length,
          );

          // Six-item weight pools cannot divide evenly across four positions.
          assert.ok(
            Math.max(...counts) - Math.min(...counts) <= 1,
            `${difficulty}/${skillCategory ?? "all pillars"}/${weight ?? "all weights"}: answer-position counts ${counts.join(", ")}`,
          );
        }
      }
    }
  });

  test("answer balance counts authored positions, not noncontiguous option IDs", () => {
    const q = seedQuestions[0]!;
    const reordered = {
      ...q,
      options: [
        { id: 100, text: "First" },
        { id: 0, text: "Second" },
        { id: OPTION_ID_MAX, text: "Third" },
        { id: 7, text: "Fourth" },
      ],
      correctOptionId: OPTION_ID_MAX,
    };
    assert.equal(authoredCorrectPosition(reordered), 2);
    assert.equal(
      authoredCorrectPosition({
        ...reordered,
        options: [...reordered.options].reverse(),
      }),
      1,
    );
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
