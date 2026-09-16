/**
 * Idempotent database seeder (Phase 0).
 *
 * Populates the two content tables that the assessment flow reads from:
 *   1. `skill_categories` — derived from `SKILL_CATEGORY_META` (single source of
 *      truth for pillar labels/order).
 *   2. `questions` — the starter React bank in `seedData.ts`.
 *
 * Safe to run repeatedly: categories use `onConflictDoNothing`, and questions
 * upsert on their primary key so edits to `seedData.ts` are picked up on re-run.
 *
 * Run: `pnpm --filter web db:seed` (requires `DATABASE_URL`; see docker-compose).
 */

import { sql } from "drizzle-orm"

import { SKILL_CATEGORY_META } from "../domain/constants"
import { skillCategories, questions } from "./schema"
import { seedQuestions } from "./seedData"
import { getDb } from "./client"

async function seed(): Promise<void> {
  const db = getDb()

  const categoryRows = Object.entries(SKILL_CATEGORY_META).map(
    ([name, meta]) => ({
      name,
      displayName: meta.displayName,
      description: meta.description,
      pillarOrder: meta.order,
    })
  )

  await db.insert(skillCategories).values(categoryRows).onConflictDoNothing()

  // Upsert questions so re-seeding applies content edits without duplicating.
  await db
    .insert(questions)
    .values(seedQuestions)
    .onConflictDoUpdate({
      target: questions.id,
      set: {
        framework: sql`excluded.framework`,
        difficulty: sql`excluded.difficulty`,
        skillCategory: sql`excluded.skill_category`,
        title: sql`excluded.title`,
        prompt: sql`excluded.prompt`,
        codeBlock: sql`excluded.code_block`,
        options: sql`excluded.options`,
        correctAnswer: sql`excluded.correct_answer`,
        explanation: sql`excluded.explanation`,
        difficultyWeight: sql`excluded.difficulty_weight`,
        source: sql`excluded.source`,
        isActive: sql`excluded.is_active`,
        updatedAt: new Date(),
      },
    })

  console.log(
    `Seeded ${categoryRows.length} skill categories and ${seedQuestions.length} questions.`
  )
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
