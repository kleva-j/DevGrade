import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import type { TestContext } from "node:test";
import type { Db } from "@/db/client";
import type { SessionCredential } from "@/domain/sessionContracts";
import type { AnswerInput } from "@/domain/types";

import * as schema from "@/db/schema";

import {
  questions,
  sessionAnswers,
  sessionCategoryScores,
  sessionResults,
  sessionSurveys,
  skillCategories,
  testSessions,
} from "@/db/schema";
import {
  ASSESSMENT_LENGTHS,
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  DIFFICULTIES,
  DIFFICULTY,
  FRAMEWORK,
  MAX_KNOWN_SESSION_CREDENTIALS,
  SESSION_DISCOVERY,
  SESSION_STATUS,
  SESSION_VIEW,
  SKILL_CATEGORIES,
  WEIGHT_ADVANCED,
  WEIGHT_CORE,
} from "@/domain/constants";
import { createAssessmentService } from "./assessmentService";
import {
  AssessmentError,
  ERROR_CODE,
  ExistingAttemptError,
  assessmentEnvelope,
} from "./errors";
import { createPostgresFixture } from "./__tests__/postgresFixture";

const options = {
  skip:
    process.env.TEST_DATABASE_URL === undefined
      ? "Set TEST_DATABASE_URL explicitly to run PostgreSQL integration tests"
      : false,
  timeout: 60_000,
};
const configuration = {
  framework: FRAMEWORK.REACT,
  targetLevel: DIFFICULTY.MID,
};
const wrongToken = "0".repeat(64);
const noSecrets =
  /"(?:sessionToken|clientId|questionSnapshot|correctAnswer|isCorrect|explanation|difficultyWeight|source)"\s*:/;
function errorCode(code: AssessmentError["code"]) {
  return (error: unknown) => {
    assert.ok(error instanceof AssessmentError);
    assert.equal(error.code, code);
    return true;
  };
}
async function setup(t: TestContext) {
  const fixture = await createPostgresFixture(t);
  const { db } = fixture;
  await db.insert(skillCategories).values(
    SKILL_CATEGORIES.map((name, index) => ({
      name,
      displayName: `Saved ${name}`,
      description: `Saved guidance ${name}`,
      pillarOrder: index,
    })),
  );
  await db.insert(questions).values(
    DIFFICULTIES.flatMap((difficulty) =>
      SKILL_CATEGORIES.flatMap((skillCategory) =>
        [WEIGHT_CORE, WEIGHT_ADVANCED].flatMap((difficultyWeight) =>
          Array.from({ length: 4 }, (_, index) => ({
            id: `${difficulty}-${skillCategory}-${difficultyWeight}-${index}`,
            framework: FRAMEWORK.REACT,
            difficulty,
            skillCategory,
            difficultyWeight,
            title: "Saved title",
            prompt: "Saved prompt",
            options: ["A", "B", "C", "D"],
            correctAnswer: 2,
            explanation: "Private explanation",
          })),
        ),
      ),
    ),
  );
  const service = createAssessmentService(db);
  const create = (questionCount = 8) =>
    service.createSession({
      ...configuration,
      questionCount,
      rawClientId: randomUUID(),
    });
  return { ...fixture, service, create };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function parent(db: Db, credential: SessionCredential) {
  const [row] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, credential.sessionId));
  assert.ok(row);
  return row;
}
async function answerAll(f: Fixture, credential: SessionCredential) {
  const row = await parent(f.db, credential);
  for (const questionId of [...row.selectedQuestionIds].reverse()) {
    await f.service.submitAnswer(credential.sessionId, {
      sessionToken: credential.sessionToken,
      questionId,
      selectedAnswer: 2,
      timeSpentSeconds: 7,
    });
  }
}
async function age(f: Fixture, credential: SessionCredential, hours: number) {
  await f.db
    .update(testSessions)
    .set({ createdAt: sql`clock_timestamp() - ${hours} * interval '1 hour'` })
    .where(eq(testSessions.id, credential.sessionId));
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function settled<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
/** Queue two real service transactions behind an independent parent-lock holder. */
async function orderedRace<TFirst, TSecond>(
  f: Fixture,
  credential: SessionCredential,
  first: (db: Db) => Promise<TFirst>,
  second: (db: Db) => Promise<TSecond>,
) {
  const holder = await f.connect();
  const a = await f.connect();
  const b = await f.connect();
  assert.equal(new Set([holder.pid, a.pid, b.pid]).size, 3);
  const locked = deferred();
  const release = deferred();
  const holding = holder.db.transaction(async (tx) => {
    await tx
      .select()
      .from(testSessions)
      .where(eq(testSessions.id, credential.sessionId))
      .for("update");
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  let firstResult;
  let secondResult;
  try {
    firstResult = settled(first(a.db));
    await f.waitForBlocked(a.pid);
    secondResult = settled(second(b.db));
    await f.waitForBlocked(b.pid);
  } finally {
    release.resolve();
    await holding;
  }
  return { first: await firstResult, second: await secondResult };
}

test(
  "lifecycle restoration, retries, authoritative progress and immutable reports",
  options,
  async (t) => {
    const f = await setup(t);
    for (const length of ASSESSMENT_LENGTHS) {
      await t.test(
        `${length}: safe out-of-order restoration, same-option replay and completed no-op resume`,
        async () => {
          const created = await f.create(length);
          const initial = await parent(f.db, created);
          const lastId = created.questions.at(-1)!.id;
          const input = {
            sessionToken: created.sessionToken,
            questionId: lastId,
            selectedAnswer: 2,
            timeSpentSeconds: 11,
          };
          const accepted = await f.service.submitAnswer(
            created.sessionId,
            input,
          );
          assert.equal(accepted.nextQuestionId, created.questions[0]!.id);
          assert.equal(accepted.answeredCount, 1);
          const afterAnswer = await parent(f.db, created);
          await f.db
            .update(testSessions)
            .set({ status: SESSION_STATUS.ABANDONED })
            .where(eq(testSessions.id, created.sessionId));
          const beforeRetry = await parent(f.db, created);
          assert.deepEqual(
            await f.service.submitAnswer(created.sessionId, {
              ...input,
              timeSpentSeconds: 999,
            }),
            accepted,
          );
          assert.deepEqual(await parent(f.db, created), beforeRetry);
          await assert.rejects(
            f.service.submitAnswer(created.sessionId, {
              ...input,
              selectedAnswer: 1,
            }),
            errorCode(ERROR_CODE.CONFLICT),
          );
          assert.deepEqual(await parent(f.db, created), beforeRetry);
          const view = await f.service.getSession(created);
          assert.equal(view.kind, SESSION_VIEW.ASSESSMENT);
          assert.equal(view.effectiveStatus, SESSION_STATUS.ABANDONED);
          assert.deepEqual(view.questions, created.questions);
          assert.deepEqual(view.acceptedAnswers, [
            { questionId: lastId, selectedAnswer: 2, timeSpentSeconds: 11 },
          ]);
          assert.equal(view.nextQuestionId, created.questions[0]!.id);
          assert.equal(view.configuration.questionCount, length);
          assert.equal(view.attemptExpiresAt, created.attemptExpiresAt);
          assert.equal(view.accessExpiresAt, created.accessExpiresAt);
          assert.doesNotMatch(JSON.stringify(view), noSecrets);
          assert.deepEqual(await parent(f.db, created), beforeRetry);
          const resumed = await f.service.resumeSession(created);
          assert.equal(resumed.kind, SESSION_VIEW.ASSESSMENT);
          assert.equal(resumed.effectiveStatus, SESSION_STATUS.IN_PROGRESS);
          const active = await parent(f.db, created);
          assert.ok(active.lastActivityAt >= afterAnswer.lastActivityAt);
          assert.deepEqual(active.createdAt, initial.createdAt);
          await answerAll(f, created);
          const full = await f.service.getSession(created);
          assert.equal(
            full.kind === SESSION_VIEW.ASSESSMENT && full.nextQuestionId,
            null,
          );
          const award = await f.service.completeSession(
            created.sessionId,
            created,
          );
          assert.equal(award.kind, SESSION_VIEW.REPORT);
          assert.equal(award.surveyRating, null);
          assert.equal(award.attemptExpiresAt, created.attemptExpiresAt);
          assert.equal(award.accessExpiresAt, created.accessExpiresAt);
          assert.deepEqual(await f.service.getSession(created), award);
          const completed = await parent(f.db, created);
          await age(f, created, 48);
          await f.service.submitSurvey(created.sessionId, {
            ...created,
            rating: 4,
          });
          const beforeRead = await parent(f.db, created);
          const report = await f.service.getSession(created);
          assert.equal(report.kind, SESSION_VIEW.REPORT);
          assert.deepEqual(report.reportSnapshot, award.reportSnapshot);
          assert.equal(report.surveyRating, 4);
          assert.equal(
            report.reportSnapshot.completedAt,
            completed.completedAt!.toISOString(),
          );
          await f.db.update(questions).set({
            title: "Bank edited later",
            explanation: "Bank changed later",
          });
          await f.db
            .update(skillCategories)
            .set({ displayName: "Live labels changed" });
          assert.deepEqual(await f.service.getSession(created), report);
          assert.deepEqual(await f.service.resumeSession(created), report);
          assert.deepEqual(
            await f.service.completeSession(created.sessionId, created),
            report,
          );
          assert.deepEqual(await parent(f.db, created), beforeRead);
          await assert.rejects(
            f.service.submitAnswer(created.sessionId, input),
            errorCode(ERROR_CODE.SESSION_COMPLETED),
          );
        },
      );
    }
  },
);

test(
  "mutations return request-ready views and ordered private-safe answers without extra reads",
  options,
  async (t) => {
    const f = await setup(t);
    const reads: string[] = [];
    const service = createAssessmentService(
      drizzle(f.db.$client, {
        schema,
        logger: {
          logQuery(query) {
            if (/^select\b/i.test(query))
              reads.push(query.match(/\bfrom "([^"]+)"/i)?.[1] ?? "clock");
          },
        },
      }),
    );
    const { sessionToken, ...initial } = await service.createSession({
      ...configuration,
      rawClientId: randomUUID(),
    });
    assert.deepEqual(reads, [
      "clock",
      "test_sessions",
      "questions",
      "skill_categories",
      "clock",
    ]);
    const credential = { sessionId: initial.sessionId, sessionToken };
    assert.deepEqual(initial, await f.service.getSession(credential));
    assert.doesNotMatch(JSON.stringify(initial), noSecrets);

    const expected: AnswerInput[] = [];
    for (const [index, question] of [...initial.questions]
      .reverse()
      .entries()) {
      const answer = {
        questionId: question.id,
        selectedAnswer: index % 3,
        timeSpentSeconds: index + 1,
      };
      expected.unshift(answer);
      reads.length = 0;
      const accepted = await service.submitAnswer(initial.sessionId, {
        sessionToken,
        ...answer,
      });
      assert.deepEqual(reads, ["test_sessions", "clock", "session_answers"]);
      assert.deepEqual(accepted, {
        success: true,
        sessionComplete: expected.length === initial.totalQuestions,
        acceptedAnswer: answer,
        acceptedAnswers: expected,
        answeredCount: expected.length,
        totalQuestions: initial.totalQuestions,
        nextQuestionId:
          expected.length === initial.totalQuestions
            ? null
            : initial.questions[0]!.id,
      });
      assert.doesNotMatch(JSON.stringify(accepted), noSecrets);
    }
    reads.length = 0;
    const replay = await service.submitAnswer(initial.sessionId, {
      sessionToken,
      ...expected.at(-1)!,
      timeSpentSeconds: 999,
    });
    assert.deepEqual(reads, ["test_sessions", "clock", "session_answers"]);
    assert.deepEqual(replay.acceptedAnswers, expected);
    assert.deepEqual(replay.acceptedAnswer, expected.at(-1));
    assert.equal(replay.nextQuestionId, null);
    assert.doesNotMatch(JSON.stringify(replay), noSecrets);

    reads.length = 0;
    const completed = await service.completeSession(
      initial.sessionId,
      credential,
    );
    assert.deepEqual(reads, ["test_sessions", "clock", "session_answers"]);
    assert.equal(completed.kind, SESSION_VIEW.REPORT);
    assert.equal(completed.surveyRating, null);
    assert.equal(completed.attemptExpiresAt, initial.attemptExpiresAt);
    assert.equal(completed.accessExpiresAt, initial.accessExpiresAt);
    assert.deepEqual(completed.reportSnapshot.questions, initial.questions);
    assert.deepEqual(completed, await f.service.getSession(credential));
    assert.doesNotMatch(
      JSON.stringify(completed),
      /"(?:sessionToken|clientId|questionSnapshot|correctAnswer|difficultyWeight|source)"\s*:/,
    );
    await f.db
      .update(testSessions)
      .set({ questionSnapshot: null })
      .where(eq(testSessions.id, initial.sessionId));
    await f.service.submitSurvey(initial.sessionId, {
      sessionToken,
      rating: 4,
    });
    reads.length = 0;
    assert.deepEqual(
      await service.completeSession(initial.sessionId, credential),
      { ...completed, surveyRating: 4 },
    );
    assert.deepEqual(reads, [
      "test_sessions",
      "clock",
      "session_results",
      "session_surveys",
    ]);
  },
);

test(
  "authentication precedes deadlines; every legacy and current entrypoint enforces fixed cutoffs",
  options,
  async (t) => {
    const f = await setup(t);
    for (const legacy of [false, true]) {
      const created = await f.create();
      await answerAll(f, created);
      if (legacy)
        await f.db
          .update(testSessions)
          .set({ questionSnapshot: null })
          .where(eq(testSessions.id, created.sessionId));
      await age(f, created, 24);
      const before = await parent(f.db, created);
      const input = {
        sessionToken: created.sessionToken,
        questionId: created.questions[0]!.id,
        selectedAnswer: 2,
        timeSpentSeconds: 99,
      };
      assert.equal(
        (await f.service.getSession(created)).kind,
        SESSION_VIEW.ATTEMPT_EXPIRED,
      );
      assert.equal(
        (await f.service.resumeSession(created)).kind,
        SESSION_VIEW.ATTEMPT_EXPIRED,
      );
      await assert.rejects(
        f.service.submitAnswer(created.sessionId, input),
        errorCode(ERROR_CODE.ATTEMPT_EXPIRED),
      );
      await assert.rejects(
        f.service.completeSession(created.sessionId, created),
        errorCode(ERROR_CODE.ATTEMPT_EXPIRED),
      );
      assert.deepEqual(await parent(f.db, created), before);
      assert.equal(
        (
          await f.db
            .select()
            .from(sessionResults)
            .where(eq(sessionResults.sessionId, created.sessionId))
        ).length,
        0,
      );
      await age(f, created, 168);
      for (const credential of [
        { ...created, sessionToken: wrongToken },
        { sessionId: randomUUID(), sessionToken: wrongToken },
      ]) {
        await assert.rejects(
          f.service.getSession(credential),
          errorCode(ERROR_CODE.NOT_FOUND),
        );
        await assert.rejects(
          f.service.resumeSession(credential),
          errorCode(ERROR_CODE.NOT_FOUND),
        );
        await assert.rejects(
          f.service.completeSession(credential.sessionId, credential),
          errorCode(ERROR_CODE.NOT_FOUND),
        );
        await assert.rejects(
          f.service.submitAnswer(credential.sessionId, {
            ...input,
            sessionToken: credential.sessionToken,
          }),
          errorCode(ERROR_CODE.NOT_FOUND),
        );
        await assert.rejects(
          f.service.submitSurvey(credential.sessionId, {
            ...credential,
            rating: 3,
          }),
          errorCode(ERROR_CODE.NOT_FOUND),
        );
        await assert.rejects(
          f.service.deleteSession({
            ...credential,
            expectedState: DELETE_EXPECTATION.UNFINISHED,
          }),
          errorCode(ERROR_CODE.NOT_FOUND),
        );
      }
      await assert.rejects(
        f.service.getSession(created),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      await assert.rejects(
        f.service.resumeSession(created),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      await assert.rejects(
        f.service.submitAnswer(created.sessionId, input),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      await assert.rejects(
        f.service.completeSession(created.sessionId, created),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      await assert.rejects(
        f.service.submitSurvey(created.sessionId, { ...created, rating: 3 }),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      assert.deepEqual(
        await f.service.deleteSession({
          ...created,
          expectedState: DELETE_EXPECTATION.UNFINISHED,
        }),
        { kind: DELETE_OUTCOME.DELETED },
      );
      await assert.rejects(
        f.service.deleteSession({
          ...created,
          expectedState: DELETE_EXPECTATION.UNFINISHED,
        }),
        errorCode(ERROR_CODE.NOT_FOUND),
      );
    }
    for (const legacy of [false, true]) {
      const created = await f.create();
      await answerAll(f, created);
      await f.service.completeSession(created.sessionId, created);
      if (legacy)
        await f.db
          .update(sessionResults)
          .set({ reportSnapshot: null })
          .where(eq(sessionResults.sessionId, created.sessionId));
      await age(f, created, 167);
      const expected = legacy
        ? SESSION_VIEW.LEGACY_SUMMARY
        : SESSION_VIEW.REPORT;
      assert.equal((await f.service.getSession(created)).kind, expected);
      assert.equal(
        (await f.service.completeSession(created.sessionId, created)).kind,
        expected,
      );
      await f.service.submitSurvey(created.sessionId, {
        ...created,
        rating: 5,
      });
      await age(f, created, 168);
      await assert.rejects(
        f.service.getSession(created),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      await assert.rejects(
        f.service.resumeSession(created),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      await assert.rejects(
        f.service.completeSession(created.sessionId, created),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      await assert.rejects(
        f.service.submitSurvey(created.sessionId, { ...created, rating: 1 }),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
      assert.equal(
        (
          await f.service.deleteSession({
            ...created,
            expectedState: DELETE_EXPECTATION.UNFINISHED,
          })
        ).kind,
        DELETE_OUTCOME.CHANGED_STATE,
      );
      assert.equal(
        (
          await f.service.deleteSession({
            ...created,
            expectedState: DELETE_EXPECTATION.COMPLETED,
          })
        ).kind,
        DELETE_OUTCOME.DELETED,
      );
      for (const table of [
        sessionAnswers,
        sessionResults,
        sessionCategoryScores,
        sessionSurveys,
      ])
        assert.deepEqual(
          await f.db
            .select()
            .from(table)
            .where(eq(table.sessionId, created.sessionId)),
          [],
        );
    }
    assert.ok((await f.db.select().from(questions)).length > 0);
  },
);

test(
  "legacy data is delete-only or persisted summary; never reconstructed or rescored",
  options,
  async (t) => {
    const f = await setup(t);
    const created = await f.create();
    await f.db
      .update(testSessions)
      .set({ questionSnapshot: null })
      .where(eq(testSessions.id, created.sessionId));
    const before = await parent(f.db, created);
    const view = await f.service.getSession(created);
    assert.equal(view.kind, SESSION_VIEW.LEGACY_UNRESTORABLE);
    assert.equal(view.blocksCreation, true);
    assert.deepEqual(await f.service.resumeSession(created), view);
    assert.doesNotMatch(
      JSON.stringify(view),
      /questions|acceptedAnswers|correctAnswer|explanation/,
    );
    assert.deepEqual(await parent(f.db, created), before);
    await assert.rejects(
      f.service.completeSession(created.sessionId, created),
      errorCode(ERROR_CODE.LEGACY_UNRESTORABLE),
    );
    const completed = await f.create();
    await answerAll(f, completed);
    await f.service.completeSession(completed.sessionId, completed);
    await f.db
      .update(testSessions)
      .set({ questionSnapshot: null })
      .where(eq(testSessions.id, completed.sessionId));
    await f.db
      .update(sessionResults)
      .set({ reportSnapshot: null, totalScore: 37 })
      .where(eq(sessionResults.sessionId, completed.sessionId));
    const summary = await f.service.getSession(completed);
    assert.equal(summary.kind, SESSION_VIEW.LEGACY_SUMMARY);
    assert.equal(summary.summary.totalScore, 37);
    assert.equal(summary.summary.categoryScores.length, 4);
    assert.doesNotMatch(
      JSON.stringify(summary),
      /questionResults|questions|skillGaps|explanation|displayName/,
    );
    assert.deepEqual(await f.service.resumeSession(completed), summary);
    assert.deepEqual(
      await f.service.completeSession(completed.sessionId, completed),
      summary,
    );
  },
);

test(
  "creation discovers only supplied authenticated credentials, checks every batch and fails closed",
  options,
  async (t) => {
    const f = await setup(t);
    const created = await f.create();
    // Put the blocker in the final sorted batch, not just at the end of caller input.
    const lastId = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    await f.db
      .update(testSessions)
      .set({ id: lastId })
      .where(eq(testSessions.id, created.sessionId));
    created.sessionId = lastId;
    const before = await parent(f.db, created);
    const unknown = { sessionId: randomUUID(), sessionToken: wrongToken };
    const wrong = { sessionId: created.sessionId, sessionToken: wrongToken };
    const found = await f.service.discoverSessions({
      credentials: [unknown, wrong, created],
    });
    assert.deepEqual(
      found.sessions.slice(0, 2),
      [unknown, wrong].map(({ sessionId }) => ({
        kind: SESSION_DISCOVERY.UNAVAILABLE,
        sessionId,
      })),
    );
    assert.equal(found.sessions[2]!.kind, SESSION_DISCOVERY.AVAILABLE);
    assert.doesNotMatch(JSON.stringify(found), noSecrets);
    assert.deepEqual(await parent(f.db, created), before);
    const lots = Array.from(
      { length: MAX_KNOWN_SESSION_CREDENTIALS - 1 },
      (_, index) => ({
        sessionId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
        sessionToken: randomBytes(32).toString("hex"),
      }),
    );
    const completeList = [...lots, created];
    assert.equal(
      (await f.service.discoverSessions({ credentials: completeList })).sessions
        .length,
      MAX_KNOWN_SESSION_CREDENTIALS,
    );
    const countBefore = (await f.db.select().from(testSessions)).length;
    await f.db.execute(
      sql`ALTER TABLE session_answers RENAME TO temporarily_unavailable_answers`,
    );
    try {
      const failedDiscovery = await assessmentEnvelope(() =>
        f.service.discoverSessions({ credentials: completeList }),
      );
      assert.equal(failedDiscovery.ok, false);
      assert.equal(failedDiscovery.error.code, ERROR_CODE.INTERNAL_ERROR);
      const failedCreation = await assessmentEnvelope(() =>
        f.service.createSession({
          ...configuration,
          rawClientId: randomUUID(),
          knownCredentials: completeList,
        }),
      );
      assert.equal(failedCreation.ok, false);
      assert.equal(failedCreation.error.code, ERROR_CODE.INTERNAL_ERROR);
      assert.doesNotMatch(
        JSON.stringify([failedDiscovery, failedCreation]),
        /temporarily_unavailable|SELECT|sessionToken/,
      );
      assert.equal(
        (await f.db.select().from(testSessions)).length,
        countBefore,
      );
    } finally {
      await f.db.execute(
        sql`ALTER TABLE temporarily_unavailable_answers RENAME TO session_answers`,
      );
    }
    const blocked = await assessmentEnvelope(() =>
      f.service.createSession({
        ...configuration,
        targetLevel: DIFFICULTY.SENIOR,
        questionCount: 32,
        rawClientId: randomUUID(),
        knownCredentials: completeList,
      }),
    );
    assert.equal(blocked.ok, false);
    if (blocked.error.code !== ERROR_CODE.EXISTING_ATTEMPT)
      assert.fail("Expected actionable blocker");
    assert.equal(
      blocked.error.blockers[0]!.configuration.targetLevel,
      DIFFICULTY.MID,
    );
    assert.equal(blocked.error.blockers[0]!.configuration.questionCount, 8);
    assert.doesNotMatch(JSON.stringify(blocked), noSecrets);
    assert.equal((await f.db.select().from(testSessions)).length, countBefore);

    for (const status of [
      SESSION_STATUS.IN_PROGRESS,
      SESSION_STATUS.ABANDONED,
    ]) {
      for (const legacy of [false, true]) {
        await f.db
          .update(testSessions)
          .set({
            status,
            questionSnapshot: legacy ? null : before.questionSnapshot,
          })
          .where(eq(testSessions.id, created.sessionId));
        await assert.rejects(
          f.service.createSession({
            ...configuration,
            rawClientId: randomUUID(),
            knownCredentials: [created],
          }),
          errorCode(ERROR_CODE.EXISTING_ATTEMPT),
        );
      }
    }
    // Client hash alone does not authorize discovery or gate another session.
    const sameClient = "same-client-not-an-auth-credential";
    const other = await f.service.createSession({
      ...configuration,
      rawClientId: sameClient,
    });
    await f.service.createSession({
      ...configuration,
      rawClientId: sameClient,
      knownCredentials: [wrong, unknown],
    });
    await f.service.deleteSession({
      ...created,
      expectedState: DELETE_EXPECTATION.UNFINISHED,
    });
    await assert.rejects(
      f.service.createSession({
        ...configuration,
        rawClientId: randomUUID(),
        knownCredentials: [created, other],
      }),
      errorCode(ERROR_CODE.EXISTING_ATTEMPT),
    );
    await age(f, other, 24);
    await f.service.createSession({
      ...configuration,
      rawClientId: randomUUID(),
      knownCredentials: [created, other],
    });

    const allAnswered = await f.create();
    await answerAll(f, allAnswered);
    await assert.rejects(
      f.service.createSession({
        ...configuration,
        rawClientId: randomUUID(),
        knownCredentials: [allAnswered],
      }),
      errorCode(ERROR_CODE.EXISTING_ATTEMPT),
    );
    await f.service.completeSession(allAnswered.sessionId, allAnswered);
    await f.service.createSession({
      ...configuration,
      rawClientId: randomUUID(),
      knownCredentials: [allAnswered],
    });
  },
);

test(
  "first completion requires exactly the selected accepted-ID set, not a count",
  options,
  async (t) => {
    const f = await setup(t);
    const created = await f.create();
    await answerAll(f, created);
    const [extra] = (await f.db.select().from(questions)).filter(
      (q) => !created.questions.some((selected) => selected.id === q.id),
    );
    assert.ok(extra);
    await f.db
      .delete(sessionAnswers)
      .where(eq(sessionAnswers.questionId, created.questions[0]!.id));
    await f.db.insert(sessionAnswers).values({
      sessionId: created.sessionId,
      questionId: extra.id,
      selectedAnswer: 2,
      isCorrect: true,
      timeSpentSeconds: 1,
    });
    await assert.rejects(
      f.service.completeSession(created.sessionId, created),
      errorCode(ERROR_CODE.BAD_REQUEST),
    );
    const view = await f.service.getSession(created);
    assert.equal(
      view.kind === SESSION_VIEW.ASSESSMENT && view.nextQuestionId,
      created.questions[0]!.id,
    );
    await f.service.submitAnswer(created.sessionId, {
      ...created,
      questionId: created.questions[0]!.id,
      selectedAnswer: 2,
      timeSpentSeconds: 1,
    });
    await assert.rejects(
      f.service.completeSession(created.sessionId, created),
      errorCode(ERROR_CODE.BAD_REQUEST),
    );
    assert.deepEqual(await f.db.select().from(sessionResults), []);
  },
);

test(
  "parent-locked answer, completion, deletion, survey and creation races on independent backends",
  options,
  async (t) => {
    const f = await setup(t);
    await t.test(
      "same option acknowledges original timing; different option conflicts",
      async () => {
        for (const same of [true, false]) {
          const created = await f.create();
          const input = {
            ...created,
            questionId: created.questions[0]!.id,
            selectedAnswer: 2,
            timeSpentSeconds: 7,
          };
          const race = await orderedRace(
            f,
            created,
            (db) =>
              createAssessmentService(db).submitAnswer(
                created.sessionId,
                input,
              ),
            (db) =>
              createAssessmentService(db).submitAnswer(created.sessionId, {
                ...input,
                selectedAnswer: same ? 2 : 1,
                timeSpentSeconds: 999,
              }),
          );
          assert.ok(race.first.ok);
          if (same) {
            assert.ok(race.second.ok);
            assert.deepEqual(race.second.value, race.first.value);
          } else {
            assert.ok(!race.second.ok);
            errorCode(ERROR_CODE.CONFLICT)(race.second.error);
          }
          const [answer] = await f.db
            .select()
            .from(sessionAnswers)
            .where(eq(sessionAnswers.sessionId, created.sessionId));
          assert.equal(answer!.timeSpentSeconds, 7);
          assert.equal(answer!.selectedAnswer, 2);
          assert.deepEqual(
            (await parent(f.db, created)).lastActivityAt,
            answer!.answeredAt,
          );
        }
      },
    );
    await t.test("completion is serialized and idempotent", async () => {
      const created = await f.create();
      await answerAll(f, created);
      const complete = (db: Db) =>
        createAssessmentService(db).completeSession(created.sessionId, created);
      const race = await orderedRace(f, created, complete, complete);
      assert.ok(race.first.ok && race.second.ok);
      assert.deepEqual(race.first.value, race.second.value);
      assert.equal(
        (
          await f.db
            .select()
            .from(sessionResults)
            .where(eq(sessionResults.sessionId, created.sessionId))
        ).length,
        1,
      );
      assert.equal(
        (
          await f.db
            .select()
            .from(sessionCategoryScores)
            .where(eq(sessionCategoryScores.sessionId, created.sessionId))
        ).length,
        4,
      );
    });
    for (const completionFirst of [true, false]) {
      await t.test(
        `delete vs completion: completionFirst=${completionFirst}`,
        async () => {
          const created = await f.create();
          await answerAll(f, created);
          const complete = (db: Db) =>
            createAssessmentService(db).completeSession(
              created.sessionId,
              created,
            );
          const remove = (db: Db) =>
            createAssessmentService(db).deleteSession({
              ...created,
              expectedState: DELETE_EXPECTATION.UNFINISHED,
            });
          if (completionFirst) {
            const race = await orderedRace(f, created, complete, remove);
            assert.ok(race.first.ok && race.second.ok);
            assert.deepEqual(race.second.value, {
              kind: DELETE_OUTCOME.CHANGED_STATE,
              currentState: DELETE_EXPECTATION.COMPLETED,
            });
            assert.equal(
              (await f.service.getSession(created)).kind,
              SESSION_VIEW.REPORT,
            );
          } else {
            const race = await orderedRace(f, created, remove, complete);
            assert.ok(race.first.ok);
            assert.ok(!race.second.ok);
            errorCode(ERROR_CODE.NOT_FOUND)(race.second.error);
            assert.deepEqual(
              await f.db
                .select()
                .from(sessionResults)
                .where(eq(sessionResults.sessionId, created.sessionId)),
              [],
            );
          }
        },
      );
    }
    for (const deletionFirst of [true, false]) {
      await t.test(
        `survey vs completed deletion: deletionFirst=${deletionFirst}`,
        async () => {
          const created = await f.create();
          await answerAll(f, created);
          await f.service.completeSession(created.sessionId, created);
          const survey = (db: Db) =>
            createAssessmentService(db).submitSurvey(created.sessionId, {
              ...created,
              rating: 5,
            });
          const remove = (db: Db) =>
            createAssessmentService(db).deleteSession({
              ...created,
              expectedState: DELETE_EXPECTATION.COMPLETED,
            });
          if (deletionFirst) {
            const race = await orderedRace(f, created, remove, survey);
            assert.ok(race.first.ok);
            assert.ok(!race.second.ok);
            errorCode(ERROR_CODE.NOT_FOUND)(race.second.error);
          } else {
            const race = await orderedRace(f, created, survey, remove);
            assert.ok(race.first.ok && race.second.ok);
          }
          assert.deepEqual(
            await f.db
              .select()
              .from(sessionSurveys)
              .where(eq(sessionSurveys.sessionId, created.sessionId)),
            [],
          );
        },
      );
    }
    await t.test(
      "last answer versus completion has defined outcomes in both orders",
      async () => {
        for (const answerFirst of [true, false]) {
          const created = await f.create();
          await answerAll(f, created);
          const questionId = created.questions.at(-1)!.id;
          await f.db
            .delete(sessionAnswers)
            .where(
              and(
                eq(sessionAnswers.sessionId, created.sessionId),
                eq(sessionAnswers.questionId, questionId),
              ),
            );
          const answer = (db: Db) =>
            createAssessmentService(db).submitAnswer(created.sessionId, {
              ...created,
              questionId,
              selectedAnswer: 2,
              timeSpentSeconds: 9,
            });
          const complete = (db: Db) =>
            createAssessmentService(db).completeSession(
              created.sessionId,
              created,
            );
          if (answerFirst) {
            const race = await orderedRace(f, created, answer, complete);
            assert.ok(race.first.ok && race.second.ok);
            assert.equal(race.first.value.nextQuestionId, null);
          } else {
            const race = await orderedRace(f, created, complete, answer);
            assert.ok(!race.first.ok && race.second.ok);
            errorCode(ERROR_CODE.BAD_REQUEST)(race.first.error);
            assert.equal(
              (await f.service.getSession(created)).kind,
              SESSION_VIEW.ASSESSMENT,
            );
            await f.service.completeSession(created.sessionId, created);
          }
        }
      },
    );
    await t.test(
      "resume versus deletion cannot resurrect a deleted parent",
      async () => {
        for (const resumeFirst of [true, false]) {
          const created = await f.create();
          const resume = (db: Db) =>
            createAssessmentService(db).resumeSession(created);
          const remove = (db: Db) =>
            createAssessmentService(db).deleteSession({
              ...created,
              expectedState: DELETE_EXPECTATION.UNFINISHED,
            });
          if (resumeFirst) {
            const race = await orderedRace(f, created, resume, remove);
            assert.ok(race.first.ok && race.second.ok);
          } else {
            const race = await orderedRace(f, created, remove, resume);
            assert.ok(race.first.ok && !race.second.ok);
            errorCode(ERROR_CODE.NOT_FOUND)(race.second.error);
          }
          await assert.rejects(
            f.service.getSession(created),
            errorCode(ERROR_CODE.NOT_FOUND),
          );
        }
      },
    );
    await t.test(
      "final creation waits for known completion/deletion and rechecks; reverse order blocks",
      async () => {
        for (const completeFirst of [true, false]) {
          const created = await f.create();
          await answerAll(f, created);
          const complete = (db: Db) =>
            createAssessmentService(db).completeSession(
              created.sessionId,
              created,
            );
          const create = (db: Db) =>
            createAssessmentService(db).createSession({
              ...configuration,
              rawClientId: randomUUID(),
              knownCredentials: [created],
            });
          if (completeFirst) {
            const race = await orderedRace(f, created, complete, create);
            assert.ok(race.first.ok && race.second.ok);
          } else {
            const race = await orderedRace(f, created, create, complete);
            assert.ok(
              !race.first.ok &&
                race.first.error instanceof ExistingAttemptError,
            );
            assert.ok(race.second.ok);
          }
        }
        const created = await f.create();
        const race = await orderedRace(
          f,
          created,
          (db) =>
            createAssessmentService(db).deleteSession({
              ...created,
              expectedState: DELETE_EXPECTATION.UNFINISHED,
            }),
          (db) =>
            createAssessmentService(db).createSession({
              ...configuration,
              rawClientId: randomUUID(),
              knownCredentials: [created],
            }),
        );
        assert.ok(race.first.ok && race.second.ok);
      },
    );
    await t.test(
      "oppositely ordered lists acquire all known parents in deterministic ID order",
      async () => {
        const first = await f.create();
        const second = await f.create();
        const ordered = [first, second].sort((a, b) =>
          a.sessionId.localeCompare(b.sessionId),
        );
        const race = await orderedRace(
          f,
          ordered[0]!,
          (db) =>
            createAssessmentService(db).createSession({
              ...configuration,
              rawClientId: randomUUID(),
              knownCredentials: ordered,
            }),
          (db) =>
            createAssessmentService(db).createSession({
              ...configuration,
              rawClientId: randomUUID(),
              knownCredentials: [...ordered].reverse(),
            }),
        );
        for (const result of [race.first, race.second]) {
          assert.ok(!result.ok && result.error instanceof ExistingAttemptError);
          assert.equal(result.error.blockers.length, 2);
        }
      },
    );
  },
);

test(
  "lock-wait deadline checks use clock_timestamp, not transaction-start now",
  options,
  async (t) => {
    const f = await setup(t);
    // A holder installs a cutoff at a clock barrier after the request has begun.
    const cases = [
      {
        hours: 24,
        complete: false,
        run: (db: Db, c: SessionCredential, id: string) =>
          createAssessmentService(db).submitAnswer(c.sessionId, {
            ...c,
            questionId: id,
            selectedAnswer: 2,
            timeSpentSeconds: 1,
          }),
      },
      {
        hours: 24,
        complete: false,
        run: (db: Db, c: SessionCredential) =>
          createAssessmentService(db).completeSession(c.sessionId, c),
      },
      {
        hours: 24,
        complete: false,
        run: (db: Db, c: SessionCredential) =>
          createAssessmentService(db).resumeSession(c),
      },
      {
        hours: 168,
        complete: true,
        run: (db: Db, c: SessionCredential) =>
          createAssessmentService(db).submitSurvey(c.sessionId, {
            ...c,
            rating: 3,
          }),
      },
      {
        hours: 168,
        complete: true,
        run: (db: Db, c: SessionCredential) =>
          createAssessmentService(db).completeSession(c.sessionId, c),
      },
    ];
    for (const entry of cases) {
      const created = await f.create();
      await answerAll(f, created);
      if (entry.complete)
        await f.service.completeSession(created.sessionId, created);
      const holder = await f.connect();
      const waiter = await f.connect();
      const ready = deferred();
      const release = deferred();
      const holding = holder.db.transaction(async (tx) => {
        await tx
          .select()
          .from(testSessions)
          .where(eq(testSessions.id, created.sessionId))
          .for("update");
        ready.resolve();
        await release.promise;
        // Establish expiry AFTER the waiter started. A stale now() would wrongly allow it.
        await tx
          .update(testSessions)
          .set({
            createdAt: sql`clock_timestamp() - ${entry.hours} * interval '1 hour'`,
          })
          .where(eq(testSessions.id, created.sessionId));
      });
      await ready.promise;
      const result = settled<unknown>(
        entry.run(waiter.db, created, created.questions[0]!.id),
      );
      try {
        await f.waitForBlocked(waiter.pid);
      } finally {
        release.resolve();
        await holding;
      }
      const outcome = await result;
      if (entry.run === cases[2]!.run) {
        assert.ok(
          outcome.ok &&
            typeof outcome.value === "object" &&
            outcome.value !== null &&
            "kind" in outcome.value,
        );
        assert.equal(outcome.value.kind, SESSION_VIEW.ATTEMPT_EXPIRED);
      } else {
        assert.ok(!outcome.ok);
        errorCode(
          entry.hours === 24
            ? ERROR_CODE.ATTEMPT_EXPIRED
            : ERROR_CODE.ACCESS_EXPIRED,
        )(outcome.error);
      }
    }
  },
);

test(
  "read-only repeatable-read views remain coherent across concurrent cascade deletion",
  options,
  async (t) => {
    const f = await setup(t);
    for (const completed of [false, true]) {
      const created = await f.create();
      await answerAll(f, created);
      if (completed) {
        await f.service.completeSession(created.sessionId, created);
        await f.service.submitSurvey(created.sessionId, {
          ...created,
          rating: 4,
        });
      }
      const expected = await f.service.getSession(created);
      const holder = await f.connect();
      const reader = await f.connect();
      const ready = deferred();
      const release = deferred();
      const deleting = holder.db.transaction(async (tx) => {
        await tx
          .select()
          .from(testSessions)
          .where(eq(testSessions.id, created.sessionId))
          .for("update");
        // The view reads the parent first, then stops on this child relation.
        await tx.execute(
          completed
            ? sql`LOCK TABLE session_surveys IN ACCESS EXCLUSIVE MODE`
            : sql`LOCK TABLE session_answers IN ACCESS EXCLUSIVE MODE`,
        );
        ready.resolve();
        await release.promise;
        await tx
          .delete(testSessions)
          .where(eq(testSessions.id, created.sessionId));
      });
      await ready.promise;
      const reading = settled(
        createAssessmentService(reader.db).getSession(created),
      );
      try {
        await f.waitForBlocked(reader.pid);
      } finally {
        release.resolve();
        await deleting;
      }
      const outcome = await reading;
      assert.ok(outcome.ok);
      assert.deepEqual(outcome.value, expected);
      await assert.rejects(
        f.service.getSession(created),
        errorCode(ERROR_CODE.NOT_FOUND),
      );
    }
  },
);
