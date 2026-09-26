import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { and, count, eq, inArray } from "drizzle-orm";

import type { Db } from "@/db/client";
import type { NewQuestion, QuestionRow } from "@/db/schema";
import type { SkillCategory } from "@/domain/constants";
import type { AnswerInput } from "@/domain/types";
import type { AssessmentService } from "@/server/assessmentService";

import * as tables from "@/db/schema";
import {
  DIFFICULTIES,
  DIFFICULTY,
  FRAMEWORK,
  FRAMEWORKS,
  PROFICIENCY,
  SESSION_STATUS,
  SESSION_VIEW,
  SKILL_CATEGORIES,
  SKILL_CATEGORY,
  SKILL_CATEGORY_META,
  WEIGHT_ADVANCED,
  WEIGHT_CORE,
} from "@/domain/constants";
import { createRng, seedFromString } from "@/domain/random";
import { stratifiedSample } from "@/domain/sampling";

import { AssessmentError, ERROR_CODE } from "@/server/errors";

import {
  invalidQuestionCounts,
  lengthCases,
} from "./__tests__/assessmentCases";
import { createPostgresFixture } from "./__tests__/postgresFixture";

const {
  questions,
  testSessions,
  sessionAnswers,
  sessionResults,
  sessionCategoryScores,
} = tables;
type CreatedSession = Awaited<ReturnType<AssessmentService["createSession"]>>;

/** Six active + two inactive per weight; unrelated levels/frameworks and off-class decoys. */
function questionFixtures(): NewQuestion[] {
  return FRAMEWORKS.flatMap((framework) =>
    DIFFICULTIES.flatMap((difficulty) =>
      SKILL_CATEGORIES.flatMap((skillCategory) =>
        [WEIGHT_CORE, WEIGHT_ADVANCED, 1.5, 3].flatMap((difficultyWeight) => {
          const isExactWeight = [WEIGHT_CORE, WEIGHT_ADVANCED].includes(
            difficultyWeight,
          );
          return Array.from({ length: isExactWeight ? 8 : 1 }, (_, index) => {
            const id = `test-${framework}-${difficulty}-${skillCategory}-${difficultyWeight}-${index}`;
            return {
              id,
              framework,
              difficulty,
              skillCategory,
              title: `Fixture ${id}`,
              prompt: `Choose an option for ${id}.`,
              codeBlock: index % 2 === 0 ? "const answer = 42;" : null,
              options: ["Option A", "Option B", "Option C", "Option D"],
              correctAnswer: index % 4,
              explanation: `Server-only explanation for ${id}`,
              difficultyWeight,
              isActive: index < 6,
            };
          });
        }),
      ),
    ),
  ).sort((a, b) => (a.id < b.id ? 1 : -1));
}

function expectAssessmentError(code: AssessmentError["code"]) {
  return (error: unknown) => {
    assert.ok(error instanceof AssessmentError);
    assert.equal(error.code, code);
    return true;
  };
}

async function sessionSnapshot(db: Db) {
  return db.select().from(testSessions).orderBy(testSessions.id);
}

async function assertCreatedSession(
  db: Db,
  created: CreatedSession,
  targetLevel: (typeof DIFFICULTIES)[number],
  expectation: (typeof lengthCases)[number],
) {
  const { questionCount, pairsPerPillar } = expectation;
  assert.equal(created.totalQuestions, questionCount);
  assert.equal(created.questions.length, questionCount);
  const publicIds = created.questions.map((question) => question.id);
  assert.equal(new Set(publicIds).size, questionCount);

  const [stored] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, created.sessionId));
  assert.ok(stored);
  assert.equal(stored.sessionToken, created.sessionToken);
  assert.equal(stored.framework, FRAMEWORK.REACT);
  assert.equal(stored.targetLevel, targetLevel);
  assert.equal(stored.status, SESSION_STATUS.IN_PROGRESS);
  assert.deepEqual(
    stored.selectedQuestionIds,
    publicIds,
    "persist the exact selected set in presentation order",
  );

  const selectedRows = await db
    .select()
    .from(questions)
    .where(inArray(questions.id, stored.selectedQuestionIds));
  assert.equal(selectedRows.length, questionCount);
  assert.deepEqual(
    new Set(selectedRows.map((row) => row.id)),
    new Set(publicIds),
  );
  const byId = new Map(selectedRows.map((row) => [row.id, row]));
  assert.ok(stored.questionSnapshot);
  assert.equal(stored.questionSnapshot.version, 1);
  assert.deepEqual(
    stored.questionSnapshot.questions.map((question) => question.id),
    publicIds,
  );
  for (const question of stored.questionSnapshot.questions) {
    const row = byId.get(question.id);
    assert.ok(row);
    assert.equal(question.correctAnswer, row.correctAnswer);
    assert.equal(question.explanation, row.explanation);
    assert.equal(question.difficultyWeight, row.difficultyWeight);
    assert.equal(question.source, row.source);
  }

  assert.deepEqual(Object.keys(created).sort(), [
    "acceptedAnswers",
    "accessExpiresAt",
    "answeredCount",
    "attemptExpiresAt",
    "blocksCreation",
    "canResume",
    "configuration",
    "createdAt",
    "effectiveStatus",
    "kind",
    "nextQuestionId",
    "questions",
    "sessionId",
    "sessionToken",
    "totalQuestions",
  ]);
  assert.equal(created.kind, SESSION_VIEW.ASSESSMENT);
  assert.equal(created.createdAt, stored.createdAt.toISOString());
  assert.deepEqual(created.configuration, {
    framework: FRAMEWORK.REACT,
    targetLevel,
    questionCount,
  });
  assert.equal(created.effectiveStatus, SESSION_STATUS.IN_PROGRESS);
  assert.equal(created.blocksCreation, true);
  assert.equal(created.canResume, true);
  assert.equal(created.answeredCount, 0);
  assert.equal(created.nextQuestionId, publicIds[0]);
  assert.deepEqual(created.acceptedAnswers, []);
  for (const question of created.questions) {
    const row = byId.get(question.id);
    assert.ok(row);
    assert.equal(row.framework, FRAMEWORK.REACT);
    assert.equal(row.difficulty, targetLevel);
    assert.equal(row.isActive, true);
    // Compare the entire projection, not only TypeScript's declared wire type.
    assert.deepEqual(question, {
      id: row.id,
      skillCategory: row.skillCategory,
      title: row.title,
      prompt: row.prompt,
      codeBlock: row.codeBlock,
      options: row.options,
    });
  }
  assert.doesNotMatch(
    JSON.stringify(created),
    /"(?:correctAnswer|correct_answer|explanation)"\s*:/,
  );

  for (const skillCategory of SKILL_CATEGORIES) {
    const pillar = selectedRows.filter(
      (row) => row.skillCategory === skillCategory,
    );
    assert.equal(pillar.length, pairsPerPillar * 2);
    for (const weight of [WEIGHT_CORE, WEIGHT_ADVANCED]) {
      assert.equal(
        pillar.filter((row) => row.difficultyWeight === weight).length,
        pairsPerPillar,
      );
    }
  }

  // The domain sampler is covered independently. Replaying its public contract
  // detects a service query lacking stable id ordering (fixtures are inserted backwards).
  const orderedPool = await db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.framework, FRAMEWORK.REACT),
        eq(questions.difficulty, targetLevel),
        eq(questions.isActive, true),
      ),
    )
    .orderBy(questions.id);
  const replay = stratifiedSample(
    orderedPool.map((row) => ({
      ...row,
      skillCategory: row.skillCategory as SkillCategory,
    })),
    questionCount,
    createRng(seedFromString(created.sessionToken)),
  );
  assert.deepEqual(replay.shortfalls, []);
  assert.deepEqual(
    publicIds,
    replay.questions.map((question) => question.id),
  );
  return { stored, byId };
}

function answerCorrectly(question: QuestionRow) {
  return (
    question.skillCategory === SKILL_CATEGORY.PERFORMANCE ||
    (question.skillCategory === SKILL_CATEGORY.REACTIVITY &&
      question.difficultyWeight === WEIGHT_ADVANCED) ||
    (question.skillCategory === SKILL_CATEGORY.LIFECYCLE &&
      question.difficultyWeight === WEIGHT_CORE)
  );
}

async function assertIncomplete(
  db: Db,
  service: AssessmentService,
  created: CreatedSession,
) {
  await assert.rejects(
    service.completeSession(created.sessionId, {
      sessionToken: created.sessionToken,
    }),
    expectAssessmentError(ERROR_CODE.BAD_REQUEST),
  );
  assert.deepEqual(
    await db
      .select()
      .from(sessionResults)
      .where(eq(sessionResults.sessionId, created.sessionId)),
    [],
  );
  assert.deepEqual(
    await db
      .select()
      .from(sessionCategoryScores)
      .where(eq(sessionCategoryScores.sessionId, created.sessionId)),
    [],
  );
  const [stored] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, created.sessionId));
  assert.ok(stored);
  assert.equal(stored.status, SESSION_STATUS.IN_PROGRESS);
  assert.equal(stored.completedAt, null);
}

async function answerAndComplete(
  db: Db,
  created: CreatedSession,
  targetLevel: (typeof DIFFICULTIES)[number],
  expectation: (typeof lengthCases)[number],
) {
  const { stored, byId } = await assertCreatedSession(
    db,
    created,
    targetLevel,
    expectation,
  );
  const { questionCount, pairsPerPillar, weightPerPillar } = expectation;
  const { createAssessmentService } =
    await import("@/server/assessmentService");
  // A fresh instance receives no selected length; only the persisted IDs govern
  // progress and completion. In particular, answer 8 must not finish 16 or 32.
  const service = createAssessmentService(db);
  const acceptedAnswers: AnswerInput[] = [];
  for (const [index, questionId] of stored.selectedQuestionIds.entries()) {
    if (index === 0 || index === 8 || index === questionCount - 1) {
      await assertIncomplete(db, service, created);
    }
    const row = byId.get(questionId);
    assert.ok(row);
    const selectedAnswer = answerCorrectly(row)
      ? row.correctAnswer
      : (row.correctAnswer + 1) % row.options.length;
    const response = await service.submitAnswer(created.sessionId, {
      sessionToken: created.sessionToken,
      questionId,
      selectedAnswer,
      timeSpentSeconds: index + 1,
    });
    acceptedAnswers.push({
      questionId,
      selectedAnswer,
      timeSpentSeconds: index + 1,
    });
    assert.deepEqual(response, {
      success: true,
      acceptedAnswers,
      sessionComplete: index === questionCount - 1,
      acceptedAnswer: {
        questionId,
        selectedAnswer,
        timeSpentSeconds: index + 1,
      },
      answeredCount: index + 1,
      totalQuestions: questionCount,
      nextQuestionId: stored.selectedQuestionIds[index + 1] ?? null,
    });
  }

  const answers = await db
    .select()
    .from(sessionAnswers)
    .where(eq(sessionAnswers.sessionId, created.sessionId));
  assert.equal(answers.length, questionCount);
  assert.deepEqual(
    new Set(answers.map((answer) => answer.questionId)),
    new Set(stored.selectedQuestionIds),
  );
  for (const answer of answers) {
    const row = byId.get(answer.questionId);
    assert.ok(row);
    assert.equal(
      answer.isCorrect,
      answerCorrectly(row),
      "correctness must be computed from the stored key",
    );
  }

  const view = await createAssessmentService(db).completeSession(
    created.sessionId,
    { sessionToken: created.sessionToken },
  );
  assert.equal(view.kind, SESSION_VIEW.REPORT);
  assert.equal(view.surveyRating, null);
  assert.equal(view.attemptExpiresAt, created.attemptExpiresAt);
  assert.equal(view.accessExpiresAt, created.accessExpiresAt);
  const result = view.reportSnapshot.result;
  // Advanced-only, core-only, all-correct, all-wrong pillars: equal pillar
  // contributions yield 50%, while their individual scores expose weighting.
  const expectedScores = [
    {
      skillCategory: SKILL_CATEGORY.REACTIVITY,
      correctWeight: pairsPerPillar * 2,
      scorePct: 66.67,
      proficiency: PROFICIENCY.DEVELOPING,
    },
    {
      skillCategory: SKILL_CATEGORY.LIFECYCLE,
      correctWeight: pairsPerPillar,
      scorePct: 33.33,
      proficiency: PROFICIENCY.SKILL_GAP,
    },
    {
      skillCategory: SKILL_CATEGORY.PERFORMANCE,
      correctWeight: weightPerPillar,
      scorePct: 100,
      proficiency: PROFICIENCY.PROFICIENT,
    },
    {
      skillCategory: SKILL_CATEGORY.ASYNC,
      correctWeight: 0,
      scorePct: 0,
      proficiency: PROFICIENCY.SKILL_GAP,
    },
  ].map((score) => ({ ...score, totalWeight: weightPerPillar }));
  assert.equal(result.sessionId, created.sessionId);
  assert.equal(result.framework, FRAMEWORK.REACT);
  assert.equal(result.targetLevel, targetLevel);
  assert.equal(result.totalScore, 50);
  assert.equal(result.maxScore, 100);
  assert.equal(result.proficiencyLevel, PROFICIENCY.DEVELOPING);
  assert.deepEqual(result.categoryScores, expectedScores);
  assert.deepEqual(result.skillGaps, [
    SKILL_CATEGORY.LIFECYCLE,
    SKILL_CATEGORY.ASYNC,
  ]);
  assert.equal(result.questionResults.length, questionCount);
  assert.deepEqual(
    result.questionResults.map((question) => question.questionId),
    stored.selectedQuestionIds,
  );
  for (const questionResult of result.questionResults) {
    const row = byId.get(questionResult.questionId);
    assert.ok(row);
    assert.deepEqual(questionResult, {
      questionId: row.id,
      isCorrect: answerCorrectly(row),
      explanation: row.explanation,
    });
  }

  const [completed] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, created.sessionId));
  assert.ok(completed);
  assert.equal(completed.status, SESSION_STATUS.COMPLETED);
  assert.ok(completed.completedAt instanceof Date);
  assert.deepEqual(completed.selectedQuestionIds, stored.selectedQuestionIds);
  const persistedResults = await db
    .select()
    .from(sessionResults)
    .where(eq(sessionResults.sessionId, created.sessionId));
  assert.equal(persistedResults.length, 1);
  const [persistedResult] = persistedResults;
  assert.ok(persistedResult);
  assert.ok(persistedResult.reportSnapshot);
  assert.ok(stored.questionSnapshot);
  assert.deepEqual(persistedResult.reportSnapshot, view.reportSnapshot);
  assert.deepEqual(persistedResult.reportSnapshot.questions, created.questions);
  assert.deepEqual(
    persistedResult.reportSnapshot.pillars,
    stored.questionSnapshot.pillars,
  );
  assert.equal(
    persistedResult.reportSnapshot.completedAt,
    completed.completedAt.toISOString(),
  );
  assert.deepEqual(persistedResult.createdAt, completed.completedAt);
  assert.deepEqual(completed.lastActivityAt, completed.completedAt);
  assert.equal(persistedResult.totalScore, 50);
  assert.equal(persistedResult.maxScore, 100);
  assert.equal(persistedResult.targetLevel, targetLevel);
  assert.equal(persistedResult.proficiencyLevel, PROFICIENCY.DEVELOPING);
  const persistedScores = await db
    .select()
    .from(sessionCategoryScores)
    .where(eq(sessionCategoryScores.sessionId, created.sessionId));
  assert.equal(persistedScores.length, 4);
  for (const expected of expectedScores) {
    const actual = persistedScores.find(
      (score) => score.skillCategory === expected.skillCategory,
    );
    assert.ok(actual);
    assert.equal(actual.correctWeight, expected.correctWeight);
    assert.equal(actual.totalWeight, expected.totalWeight);
    assert.equal(actual.proficiency, expected.proficiency);
    // PostgreSQL real is float32; the report is rounded to two decimal places.
    assert.ok(Math.abs(actual.scorePct - expected.scorePct) < 0.001);
  }
}

test(
  "assessment service question counts — isolated PostgreSQL",
  {
    skip:
      process.env.TEST_DATABASE_URL === undefined
        ? "Set TEST_DATABASE_URL explicitly to run PostgreSQL integration tests"
        : false,
    timeout: 180_000,
  },
  async (t) => {
    const { db } = await createPostgresFixture(t);
    const { createAssessmentService } =
      await import("@/server/assessmentService");
    await db.insert(tables.skillCategories).values(
      SKILL_CATEGORIES.map((name) => ({
        name,
        displayName: SKILL_CATEGORY_META[name].displayName,
        description: SKILL_CATEGORY_META[name].description,
        pillarOrder: SKILL_CATEGORY_META[name].order,
      })),
    );
    await db.insert(questions).values(questionFixtures());
    const service = createAssessmentService(db);

    for (const targetLevel of DIFFICULTIES) {
      for (const expectation of lengthCases) {
        await t.test(
          `${targetLevel}: ${expectation.questionCount} public questions, persisted order, last answer and weighted completion`,
          { timeout: 30_000 },
          async () => {
            const created = await service.createSession({
              framework: FRAMEWORK.REACT,
              targetLevel,
              questionCount: expectation.questionCount,
              rawClientId: randomUUID(),
            });
            await answerAndComplete(db, created, targetLevel, expectation);
          },
        );
      }
    }

    await t.test(
      "omitting questionCount creates and completes an 8-ID session",
      { timeout: 30_000 },
      async () => {
        const created = await service.createSession({
          framework: FRAMEWORK.REACT,
          targetLevel: DIFFICULTY.MID,
          rawClientId: randomUUID(),
        });
        await answerAndComplete(db, created, DIFFICULTY.MID, lengthCases[0]);
      },
    );

    await t.test(
      "invalid counts fail with bad_request and create no session",
      { timeout: 15_000 },
      async () => {
        const before = await sessionSnapshot(db);
        for (const { label, value } of invalidQuestionCounts) {
          // Simulate untyped callers bypassing the server-function validator.
          const input = {
            framework: FRAMEWORK.REACT,
            targetLevel: DIFFICULTY.MID,
            questionCount: value as number,
            rawClientId: randomUUID(),
          };
          await assert.rejects(
            service.createSession(input),
            expectAssessmentError(ERROR_CODE.BAD_REQUEST),
            label,
          );
          assert.deepEqual(await sessionSnapshot(db), before, label);
        }
      },
    );

    for (const expectation of lengthCases) {
      for (const skillCategory of SKILL_CATEGORIES) {
        for (const difficultyWeight of [WEIGHT_CORE, WEIGHT_ADVANCED]) {
          await t.test(
            `${expectation.questionCount}: ${skillCategory} weight ${difficultyWeight} shortfall fails despite sufficient total active questions`,
            { timeout: 15_000 },
            async () => {
              const activePool = and(
                eq(questions.framework, FRAMEWORK.REACT),
                eq(questions.difficulty, DIFFICULTY.MID),
                eq(questions.isActive, true),
              );
              const bucket = and(
                activePool,
                eq(questions.skillCategory, skillCategory),
                eq(questions.difficultyWeight, difficultyWeight),
              );
              const available = await db
                .select({ id: questions.id })
                .from(questions)
                .where(bucket)
                .orderBy(questions.id);
              assert.equal(available.length, 6);
              const disabledIds = available
                .slice(expectation.pairsPerPillar - 1)
                .map((row) => row.id);
              const before = await sessionSnapshot(db);
              try {
                await db
                  .update(questions)
                  .set({ isActive: false })
                  .where(inArray(questions.id, disabledIds));
                const [activeTotal] = await db
                  .select({ total: count() })
                  .from(questions)
                  .where(activePool);
                assert.ok(
                  activeTotal && activeTotal.total >= expectation.questionCount,
                );
                const [pillarTotal] = await db
                  .select({ total: count() })
                  .from(questions)
                  .where(
                    and(activePool, eq(questions.skillCategory, skillCategory)),
                  );
                assert.ok(
                  pillarTotal &&
                    pillarTotal.total >= expectation.pairsPerPillar * 2,
                );
                const [remaining] = await db
                  .select({ total: count() })
                  .from(questions)
                  .where(bucket);
                assert.equal(remaining?.total, expectation.pairsPerPillar - 1);
                await assert.rejects(
                  service.createSession({
                    framework: FRAMEWORK.REACT,
                    targetLevel: DIFFICULTY.MID,
                    questionCount: expectation.questionCount,
                    rawClientId: randomUUID(),
                  }),
                  expectAssessmentError(ERROR_CODE.INSUFFICIENT_QUESTIONS),
                );
                assert.deepEqual(
                  await sessionSnapshot(db),
                  before,
                  "a shortfall must not leave any session behind",
                );
              } finally {
                await db
                  .update(questions)
                  .set({ isActive: true })
                  .where(inArray(questions.id, disabledIds));
              }
            },
          );
        }
      }
    }
  },
);
