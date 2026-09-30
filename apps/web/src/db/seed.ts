/**
 * Idempotent database seeder (Phase 0).
 *
 * Populates the two content tables that the assessment flow reads from:
 *   1. `skill_categories` — derived from `SKILL_CATEGORY_META` (single source of
 *      truth for pillar labels/order).
 *   2. `questions` — the starter React bank in `seedData.ts`.
 *
 * Safe to run repeatedly: categories and questions upsert on their primary keys
 * so edits to pillar metadata and `seedData.ts` are picked up on re-run.
 *
 * Run: `pnpm --filter web db:seed` (requires `DATABASE_URL`; see docker-compose).
 */

import { getDb } from "./client";
import { seedContent } from "./seedContent";

async function seed(): Promise<void> {
  const counts = await seedContent(getDb());
  console.log(
    `Seeded ${counts.categories} skill categories and ${counts.questions} questions.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
