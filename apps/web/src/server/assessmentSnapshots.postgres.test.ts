import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { eq, sql } from "drizzle-orm";

import type { TestContext } from "node:test";
import type { NewQuestion } from "@/db/schema";
import type { SnapshotQuestion } from "@/domain/sessionSnapshots";

import {
  CONTENT_SOURCE,
  DIFFICULTY,
  FRAMEWORK,
  PROFICIENCY,
  SESSION_STATUS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY,
  WEIGHT_ADVANCED,
  WEIGHT_CORE,
} from "@/domain/constants";
import { parseReportSnapshot } from "@/domain/sessionSnapshots";
import { toPublicQuestion } from "@/domain/types";
import {
  questions,
  sessionAnswers,
  sessionCategoryScores,
  sessionResults,
  skillCategories,
  testSessions,
} from "@/db/schema";
import { createAssessmentService } from "./assessmentService";
import { AssessmentError, ERROR_CODE } from "./errors";
import { createPostgresFixture } from "./__tests__/postgresFixture";

const options = {
  skip:
    process.env.TEST_DATABASE_URL === undefined
      ? "Set TEST_DATABASE_URL explicitly to run PostgreSQL integration tests"
      : false,
  timeout: 30_000,
};

async function setup(t: TestContext) {
  const { db } = await createPostgresFixture(t);
  await db.insert(skillCategories).values(
    SKILL_CATEGORIES.map((name, index) => ({
      name,
      displayName: `Saved label ${name}`,
      description: `Saved guidance ${name}`,
      pillarOrder: index + 1,
    })),
  );
  const bank: NewQuestion[] = SKILL_CATEGORIES.flatMap((skillCategory) =>
    [WEIGHT_CORE, WEIGHT_ADVANCED].map((difficultyWeight) => ({
      id: `${skillCategory}-${difficultyWeight}`,
      framework: FRAMEWORK.REACT,
      difficulty: DIFFICULTY.MID,
      skillCategory,
      title: `Original ${skillCategory}-${difficultyWeight}`,
      prompt: "Original prompt",
      codeBlock: "const original = true;",
      options: ["Original A", "Original B", "Original C"],
      correctAnswer: 2,
      explanation: `Original explanation ${skillCategory}-${difficultyWeight}`,
      difficultyWeight,
      source: CONTENT_SOURCE.SUDHEERJ_REACT,
    })),
  );
  await db.insert(questions).values([...bank].reverse());
  const service = createAssessmentService(db);
  const created = await service.createSession({
    framework: FRAMEWORK.REACT,
    targetLevel: DIFFICULTY.MID,
    rawClientId: randomUUID(),
  });
  const [session] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, created.sessionId));
  assert.ok(session?.questionSnapshot);
  return { db, service, created, session };
}

function expectError(code: AssessmentError["code"]) {
  return (error: unknown) => {
    assert.ok(error instanceof AssessmentError);
    assert.equal(error.code, code);
    return true;
  };
}

test(
  "snapshots preserve grading, ordered presentation, provenance and pillar guidance across live bank edits",
  options,
  async (t) => {
    const { db, service, created, session } = await setup(t);
    const snapshot = session.questionSnapshot;
    assert.ok(snapshot);
    const original = structuredClone(snapshot);
    assert.deepEqual(
      snapshot.questions.map((q) => q.id),
      session.selectedQuestionIds,
    );
    assert.deepEqual(
      created.questions,
      snapshot.questions.map(toPublicQuestion),
    );
    assert.ok(
      snapshot.questions.every(
        (q) => q.source === CONTENT_SOURCE.SUDHEERJ_REACT,
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(created),
      /"(?:questionSnapshot|correctAnswer|explanation|difficultyWeight|source)"\s*:/,
    );

    // Identities remain for FK integrity; everything used to present/grade changes.
    await db.update(questions).set({
      framework: FRAMEWORK.VUE,
      difficulty: DIFFICULTY.SENIOR,
      skillCategory: SKILL_CATEGORY.ASYNC,
      correctAnswer: 0,
      difficultyWeight: 999,
      title: "Replacement title",
      prompt: "Replacement prompt",
      codeBlock: null,
      options: ["Only live option"],
      explanation: "Replacement explanation",
      source: CONTENT_SOURCE.ORIGINAL,
      isActive: false,
    });
    await db.update(skillCategories).set({
      displayName: "Replacement label",
      description: "Replacement guidance",
      pillarOrder: 99,
    });

    await assert.rejects(
      service.submitAnswer(created.sessionId, {
        sessionToken: created.sessionToken,
        questionId: created.questions[0]!.id,
        selectedAnswer: 3,
        timeSpentSeconds: 1,
      }),
      expectError(ERROR_CODE.BAD_REQUEST),
    );

    for (const [index, question] of [...snapshot.questions]
      .reverse()
      .entries()) {
      const accepted = await service.submitAnswer(created.sessionId, {
        sessionToken: created.sessionToken,
        questionId: question.id,
        selectedAnswer: question.difficultyWeight === WEIGHT_CORE ? 0 : 2,
        timeSpentSeconds: index + 1,
      });
      assert.deepEqual(accepted, {
        success: true,
        sessionComplete: index === snapshot.questions.length - 1,
        acceptedAnswer: {
          questionId: question.id,
          selectedAnswer: question.difficultyWeight === WEIGHT_CORE ? 0 : 2,
          timeSpentSeconds: index + 1,
        },
        answeredCount: index + 1,
        totalQuestions: snapshot.questions.length,
        nextQuestionId:
          index === snapshot.questions.length - 1
            ? null
            : snapshot.questions[0]!.id,
      });
      assert.doesNotMatch(
        JSON.stringify(accepted),
        /"(?:correctAnswer|isCorrect|explanation)"\s*:/,
      );
    }
    const answers = await db
      .select()
      .from(sessionAnswers)
      .where(eq(sessionAnswers.sessionId, created.sessionId));
    assert.equal(answers.length, 8);
    for (const answer of answers) {
      const question: SnapshotQuestion | undefined = snapshot.questions.find(
        (q) => q.id === answer.questionId,
      );
      assert.ok(question);
      assert.equal(
        answer.isCorrect,
        question.difficultyWeight === WEIGHT_ADVANCED,
      );
    }
    const result = await createAssessmentService(db).completeSession(
      created.sessionId,
      { sessionToken: created.sessionToken },
    );
    assert.equal(result.totalScore, 66.67);
    assert.equal(result.proficiencyLevel, PROFICIENCY.DEVELOPING);
    assert.deepEqual(
      result.questionResults,
      snapshot.questions.map((q) => ({
        questionId: q.id,
        isCorrect: q.difficultyWeight === WEIGHT_ADVANCED,
        explanation: q.explanation,
      })),
    );
    assert.deepEqual(
      result.categoryScores,
      SKILL_CATEGORIES.map((skillCategory) => ({
        skillCategory,
        correctWeight: 2,
        totalWeight: 3,
        scorePct: 66.67,
        proficiency: PROFICIENCY.DEVELOPING,
      })),
    );

    const [storedResult] = await db
      .select()
      .from(sessionResults)
      .where(eq(sessionResults.sessionId, created.sessionId));
    const [completed] = await db
      .select()
      .from(testSessions)
      .where(eq(testSessions.id, created.sessionId));
    assert.ok(storedResult?.reportSnapshot);
    assert.ok(completed?.completedAt);
    const report = parseReportSnapshot(storedResult.reportSnapshot);
    assert.deepEqual(report.result, result);
    assert.deepEqual(report.questions, created.questions);
    assert.deepEqual(report.pillars, original.pillars);
    assert.equal(report.completedAt, completed.completedAt.toISOString());
    assert.deepEqual(storedResult.createdAt, completed.completedAt);
    assert.deepEqual(completed.lastActivityAt, completed.completedAt);
    assert.deepEqual(completed.createdAt, session.createdAt);
    assert.deepEqual(completed.questionSnapshot, original);
    assert.equal(storedResult.targetLevel, result.targetLevel);
    assert.ok(Math.abs(storedResult.totalScore - result.totalScore) < 0.001);
    assert.equal(storedResult.maxScore, result.maxScore);
    assert.equal(storedResult.proficiencyLevel, result.proficiencyLevel);
    const scores = await db
      .select()
      .from(sessionCategoryScores)
      .where(eq(sessionCategoryScores.sessionId, created.sessionId));
    assert.equal(scores.length, result.categoryScores.length);
    for (const expected of result.categoryScores) {
      const actual = scores.find(
        (s) => s.skillCategory === expected.skillCategory,
      )!;
      assert.equal(actual.correctWeight, expected.correctWeight);
      assert.equal(actual.totalWeight, expected.totalWeight);
      assert.equal(actual.proficiency, expected.proficiency);
      assert.ok(Math.abs(actual.scorePct - expected.scorePct) < 0.001);
    }
    assert.doesNotMatch(
      JSON.stringify(report),
      /"(?:sessionToken|clientId|correctAnswer|questionSnapshot|difficultyWeight|source)"\s*:/,
    );
    assert.ok(
      report.result.questionResults.every((q) =>
        q.explanation.startsWith("Original"),
      ),
    );

    await db.update(questions).set({
      title: "Post-completion edit",
      explanation: "Post-completion explanation",
    });
    await db
      .update(skillCategories)
      .set({ displayName: "Post-completion label" });
    const [reread] = await db
      .select()
      .from(sessionResults)
      .where(eq(sessionResults.sessionId, created.sessionId));
    assert.deepEqual(parseReportSnapshot(reread!.reportSnapshot), report);
  },
);

test(
  "legacy/malformed snapshots never grade from live content or invent backfills",
  options,
  async (t) => {
    const { db, service, created, session } = await setup(t);
    assert.ok(session.questionSnapshot);
    const createdAt = new Date(Date.now() - 60 * 60_000);
    const lastActivityAt = new Date(createdAt.getTime() + 10 * 60_000);
    await db
      .update(testSessions)
      .set({ createdAt, lastActivityAt, questionSnapshot: null })
      .where(eq(testSessions.id, created.sessionId));
    const input = {
      sessionToken: created.sessionToken,
      questionId: created.questions[0]!.id,
      selectedAnswer: 2,
      timeSpentSeconds: 1,
    };
    await assert.rejects(
      service.submitAnswer(created.sessionId, {
        ...input,
        sessionToken: "f".repeat(64),
      }),
      expectError(ERROR_CODE.NOT_FOUND),
    );
    await assert.rejects(
      service.submitAnswer(created.sessionId, input),
      expectError(ERROR_CODE.LEGACY_UNRESTORABLE),
    );
    assert.deepEqual(await db.select().from(sessionAnswers), []);

    // Legacy completion must fail even if every old answer has been persisted.
    await db.insert(sessionAnswers).values(
      session.selectedQuestionIds.map((questionId) => ({
        sessionId: created.sessionId,
        questionId,
        selectedAnswer: 2,
        isCorrect: true,
        timeSpentSeconds: 1,
      })),
    );
    const invalidSnapshots = [
      null,
      { ...session.questionSnapshot, version: 2 },
      {
        ...session.questionSnapshot,
        questions: [...session.questionSnapshot.questions].reverse(),
      },
      {
        ...session.questionSnapshot,
        questions: session.questionSnapshot.questions.slice(1),
      },
    ];
    for (const value of invalidSnapshots) {
      await db
        .update(testSessions)
        .set({
          questionSnapshot:
            value === null ? null : sql`${JSON.stringify(value)}::jsonb`,
        })
        .where(eq(testSessions.id, created.sessionId));
      const [before] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, created.sessionId));
      await assert.rejects(
        service.submitAnswer(created.sessionId, input),
        expectError(
          value === null
            ? ERROR_CODE.LEGACY_UNRESTORABLE
            : ERROR_CODE.SNAPSHOT_UNAVAILABLE,
        ),
      );
      await assert.rejects(
        service.completeSession(created.sessionId, {
          sessionToken: created.sessionToken,
        }),
        expectError(
          value === null
            ? ERROR_CODE.LEGACY_UNRESTORABLE
            : ERROR_CODE.SNAPSHOT_UNAVAILABLE,
        ),
      );
      const [after] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, created.sessionId));
      assert.deepEqual(after, before);
      assert.deepEqual(after!.createdAt, createdAt);
      assert.deepEqual(after!.lastActivityAt, lastActivityAt);
      assert.deepEqual(await db.select().from(sessionResults), []);
      assert.deepEqual(await db.select().from(sessionCategoryScores), []);
    }
  },
);

test(
  "report JSON, normalized scores and completion status roll back together",
  options,
  async (t) => {
    const { db, service, created, session } = await setup(t);
    for (const questionId of session.selectedQuestionIds) {
      await service.submitAnswer(created.sessionId, {
        sessionToken: created.sessionToken,
        questionId,
        selectedAnswer: 2,
        timeSpentSeconds: 1,
      });
    }
    const [before] = await db
      .select()
      .from(testSessions)
      .where(eq(testSessions.id, created.sessionId));
    // Force failure after the session_results insert, within this isolated schema.
    await db.execute(
      sql`ALTER TABLE session_category_scores ADD CONSTRAINT reject_test_award CHECK (score_pct < 0)`,
    );
    await assert.rejects(
      service.completeSession(created.sessionId, {
        sessionToken: created.sessionToken,
      }),
    );
    assert.deepEqual(await db.select().from(sessionResults), []);
    assert.deepEqual(await db.select().from(sessionCategoryScores), []);
    const [after] = await db
      .select()
      .from(testSessions)
      .where(eq(testSessions.id, created.sessionId));
    assert.deepEqual(after, before);
    assert.equal(after!.status, SESSION_STATUS.IN_PROGRESS);
    assert.equal(after!.completedAt, null);
    await db.execute(
      sql`ALTER TABLE session_category_scores DROP CONSTRAINT reject_test_award`,
    );
    const result = await service.completeSession(created.sessionId, {
      sessionToken: created.sessionToken,
    });
    assert.equal(result.totalScore, 100);
    const [saved] = await db.select().from(sessionResults);
    assert.deepEqual(saved!.reportSnapshot!.result, result);
  },
);
