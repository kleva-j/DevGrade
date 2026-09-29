import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { eq, sql } from "drizzle-orm";

import type { TestContext } from "node:test";
import type { Db } from "@/db/client";

import {
  questions,
  sessionAnswers,
  sessionResults,
  skillCategories,
  testSessions,
} from "@/db/schema";
import {
  ASSESSMENT_CONTRACT,
  OPTION_ID_MAX,
  QUESTION_SNAPSHOT_FORMAT,
  SESSION_RETENTION_DAYS,
  SESSION_STATUS,
  SESSION_VIEW,
} from "@/domain/constants";
import { createAssessmentHandlers } from "./assessmentHandlers";
import { createAssessmentService } from "./assessmentService";
import { AssessmentError, ERROR_CODE } from "./errors";
import { MESSAGES } from "./messages";
import { createPostgresFixture } from "./__tests__/postgresFixture";
import {
  bankOptions,
  bankRows,
  configuration,
  optionIds,
  pillars,
  sessionRow,
  snapshotV1,
  snapshotV2,
} from "./__tests__/optionIdCases";

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
    pillars.map((pillar) => ({
      name: pillar.skillCategory,
      displayName: pillar.displayName,
      pillarOrder: pillar.order,
    })),
  );
  await db.insert(questions).values(bankRows());
  const service = createAssessmentService(db);
  return {
    db,
    service,
    handlers: createAssessmentHandlers(
      () => service,
      () => {},
    ),
  };
}
async function storedState(db: Db) {
  return {
    sessions: await db.select().from(testSessions).orderBy(testSessions.id),
    answers: await db
      .select()
      .from(sessionAnswers)
      .orderBy(sessionAnswers.questionId),
    results: await db.select().from(sessionResults),
  };
}
function isError(code: AssessmentError["code"]) {
  return (error: unknown) =>
    error instanceof AssessmentError && error.code === code;
}

test(
  "object bank creation still saves V1; all views and grading use saved indices, not bank IDs",
  options,
  async (t) => {
    const { db, service, handlers } = await setup(t);
    await db.update(questions).set({
      options: sql`${JSON.stringify(bankOptions)}::jsonb`,
      correctAnswer: 100,
    });
    for (const assessmentContract of [
      undefined,
      ASSESSMENT_CONTRACT.OPTION_IDS,
    ]) {
      const response = await handlers.createSession({
        ...configuration,
        rawClientId: randomUUID(),
        assessmentContract,
      });
      assert.ok(response.ok);
      const created = response.data;
      const credential = {
        sessionId: created.sessionId,
        sessionToken: created.sessionToken,
      };
      const [saved] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, created.sessionId));
      assert.ok(saved?.questionSnapshot);
      assert.equal(saved.questionSnapshot.version, QUESTION_SNAPSHOT_FORMAT.V1);
      assert.equal(saved.questionSnapshot.questions[0]!.correctAnswer, 2);
      assert.deepEqual(
        saved.questionSnapshot.questions[0]!.options,
        bankOptions.map((option) => option.text),
      );
      const canonical = await service.getSession(credential);
      assert.equal(canonical.kind, SESSION_VIEW.ASSESSMENT);
      assert.deepEqual(
        canonical.questions[0]!.options.map((option) => option.id),
        [0, 1, 2, 3],
      );
      for (const handler of [handlers.getSession, handlers.resumeSession]) {
        const legacy = await handler(credential);
        assert.ok(legacy.ok);
        assert.equal(legacy.data.assessmentContract, undefined);
        assert.equal(legacy.data.kind, SESSION_VIEW.ASSESSMENT);
        assert.deepEqual(
          legacy.data.questions[0]!.options,
          bankOptions.map((option) => option.text),
        );
        const modern = await handler({
          ...credential,
          assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
        });
        assert.ok(modern.ok);
        assert.equal(
          modern.data.assessmentContract,
          ASSESSMENT_CONTRACT.OPTION_IDS,
        );
        assert.equal(modern.data.kind, SESSION_VIEW.ASSESSMENT);
        assert.deepEqual(modern.data.questions, canonical.questions);
      }
      const before = await storedState(db);
      await assert.rejects(
        service.submitAnswer(created.sessionId, {
          ...credential,
          questionId: canonical.questions[0]!.id,
          selectedOptionId: 100,
          timeSpentSeconds: 1,
        }),
        isError(ERROR_CODE.BAD_REQUEST),
      );
      assert.deepEqual(await storedState(db), before);
      for (const question of canonical.questions) {
        const legacy = await handlers.submitAnswer({
          ...credential,
          questionId: question.id,
          selectedAnswer: 2,
          timeSpentSeconds: 7,
        });
        assert.ok(legacy.ok);
        assert.equal(legacy.data.assessmentContract, undefined);
        assert.equal(legacy.data.acceptedAnswer.selectedAnswer, 2);
        const accepted = await storedState(db);
        const retry = await handlers.submitAnswer({
          ...credential,
          questionId: question.id,
          selectedOptionId: 2,
          timeSpentSeconds: 999,
        });
        assert.ok(retry.ok);
        assert.equal(
          retry.data.assessmentContract,
          ASSESSMENT_CONTRACT.OPTION_IDS,
        );
        assert.equal(retry.data.acceptedAnswer.timeSpentSeconds, 7);
        assert.deepEqual(await storedState(db), accepted);
      }
      const completed = await service.completeSession(
        created.sessionId,
        credential,
      );
      assert.equal(completed.kind, SESSION_VIEW.REPORT);
      assert.equal(completed.reportSnapshot.result.totalScore, 100);
      assert.deepEqual(
        completed.reportSnapshot.questions[0]!.options,
        bankOptions.map((option) => option.text),
      );
    }
  },
);

test(
  "V2 wire rejects legacy reads/resume/submits without writes; noncontiguous IDs grade and retry exactly",
  options,
  async (t) => {
    const { db, service, handlers } = await setup(t);
    const row = sessionRow(snapshotV2());
    await db.insert(testSessions).values(row);
    const credential = { sessionId: row.id, sessionToken: row.sessionToken };
    const firstId = row.selectedQuestionIds[0]!;
    const rejectLegacy = async () => {
      const before = await storedState(db);
      for (const [handler, input] of [
        [handlers.getSession, credential],
        [handlers.resumeSession, credential],
        [
          handlers.submitAnswer,
          {
            ...credential,
            questionId: firstId,
            selectedAnswer: 2,
            timeSpentSeconds: 1,
          },
        ],
      ] as const) {
        assert.deepEqual(await handler(input), {
          ok: false,
          error: {
            code: ERROR_CODE.CLIENT_UPDATE_REQUIRED,
            message: MESSAGES.clientUpdateRequired,
          },
        });
        assert.deepEqual(await storedState(db), before);
      }
    };
    await rejectLegacy();
    const modern = await handlers.getSession({
      ...credential,
      assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
    });
    assert.ok(modern.ok);
    assert.equal(
      modern.data.assessmentContract,
      ASSESSMENT_CONTRACT.OPTION_IDS,
    );
    assert.equal(modern.data.kind, SESSION_VIEW.ASSESSMENT);
    assert.deepEqual(
      modern.data.questions[0]!.options.map((option) => option.id),
      optionIds,
    );
    assert.doesNotMatch(
      JSON.stringify(modern),
      /"(?:correctAnswer|correctOptionId|explanation)"\s*:/,
    );
    const beforeInvalid = await storedState(db);
    for (const selectedOptionId of [0, 1, 2, 3, 99])
      await assert.rejects(
        service.submitAnswer(row.id, {
          ...credential,
          questionId: firstId,
          selectedOptionId,
          timeSpentSeconds: 1,
        }),
        isError(ERROR_CODE.BAD_REQUEST),
      );
    assert.deepEqual(await storedState(db), beforeInvalid);
    const accepted = await service.submitAnswer(row.id, {
      ...credential,
      questionId: firstId,
      selectedOptionId: 100,
      timeSpentSeconds: 7,
    });
    assert.equal(accepted.acceptedAnswer.selectedOptionId, 100);
    const after = await storedState(db);
    assert.equal(after.answers[0]!.selectedAnswer, 100);
    assert.equal(after.answers[0]!.isCorrect, true);
    assert.deepEqual(
      await service.submitAnswer(row.id, {
        ...credential,
        questionId: firstId,
        selectedOptionId: 100,
        timeSpentSeconds: 999,
      }),
      accepted,
    );
    await assert.rejects(
      service.submitAnswer(row.id, {
        ...credential,
        questionId: firstId,
        selectedOptionId: 9,
        timeSpentSeconds: 7,
      }),
      isError(ERROR_CODE.CONFLICT),
    );
    assert.deepEqual(await storedState(db), after);
    await rejectLegacy();
    await db
      .update(testSessions)
      .set({ status: SESSION_STATUS.ABANDONED })
      .where(eq(testSessions.id, row.id));
    const resumed = await handlers.resumeSession({
      ...credential,
      assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
    });
    assert.ok(resumed.ok);
    assert.equal(resumed.data.kind, SESSION_VIEW.ASSESSMENT);
    assert.equal(resumed.data.effectiveStatus, SESSION_STATUS.IN_PROGRESS);
    for (const questionId of row.selectedQuestionIds.slice(1))
      await service.submitAnswer(row.id, {
        ...credential,
        questionId,
        selectedOptionId: 100,
        timeSpentSeconds: 7,
      });
    // All rows exist, but a positional value in V2 is still not a valid answer.
    await db
      .update(sessionAnswers)
      .set({ selectedAnswer: 2 })
      .where(eq(sessionAnswers.questionId, firstId));
    const invalidComplete = await storedState(db);
    await assert.rejects(
      service.completeSession(row.id, credential),
      isError(ERROR_CODE.BAD_REQUEST),
    );
    assert.deepEqual(await storedState(db), invalidComplete);
    await db
      .update(sessionAnswers)
      .set({ selectedAnswer: 100 })
      .where(eq(sessionAnswers.questionId, firstId));
    const completed = await service.completeSession(row.id, credential);
    assert.equal(completed.kind, SESSION_VIEW.REPORT);
    assert.equal(completed.reportSnapshot.version, 1);
    assert.equal(completed.reportSnapshot.result.totalScore, 100);
    assert.deepEqual(
      completed.reportSnapshot.questions[0]!.options,
      bankOptions.map((option) => option.text),
    );
    assert.deepEqual(
      await service.completeSession(row.id, credential),
      completed,
    );
    for (const kind of [SESSION_VIEW.REPORT, SESSION_VIEW.LEGACY_SUMMARY]) {
      if (kind === SESSION_VIEW.LEGACY_SUMMARY)
        await db
          .update(sessionResults)
          .set({ reportSnapshot: null })
          .where(eq(sessionResults.sessionId, row.id));
      const beforeReads = await storedState(db);
      for (const handler of [handlers.getSession, handlers.resumeSession]) {
        const legacy = await handler(credential);
        assert.ok(legacy.ok);
        assert.equal(legacy.data.assessmentContract, undefined);
        assert.equal(legacy.data.kind, kind);
        if (legacy.data.kind === SESSION_VIEW.REPORT)
          assert.deepEqual(legacy.data, completed);
        else {
          assert.equal(legacy.data.summary.totalScore, 100);
          assert.deepEqual(
            legacy.data.summary.categoryScores,
            completed.reportSnapshot.result.categoryScores,
          );
        }
        assert.deepEqual(
          await handler({ ...credential, sessionToken: "b".repeat(64) }),
          {
            ok: false,
            error: {
              code: ERROR_CODE.NOT_FOUND,
              message: MESSAGES.sessionNotFound,
            },
          },
        );
      }
      assert.deepEqual(
        await handlers.submitAnswer({
          ...credential,
          questionId: firstId,
          selectedAnswer: 2,
          timeSpentSeconds: 1,
        }),
        {
          ok: false,
          error: {
            code: ERROR_CODE.SESSION_COMPLETED,
            message: MESSAGES.sessionAlreadyComplete,
          },
        },
      );
      assert.deepEqual(await storedState(db), beforeReads);
    }
    await db
      .update(testSessions)
      .set({
        createdAt: sql`clock_timestamp() - ${SESSION_RETENTION_DAYS} * interval '1 day'`,
      })
      .where(eq(testSessions.id, row.id));
    const expired = await storedState(db);
    for (const handler of [handlers.getSession, handlers.resumeSession])
      assert.deepEqual(await handler(credential), {
        ok: false,
        error: {
          code: ERROR_CODE.ACCESS_EXPIRED,
          message: MESSAGES.accessExpired,
        },
      });
    assert.deepEqual(await storedState(db), expired);
  },
);

test(
  "malformed active bank content fails closed before session creation",
  options,
  async (t) => {
    const { db, handlers } = await setup(t);
    const extra = { ...bankRows()[0]!, id: "invalid-extra" };
    await db.insert(questions).values(extra);
    for (const invalid of [
      { options: ["Only one option"], correctAnswer: 0 },
      { options: ["A", "B", "C", " "], correctAnswer: 0 },
      { options: bankOptions, correctAnswer: 99 },
      {
        options: bankOptions.map((option, index) =>
          index === 0 ? { ...option, id: OPTION_ID_MAX + 1 } : option,
        ),
        correctAnswer: 100,
      },
    ]) {
      await db
        .update(questions)
        .set({
          options: sql`${JSON.stringify(invalid.options)}::jsonb`,
          correctAnswer: invalid.correctAnswer,
        })
        .where(eq(questions.id, extra.id));
      const before = await storedState(db);
      assert.deepEqual(
        await handlers.createSession({
          ...configuration,
          rawClientId: randomUUID(),
        }),
        {
          ok: false,
          error: {
            code: ERROR_CODE.INSUFFICIENT_QUESTIONS,
            message: MESSAGES.insufficientQuestions,
          },
        },
      );
      assert.deepEqual(await storedState(db), before);
    }
    // Retiring the malformed extra restores creation from the eight valid rows.
    await db
      .update(questions)
      .set({ isActive: false })
      .where(eq(questions.id, extra.id));
    const created = await handlers.createSession({
      ...configuration,
      rawClientId: randomUUID(),
    });
    assert.ok(created.ok);
    assert.equal(created.data.questions.length, bankRows().length);
  },
);

test(
  "frozen V1 with three saved options remains readable and answerable by both contracts",
  options,
  async (t) => {
    const { db, service, handlers } = await setup(t);
    const snapshot = snapshotV1();
    for (const question of snapshot.questions)
      question.options = ["", "Saved B", "Saved C"];
    const row = sessionRow(snapshot);
    await db.insert(testSessions).values(row);
    const credential = { sessionId: row.id, sessionToken: row.sessionToken };
    const legacy = await handlers.getSession(credential);
    assert.ok(legacy.ok);
    assert.equal(legacy.data.assessmentContract, undefined);
    assert.equal(legacy.data.kind, SESSION_VIEW.ASSESSMENT);
    assert.deepEqual(legacy.data.questions[0]!.options, [
      "",
      "Saved B",
      "Saved C",
    ]);
    for (const questionId of row.selectedQuestionIds) {
      assert.ok(
        (
          await handlers.submitAnswer({
            ...credential,
            questionId,
            selectedAnswer: 2,
            timeSpentSeconds: 1,
          })
        ).ok,
      );
      const retry = await handlers.submitAnswer({
        ...credential,
        questionId,
        selectedOptionId: 2,
        timeSpentSeconds: 999,
      });
      assert.ok(retry.ok);
      assert.equal(
        retry.data.assessmentContract,
        ASSESSMENT_CONTRACT.OPTION_IDS,
      );
      assert.equal(retry.data.acceptedAnswer.timeSpentSeconds, 1);
    }
    const report = await service.completeSession(row.id, credential);
    assert.equal(report.kind, SESSION_VIEW.REPORT);
    assert.equal(report.reportSnapshot.result.totalScore, 100);
    assert.deepEqual(report.reportSnapshot.questions[0]!.options, [
      "",
      "Saved B",
      "Saved C",
    ]);
    assert.deepEqual(
      (await storedState(db)).sessions[0]!.questionSnapshot,
      snapshot,
    );
  },
);
