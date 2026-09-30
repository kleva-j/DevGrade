import { sql } from "drizzle-orm";

import type { QueryDb } from "./client";

import { SKILL_CATEGORY_META } from "@/domain/constants";
import { skillCategories, questions } from "./schema";
import { seedQuestions } from "./seedData";

/** Shared by the CLI and isolated PostgreSQL tests; never opens a connection. */
export async function seedContent(db: QueryDb) {
  const categoryRows = Object.entries(SKILL_CATEGORY_META).map(
    ([name, meta]) => ({
      name,
      displayName: meta.displayName,
      description: meta.description,
      pillarOrder: meta.order,
    }),
  );

  // Upsert categories so edits to SKILL_CATEGORY_META propagate on re-seed.
  await db
    .insert(skillCategories)
    .values(categoryRows)
    .onConflictDoUpdate({
      target: skillCategories.name,
      set: {
        displayName: sql`excluded.display_name`,
        description: sql`excluded.description`,
        pillarOrder: sql`excluded.pillar_order`,
      },
    });

  // Authored IDs are persisted verbatim, never derived from option positions.
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
        correctOptionId: sql`excluded.correct_answer`,
        explanation: sql`excluded.explanation`,
        difficultyWeight: sql`excluded.difficulty_weight`,
        source: sql`excluded.source`,
        isActive: sql`excluded.is_active`,
        updatedAt: new Date(),
      },
    });

  return { categories: categoryRows.length, questions: seedQuestions.length };
}
