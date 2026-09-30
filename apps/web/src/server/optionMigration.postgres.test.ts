import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { eq, sql } from "drizzle-orm";

import type { TestContext } from "node:test";
import type { Db } from "@/db/client";

import {
  questions,
  sessionAnswers,
  sessionCategoryScores,
  sessionResults,
  sessionSurveys,
  skillCategories,
  testSessions,
} from "@/db/schema";
import { seedContent } from "@/db/seedContent";
import { seedQuestions } from "@/db/seedData";
import { OPTION_ID_MAX, SESSION_VIEW } from "@/domain/constants";
import { createAssessmentService } from "./assessmentService";
import {
  bankOptions,
  bankRows,
  pillars,
  sessionRow,
  snapshotV1,
} from "./__tests__/optionIdCases";
import { createPostgresFixture } from "./__tests__/postgresFixture";

const testOptions = {
  skip:
    process.env.TEST_DATABASE_URL === undefined
      ? "Set TEST_DATABASE_URL explicitly to run PostgreSQL integration tests"
      : false,
  timeout: 30_000,
};
const legacyOptions = ["A", " B ", "C", "D"];

async function setup(t: TestContext) {
  const fixture = await createPostgresFixture(t);
  await fixture.db.insert(skillCategories).values(
    pillars.map((pillar) => ({
      name: pillar.skillCategory,
      displayName: pillar.displayName,
      pillarOrder: pillar.order,
    })),
  );
  const migration = await readFile(
    new URL("../../drizzle/0003_stable_option_ids.sql", import.meta.url),
    "utf8",
  );
  return { ...fixture, migration };
}

async function replay(db: Db, migration: string) {
  await db.transaction((tx) => tx.execute(sql.raw(migration)));
}

async function bankState(db: Db) {
  // Text preserves JSONB numeric spelling and extra object fields as well as
  // every column/timestamp; ordinary JS decoding would erase numeric scale.
  const rows = await db.execute<{ content: string }>(sql`
    SELECT to_jsonb(q)::text AS content FROM questions AS q ORDER BY id
  `);
  return rows.map((row) => row.content);
}

async function historicalState(db: Db) {
  return {
    sessions: await db.select().from(testSessions).orderBy(testSessions.id),
    answers: await db
      .select()
      .from(sessionAnswers)
      .orderBy(sessionAnswers.questionId),
    results: await db.select().from(sessionResults).orderBy(sessionResults.id),
    scores: await db
      .select()
      .from(sessionCategoryScores)
      .orderBy(sessionCategoryScores.skillCategory),
    surveys: await db.select().from(sessionSurveys).orderBy(sessionSurveys.id),
  };
}

function isValidationError(error: unknown) {
  // Drizzle wraps the PostgreSQL error. Require our deliberate failure, not a
  // JSON shape/cast error that happens to reject the migration too.
  while (error instanceof Error) {
    if ("code" in error) {
      assert.equal(error.code, "P0001");
      assert.match(
        error.message,
        /stable_option_ids: invalid question migration-invalid:/,
      );
      return true;
    }
    error = error.cause;
  }
  assert.fail("Expected the migration's PostgreSQL validation error");
}

test(
  "migration and real reseeding preserve all 144 seed identities and frozen V1 history",
  testOptions,
  async (t) => {
    const { db, migration } = await setup(t);
    assert.equal(seedQuestions.length, 144);
    for (const question of seedQuestions) {
      assert.deepEqual(
        question.options.map((option) => option.id),
        [0, 1, 2, 3],
      );
    }
    await db.insert(questions).values(
      seedQuestions.map((question, index) => ({
        ...question,
        options: sql`${JSON.stringify(question.options.map((option) => option.text))}::jsonb`,
        isActive: index % 2 === 0,
        createdAt: new Date("2024-01-02T03:04:05Z"),
        updatedAt: new Date("2024-02-03T04:05:06Z"),
      })),
    );
    const canonicalId = "already-canonical";
    const canonicalOptions =
      '[{"id":2147483647,"text":"  Maximum  ","extra":true},{"id":0,"text":"Zero"},{"id":7.0,"text":"Seven"},{"id":42,"text":"Forty-two"}]';
    await db.insert(questions).values({
      ...bankRows()[0]!,
      id: canonicalId,
      options: sql`${canonicalOptions}::jsonb`,
      correctOptionId: OPTION_ID_MAX,
      isActive: false,
    });
    const canonicalBefore = await db
      .select({ content: sql<string>`to_jsonb(questions)::text` })
      .from(questions)
      .where(eq(questions.id, canonicalId));
    const before = await db.select().from(questions).orderBy(questions.id);

    // Frozen historical validation permits three options and blank text. Tie
    // the saved questions to seed IDs so reseeding really replaces their bank
    // content, while grading/report text must still come from the V1 snapshot.
    const snapshot = snapshotV1();
    for (const question of snapshot.questions) {
      const seed = seedQuestions.find(
        (row) =>
          row.difficulty === question.difficulty &&
          row.skillCategory === question.skillCategory &&
          row.difficultyWeight === question.difficultyWeight,
      );
      assert.ok(seed);
      question.id = seed.id;
      question.options = ["", "Saved B", "Saved C"];
    }
    const session = {
      ...sessionRow(snapshot),
      selectedQuestionIds: snapshot.questions.map((question) => question.id),
    };
    await db.insert(testSessions).values(session);
    const credential = {
      sessionId: session.id,
      sessionToken: session.sessionToken,
    };
    const service = createAssessmentService(db);
    for (const questionId of session.selectedQuestionIds) {
      await service.submitAnswer(session.id, {
        ...credential,
        questionId,
        selectedOptionId: 2,
        timeSpentSeconds: 3,
      });
    }
    const report = await service.completeSession(session.id, credential);
    assert.equal(report.kind, SESSION_VIEW.REPORT);
    assert.equal(report.reportSnapshot.version, 1);
    assert.equal(report.reportSnapshot.result.totalScore, 100);
    assert.deepEqual(report.reportSnapshot.questions[0]!.options, [
      "",
      "Saved B",
      "Saved C",
    ]);
    await service.submitSurvey(session.id, { ...credential, rating: 4 });
    const history = await historicalState(db);
    assert.deepEqual(history.sessions[0]!.questionSnapshot, snapshot);
    assert.equal(history.answers.length, snapshot.questions.length);
    assert.ok(
      history.answers.every(
        (answer) => answer.selectedOptionId === 2 && answer.isCorrect,
      ),
    );
    assert.equal(history.scores.length, pillars.length);

    await replay(db, migration);
    const authoredById = new Map(
      seedQuestions.map((question) => [question.id, question]),
    );
    const converted = await db.select().from(questions).orderBy(questions.id);
    assert.deepEqual(
      converted,
      before.map((row) => ({
        ...row,
        options: authoredById.get(row.id)?.options ?? row.options,
      })),
    );
    for (const row of converted) {
      const authored = authoredById.get(row.id);
      if (!authored) continue;
      assert.equal(
        row.options.find((option) => option.id === row.correctOptionId)?.text,
        authored.options.find(
          (option) => option.id === authored.correctOptionId,
        )?.text,
      );
    }
    assert.deepEqual(await historicalState(db), history);
    const migrated = await bankState(db);
    await replay(db, migration);
    assert.deepEqual(await bankState(db), migrated);
    assert.deepEqual(await historicalState(db), history);

    // All authored IDs currently equal their original positions. Reorder one
    // real seeder input to ensure this regression detects regenerating IDs from
    // positions. Restore the exported content even if an assertion fails.
    const original = seedQuestions[0]!;
    seedQuestions[0] = {
      ...original,
      options: [...original.options].reverse(),
    };
    try {
      for (let pass = 0; pass < 2; pass++) {
        assert.deepEqual(await seedContent(db), {
          categories: pillars.length,
          questions: 144,
        });
        const reseeded = new Map(
          (await db.select().from(questions)).map((row) => [row.id, row]),
        );
        for (const authored of seedQuestions) {
          const row = reseeded.get(authored.id);
          assert.ok(row);
          assert.deepEqual(row.options, authored.options);
          assert.equal(row.correctOptionId, authored.correctOptionId);
          assert.equal(row.isActive, true);
        }
        assert.deepEqual(await historicalState(db), history);
      }
    } finally {
      seedQuestions[0] = original;
    }
    assert.deepEqual(
      await db
        .select({ content: sql<string>`to_jsonb(questions)::text` })
        .from(questions)
        .where(eq(questions.id, canonicalId)),
      canonicalBefore,
    );
    const retrieved = await service.getSession(credential, {
      legacyClient: true,
    });
    assert.equal(retrieved.kind, SESSION_VIEW.REPORT);
    assert.deepEqual(retrieved.reportSnapshot, report.reportSnapshot);
    const retried = await service.completeSession(session.id, credential);
    assert.equal(retried.kind, SESSION_VIEW.REPORT);
    assert.deepEqual(retried.reportSnapshot, report.reportSnapshot);
    assert.deepEqual(await historicalState(db), history);
  },
);

test(
  "malformed inactive and active bank rows abort the whole migration and roll back its transaction",
  testOptions,
  async (t) => {
    const { db, migration } = await setup(t);
    const valid = { ...bankRows()[0]!, id: "migration-legacy" };
    const invalidId = "migration-invalid";
    await db.insert(questions).values([
      {
        ...valid,
        options: sql`${JSON.stringify(legacyOptions)}::jsonb`,
        correctOptionId: 2,
      },
      { ...valid, id: invalidId, isActive: false },
    ]);
    const canonical = (replacement: unknown) => [
      replacement,
      ...bankOptions.slice(1),
    ];
    const cases: {
      label: string;
      options: unknown;
      correctOptionId?: number;
      active?: boolean;
      raw?: string;
    }[] = [
      ...[null, {}, "not an array", 1, true].map((value) => ({
        label: `shape ${JSON.stringify(value)}`,
        options: value,
      })),
      ...[[], legacyOptions.slice(0, 3), [...legacyOptions, "E"]].map(
        (value) => ({
          label: `legacy count ${value.length}`,
          options: value,
          correctOptionId: 2,
        }),
      ),
      ...[
        bankOptions.slice(0, 3),
        [...bankOptions, { id: 8, text: "Fifth" }],
      ].map((value) => ({
        label: `canonical count ${value.length}`,
        options: value,
      })),
      {
        label: "legacy negative key",
        options: legacyOptions,
        correctOptionId: -1,
      },
      {
        label: "legacy key past end",
        options: legacyOptions,
        correctOptionId: 4,
      },
      {
        label: "canonical key is a position, not a member",
        options: bankOptions,
        correctOptionId: 2,
      },
      {
        label: "canonical negative key",
        options: bankOptions,
        correctOptionId: -1,
      },
      { label: "mixed, string first", options: ["A", ...bankOptions.slice(1)] },
      {
        label: "mixed, object first",
        options: [bankOptions[0], "B", "C", "D"],
      },
      {
        label: "null element",
        options: ["A", "B", null, "D"],
        correctOptionId: 2,
      },
      { label: "numeric elements", options: [0, 1, 2, 3], correctOptionId: 2 },
      {
        label: "duplicate IDs",
        options: canonical({ id: 7, text: "Duplicate" }),
      },
      { label: "missing ID", options: canonical({ text: "Missing" }) },
      { label: "missing text", options: canonical({ id: 42 }) },
      ...[
        -1,
        1.5,
        OPTION_ID_MAX + 1,
        1e100,
        "42",
        "invalid",
        null,
        true,
        {},
        [],
      ].map((id) => ({
        label: `ID ${JSON.stringify(id)}`,
        options: canonical({ id, text: "Distractor" }),
      })),
      ...["", " \t\r\n", "\u00a0\ufeff", null, 7, {}, []].map((text) => ({
        label: `text ${JSON.stringify(text)}`,
        options: canonical({ id: 42, text }),
      })),
      ...["", " \t\n", "\u2003\u2028\u3000"].map((text) => ({
        label: `legacy blank ${JSON.stringify(text)}`,
        options: ["A", "B", "C", text],
        correctOptionId: 2,
      })),
      { label: "active malformed row", options: null, active: true },
      {
        label: "fraction must not round into an integer",
        options: null,
        raw: '[{"id":2147483646.9999999999,"text":"Fraction"},{"id":7,"text":"B"},{"id":100,"text":"C"},{"id":9,"text":"D"}]',
      },
    ];
    for (const entry of cases) {
      await t.test(entry.label, async () => {
        await db
          .update(questions)
          .set({
            options: sql`${entry.raw ?? JSON.stringify(entry.options)}::jsonb`,
            correctOptionId: entry.correctOptionId ?? 100,
            isActive: entry.active ?? false,
          })
          .where(eq(questions.id, invalidId));
        const before = await bankState(db);
        await assert.rejects(
          db.transaction(async (tx) => {
            await tx
              .update(questions)
              .set({ title: "Must roll back" })
              .where(eq(questions.id, valid.id));
            await tx.execute(sql.raw(migration));
          }),
          isValidationError,
        );
        assert.deepEqual(await bankState(db), before);
      });
    }
    // Current constraints forbid SQL NULL, but validation must not silently
    // accept it if an older/drifted bank lacks those constraints. DDL rolls back.
    for (const column of ["options", "correct_answer"]) {
      await t.test(`SQL NULL ${column}`, async () => {
        const before = await bankState(db);
        await assert.rejects(
          db.transaction(async (tx) => {
            await tx.execute(
              sql`ALTER TABLE questions ALTER COLUMN ${sql.identifier(column)} DROP NOT NULL`,
            );
            await tx
              .update(questions)
              .set({ options: bankOptions, correctOptionId: 100 })
              .where(eq(questions.id, invalidId));
            await tx.execute(
              sql`UPDATE questions SET ${sql.identifier(column)} = NULL WHERE id = ${invalidId}`,
            );
            await tx.execute(sql.raw(migration));
          }),
          isValidationError,
        );
        assert.deepEqual(await bankState(db), before);
      });
    }
    await db
      .update(questions)
      .set({ options: bankOptions, correctOptionId: 100 })
      .where(eq(questions.id, invalidId));
    await replay(db, migration);
    const [converted] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, valid.id));
    assert.deepEqual(converted!.options, [
      { id: 0, text: "A" },
      { id: 1, text: " B " },
      { id: 2, text: "C" },
      { id: 3, text: "D" },
    ]);
  },
);

test(
  "migration holds a table write lock until commit even when every row is already canonical",
  testOptions,
  async (t) => {
    const { db, migration, connect, waitForBlocked } = await setup(t);
    const row = bankRows()[0]!;
    await db.insert(questions).values(row);
    const migrating = await connect();
    const writer = await connect();
    let write: Promise<unknown> | undefined;
    try {
      await migrating.db.transaction(async (tx) => {
        await tx.execute(sql.raw(migration));
        write = writer.db
          .update(questions)
          .set({ title: "Written after migration commit" })
          .where(eq(questions.id, row.id))
          .then(
            () => null,
            (error: unknown) => error,
          );
        await waitForBlocked(writer.pid);
      });
    } finally {
      // Await the contender after releasing the migration transaction, including
      // assertion failures, so fixture cleanup never races a pending write.
      if (write) assert.equal(await write, null);
    }
    const [written] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, row.id));
    assert.equal(written!.title, "Written after migration commit");
  },
);
