import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { TestContext } from "node:test";
import type { SQL } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import type { SessionCredential } from "@/domain/sessionContracts";

import {
  questions,
  sessionAnswers,
  sessionCategoryScores,
  sessionResults,
  sessionSurveys,
  skillCategories,
  testSessions,
} from "@/db/schema";
import { seedQuestions } from "@/db/seedData";
import {
  DIFFICULTY,
  FRAMEWORK,
  SESSION_DISCOVERY,
  SESSION_STATUS,
  SESSION_STATUSES,
  SKILL_CATEGORIES,
} from "@/domain/constants";
import { createAssessmentService } from "./assessmentService";
import { AssessmentError, ERROR_CODE } from "./errors";
import { runSessionMaintenance } from "./sessionMaintenance";
import { createPostgresFixture } from "./__tests__/postgresFixture";

const options = {
  skip:
    process.env.TEST_DATABASE_URL === undefined
      ? "Set TEST_DATABASE_URL explicitly to run PostgreSQL integration tests"
      : false,
  timeout: 60_000,
};
const dialect = new PgDialect();
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function settled<T extends Promise<unknown>>(promise: T) {
  return Promise.resolve(promise).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
function errorCode(code: AssessmentError["code"]) {
  return (error: unknown) => {
    assert.ok(error instanceof AssessmentError);
    assert.equal(error.code, code);
    return true;
  };
}

/** Observe real transactions; never replace the production DB clock or SQL. */
function observeDb(
  db: Db,
  hooks: {
    before?: (text: string, tx: Transaction) => Promise<void>;
    after?: (text: string, rows: unknown, tx: Transaction) => Promise<void>;
  },
) {
  return new Proxy(db, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      return (
        work: Parameters<Db["transaction"]>[0],
        config: Parameters<Db["transaction"]>[1],
      ) =>
        target.transaction(
          (tx) =>
            work(
              new Proxy(tx, {
                get(transaction, member, transactionReceiver) {
                  if (member !== "execute")
                    return Reflect.get(
                      transaction,
                      member,
                      transactionReceiver,
                    );
                  return async (query: SQL) => {
                    const text = dialect.sqlToQuery(query).sql;
                    await hooks.before?.(text, transaction);
                    const rows = await transaction.execute(query);
                    await hooks.after?.(text, rows, transaction);
                    return rows;
                  };
                },
              }),
            ),
          config,
        );
    },
  });
}
async function insertRows(
  db: Db,
  count: number,
  fields: {
    status?: (typeof SESSION_STATUSES)[number];
    createdAt?: SQL;
    lastActivityAt?: SQL;
  } = {},
) {
  const rows = Array.from({ length: count }, () => ({
    id: randomUUID(),
    sessionToken: randomBytes(32).toString("hex"),
    clientId: randomBytes(32).toString("hex"),
    framework: FRAMEWORK.REACT,
    targetLevel: DIFFICULTY.MID,
    selectedQuestionIds: [],
    ...fields,
  }));
  await db.insert(testSessions).values(rows);
  return rows.map((row) => ({
    sessionId: row.id,
    sessionToken: row.sessionToken,
  }));
}
async function session(db: Db, credential: SessionCredential) {
  const [row] = await db
    .select()
    .from(testSessions)
    .where(eq(testSessions.id, credential.sessionId));
  return row;
}
async function setup(t: TestContext) {
  const f = await createPostgresFixture(t);
  await f.db.insert(skillCategories).values(
    SKILL_CATEGORIES.map((name, index) => ({
      name,
      displayName: name,
      pillarOrder: index,
    })),
  );
  await f.db.insert(questions).values(seedQuestions);
  const service = createAssessmentService(f.db);
  const create = () =>
    service.createSession({
      framework: FRAMEWORK.REACT,
      targetLevel: DIFFICULTY.MID,
      questionCount: 8,
      rawClientId: randomUUID(),
    });
  const answerAll = async (credential: SessionCredential) => {
    const row = await session(f.db, credential);
    assert.ok(row);
    for (const questionId of row.selectedQuestionIds) {
      await service.submitAnswer(credential.sessionId, {
        sessionToken: credential.sessionToken,
        questionId,
        selectedAnswer: 0,
        timeSpentSeconds: 1,
      });
    }
  };
  return { ...f, service, create, answerAll };
}

test(
  "maintenance exact DB-clock cutoffs: all statuses, microseconds, original creation, retained idle only",
  options,
  async (t) => {
    const f = await createPostgresFixture(t);
    const old: SessionCredential[] = [];
    const exact: SessionCredential[] = [];
    const younger: SessionCredential[] = [];
    for (const status of SESSION_STATUSES) {
      old.push(...(await insertRows(f.db, 1, { status })));
      exact.push(...(await insertRows(f.db, 1, { status })));
      younger.push(...(await insertRows(f.db, 1, { status })));
    }
    const [idleExact, idleYounger, idleOlder] = await insertRows(f.db, 3);
    assert.ok(idleExact && idleYounger && idleOlder);
    let captures = 0;
    let fixed: { deletion: string; abandonment: string } | undefined;
    const instrumented = observeDb(f.db, {
      after: async (text, rows, tx) => {
        if (!text.includes("WITH reference")) return;
        captures++;
        assert.ok(Array.isArray(rows));
        fixed = rows[0] as { deletion: string; abandonment: string };
        // These timestamps derive from the actual clock SELECT of this invocation,
        // not application wall time, transaction-start now(), or a guessed delay.
        for (const [group, offset] of [
          [old, -1],
          [exact, 0],
          [younger, 1],
        ] as const) {
          for (const credential of group) {
            await tx
              .update(testSessions)
              .set({
                createdAt: sql`${fixed.deletion}::timestamptz + ${offset} * interval '1 microsecond'`,
                lastActivityAt: sql`clock_timestamp()`,
                completedAt: sql`clock_timestamp()`,
              })
              .where(eq(testSessions.id, credential.sessionId));
          }
        }
        await tx
          .update(testSessions)
          .set({
            lastActivityAt: sql`${fixed.abandonment}::timestamptz - interval '1 microsecond'`,
          })
          .where(
            sql`created_at > ${fixed.deletion}::timestamptz AND status <> ${SESSION_STATUS.IN_PROGRESS}`,
          );
        for (const [credential, offset] of [
          [idleOlder, -1],
          [idleExact, 0],
          [idleYounger, 1],
        ] as const) {
          await tx
            .update(testSessions)
            .set({
              lastActivityAt: sql`${fixed.abandonment}::timestamptz + ${offset} * interval '1 microsecond'`,
            })
            .where(eq(testSessions.id, credential.sessionId));
        }
      },
    });
    const result = await runSessionMaintenance(instrumented);
    assert.equal(captures, 1);
    assert.equal(result.ok, true);
    assert.equal(result.deletion.count, 6);
    assert.equal(result.abandonment.count, 2);
    for (const credential of [...old, ...exact])
      assert.equal(await session(f.db, credential), undefined);
    for (let i = 0; i < younger.length; i++)
      assert.equal(
        (await session(f.db, younger[i]!))?.status,
        SESSION_STATUSES[i],
      );
    assert.equal(
      (await session(f.db, idleExact))?.status,
      SESSION_STATUS.ABANDONED,
    );
    assert.equal(
      (await session(f.db, idleOlder))?.status,
      SESSION_STATUS.ABANDONED,
    );
    assert.equal(
      (await session(f.db, idleYounger))?.status,
      SESSION_STATUS.IN_PROGRESS,
    );
    assert.equal(result.deletion.backlog, false);
    assert.equal(result.abandonment.backlog, false);
  },
);

test(
  "maintenance cascades private snapshots, answers, results, pillars and surveys without bank deletion",
  options,
  async (t) => {
    const f = await setup(t);
    const created = await f.create();
    await f.answerAll(created);
    await f.service.completeSession(created.sessionId, {
      sessionToken: created.sessionToken,
    });
    await f.service.submitSurvey(created.sessionId, {
      sessionToken: created.sessionToken,
      rating: 5,
    });
    assert.ok((await session(f.db, created))?.questionSnapshot);
    const [award] = await f.db
      .select()
      .from(sessionResults)
      .where(eq(sessionResults.sessionId, created.sessionId));
    assert.ok(award?.reportSnapshot);
    await f.db
      .update(testSessions)
      .set({ createdAt: sql`clock_timestamp() - interval '8 days'` })
      .where(eq(testSessions.id, created.sessionId));
    const younger = await f.create();
    const result = await runSessionMaintenance(f.db);
    assert.equal(result.deletion.count, 1);
    assert.equal(await session(f.db, created), undefined);
    assert.ok(await session(f.db, younger));
    for (const table of [
      sessionAnswers,
      sessionResults,
      sessionCategoryScores,
      sessionSurveys,
    ]) {
      assert.equal(
        (
          await f.db
            .select()
            .from(table)
            .where(eq(table.sessionId, created.sessionId))
        ).length,
        0,
      );
    }
    assert.equal(
      (await f.db.select().from(questions)).length,
      seedQuestions.length,
    );
    assert.equal(
      (await f.db.select().from(skillCategories)).length,
      SKILL_CATEGORIES.length,
    );
  },
);

test(
  "maintenance bounded capacity, oldest-first order, missed-run catch-up and idempotent retry",
  options,
  async (t) => {
    const f = await createPostgresFixture(t);
    const oldest = await insertRows(f.db, 1000, {
      createdAt: sql`clock_timestamp() - interval '30 days'`,
    });
    const remaining = await insertRows(f.db, 1, {
      createdAt: sql`clock_timestamp() - interval '8 days'`,
    });
    await insertRows(f.db, 1001, {
      lastActivityAt: sql`clock_timestamp() - interval '31 minutes'`,
    });
    const first = await runSessionMaintenance(f.db);
    assert.equal(first.ok, true);
    for (const operation of [first.deletion, first.abandonment]) {
      assert.equal(operation.count, 1000);
      assert.equal(operation.batches, 5);
      assert.equal(operation.cap, "batch_limit");
      assert.equal(operation.backlog, true);
    }

    assert.equal(await session(f.db, oldest[999]!), undefined);
    for (const credential of remaining)
      assert.ok(await session(f.db, credential));
    const second = await runSessionMaintenance(f.db);
    assert.equal(second.deletion.count, 1);
    assert.equal(second.abandonment.count, 1);
    assert.equal(second.deletion.backlog, false);
    assert.equal(second.abandonment.backlog, false);
    const retry = await runSessionMaintenance(f.db);
    assert.equal(retry.deletion.count, 0);
    assert.equal(retry.abandonment.count, 0);
  },
);

test(
  "maintenance overlaps on independent backends; short SKIP LOCKED batches still report locked backlog",
  options,
  async (t) => {
    const f = await createPostgresFixture(t);
    await insertRows(f.db, 401, {
      createdAt: sql`clock_timestamp() - interval '8 days'`,
    });
    const a = await f.connect();
    const b = await f.connect();
    assert.notEqual(a.pid, b.pid);
    const locked = deferred();
    const release = deferred();
    let held = false;
    const instrumented = observeDb(a.db, {
      after: async (text) => {
        if (text.includes("DELETE FROM") && !held) {
          held = true;
          locked.resolve();
          await release.promise;
        }
      },
    });
    const first = settled(runSessionMaintenance(instrumented));
    await locked.promise;
    let second;
    try {
      second = await runSessionMaintenance(b.db);
      assert.equal(second.ok, true);
      assert.equal(second.deletion.count, 201);
      assert.equal(second.deletion.cap, null);
      assert.equal(second.deletion.backlog, true);
    } finally {
      release.resolve();
    }
    const completed = await first;
    assert.equal(completed.ok, true);

    assert.equal(completed.value.deletion.count + second.deletion.count, 401);
    assert.equal((await f.db.select().from(testSessions)).length, 0);
  },
);

test(
  "cascade lock timeout rolls back only the failing batch, preserves earlier commits, permits retry",
  options,
  async (t) => {
    const f = await setup(t);
    const rows: SessionCredential[] = await insertRows(f.db, 198, {
      createdAt: sql`clock_timestamp() - interval '30 days'`,
    });
    for (let index = 0; index < 5; index++) {
      const created = await f.create();
      await f.service.submitAnswer(created.sessionId, {
        sessionToken: created.sessionToken,
        questionId: created.questions[0]!.id,
        selectedAnswer: 0,
        timeSpentSeconds: 1,
      });
      await f.db
        .update(testSessions)
        .set({
          createdAt: sql`clock_timestamp() - ${15 - index} * interval '24 hours'`,
        })
        .where(eq(testSessions.id, created.sessionId));
      rows.push(created);
    }
    const idle = (
      await insertRows(f.db, 1, {
        lastActivityAt: sql`clock_timestamp() - interval '31 minutes'`,
      })
    )[0]!;
    const holder = await f.connect();
    const worker = await f.connect();
    const locked = deferred();
    const release = deferred();
    const holding = holder.db.transaction(async (tx) => {
      await tx
        .select()
        .from(sessionAnswers)
        .where(eq(sessionAnswers.sessionId, rows[201]!.sessionId))
        .for("update");
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    try {
      const pending = runSessionMaintenance(worker.db);
      await f.waitForBlocked(worker.pid);
      const result = await pending;
      assert.equal(result.ok, false);
      assert.equal(result.deletion.failure, "lock_timeout");
      assert.equal(result.deletion.count, 200);
      assert.equal(result.deletion.batches, 1);
      assert.equal(result.deletion.backlog, true);
      assert.equal(result.abandonment.count, 1);
      assert.equal(await session(f.db, rows[0]!), undefined);
      assert.equal(await session(f.db, rows[199]!), undefined);
      for (const credential of rows.slice(200))
        assert.ok(await session(f.db, credential));
      assert.equal(
        (await session(f.db, idle))?.status,
        SESSION_STATUS.ABANDONED,
      );
      assert.equal(
        (
          await f.db
            .select()
            .from(sessionAnswers)
            .where(eq(sessionAnswers.sessionId, rows[200]!.sessionId))
        ).length,
        1,
      );
    } finally {
      release.resolve();
      await holding;
    }
    const retried = await runSessionMaintenance(worker.db);
    assert.equal(retried.deletion.count, 3);
    assert.equal(retried.deletion.backlog, false);
  },
);

test(
  "statement timeout rolls back an interrupted batch and is local to the transaction",
  options,
  async (t) => {
    const f = await createPostgresFixture(t);
    await insertRows(f.db, 1, {
      createdAt: sql`clock_timestamp() - interval '8 days'`,
    });
    // An interruptible CPU loop, not a timing sleep or an unbounded client promise.
    await f.db
      .execute(sql`CREATE FUNCTION maintenance_test_spin() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN LOOP PERFORM 1; END LOOP; END $$`);
    await f.db
      .execute(sql`CREATE TRIGGER maintenance_test_spin BEFORE DELETE ON test_sessions
    FOR EACH ROW EXECUTE FUNCTION maintenance_test_spin()`);
    const worker = await f.connect();
    const result = await runSessionMaintenance(worker.db);
    assert.equal(result.ok, false);
    assert.equal(result.deletion.failure, "statement_timeout");
    assert.equal(result.deletion.count, 0);
    assert.equal(result.deletion.backlog, true);
    const [settings] = await worker.db.execute<{
      statement: string;
      lock: string;
    }>(sql`
    SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock`);
    assert.equal(settings?.statement, "5s");
    assert.equal(settings.lock, "2s");
    await f.db.execute(
      sql`DROP TRIGGER maintenance_test_spin ON test_sessions`,
    );
    assert.equal((await runSessionMaintenance(worker.db)).deletion.count, 1);
  },
);

test(
  "backlog existence check uses DB timeouts and reports unknown, never false",
  options,
  async (t) => {
    const f = await createPostgresFixture(t);
    const holder = await f.connect();
    const worker = await f.connect();
    const locked = deferred();
    const release = deferred();
    const holding = holder.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(714241)`);
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    let waited = false;
    const observed = observeDb(worker.db, {
      before: async (text, tx) => {
        if (text.includes("AS backlog") && !waited) {
          waited = true;
          await tx.execute(sql`SELECT pg_advisory_xact_lock(714241)`);
        }
      },
    });
    try {
      const pending = runSessionMaintenance(observed);
      await f.waitForBlocked(worker.pid);
      const result = await pending;
      assert.equal(result.ok, false);
      assert.equal(result.deletion.backlog, null);
      assert.equal(result.deletion.backlogFailure, "lock_timeout");
      assert.equal(result.abandonment.backlog, false);
    } finally {
      release.resolve();
      await holding;
    }
  },
);

for (const action of ["resume", "answer"] as const) {
  test(
    `idle sweep skips a locked ${action}; committed activity is not overwritten on retry`,
    options,
    async (t) => {
      const f = await setup(t);
      const created = await f.create();
      await f.db
        .update(testSessions)
        .set({ lastActivityAt: sql`clock_timestamp() - interval '31 minutes'` })
        .where(eq(testSessions.id, created.sessionId));
      const original = await session(f.db, created);
      const holder = await f.connect();
      const writer = await f.connect();
      const worker = await f.connect();
      const locked = deferred();
      const release = deferred();
      const holding = holder.db.transaction(async (tx) => {
        await tx
          .select()
          .from(testSessions)
          .where(eq(testSessions.id, created.sessionId))
          .for("update");
        locked.resolve();
        await release.promise;
      });
      await locked.promise;
      const service = createAssessmentService(writer.db);
      const writing = settled(
        action === "resume"
          ? service.resumeSession(created)
          : service.submitAnswer(created.sessionId, {
              sessionToken: created.sessionToken,
              questionId: created.questions[0]!.id,
              selectedAnswer: 0,
              timeSpentSeconds: 1,
            }),
      );
      try {
        await f.waitForBlocked(writer.pid);
        const sweep = await runSessionMaintenance(worker.db);
        assert.equal(sweep.abandonment.count, 0);
        assert.equal(sweep.abandonment.backlog, true);
        assert.equal(sweep.abandonment.cap, null);
      } finally {
        release.resolve();
        await holding;
      }
      assert.equal((await writing).ok, true);
      assert.equal(
        (await runSessionMaintenance(worker.db)).abandonment.count,
        0,
      );
      const current = await session(f.db, created);
      assert.equal(current?.status, SESSION_STATUS.IN_PROGRESS);
      assert.deepEqual(current.createdAt, original?.createdAt);
      assert.ok(current.lastActivityAt > original!.lastActivityAt);
    },
  );

  test(
    `${action} waits for an idle sweep commit and safely revives the same attempt`,
    options,
    async (t) => {
      const f = await setup(t);
      const created = await f.create();
      await f.db
        .update(testSessions)
        .set({ lastActivityAt: sql`clock_timestamp() - interval '31 minutes'` })
        .where(eq(testSessions.id, created.sessionId));
      const original = await session(f.db, created);
      const worker = await f.connect();
      const writer = await f.connect();
      const locked = deferred();
      const release = deferred();
      let held = false;
      const instrumented = observeDb(worker.db, {
        after: async (text) => {
          if (text.includes("UPDATE test_sessions") && !held) {
            held = true;
            locked.resolve();
            await release.promise;
          }
        },
      });
      const sweeping = settled(runSessionMaintenance(instrumented));
      await locked.promise;
      const service = createAssessmentService(writer.db);
      const writing = settled(
        action === "resume"
          ? service.resumeSession(created)
          : service.submitAnswer(created.sessionId, {
              sessionToken: created.sessionToken,
              questionId: created.questions[0]!.id,
              selectedAnswer: 0,
              timeSpentSeconds: 1,
            }),
      );
      try {
        await f.waitForBlocked(writer.pid);
      } finally {
        release.resolve();
      }
      assert.equal((await sweeping).ok, true);
      assert.equal((await writing).ok, true);
      const current = await session(f.db, created);
      assert.equal(current?.status, SESSION_STATUS.IN_PROGRESS);
      assert.deepEqual(current.createdAt, original?.createdAt);
      assert.ok(current.lastActivityAt > original!.lastActivityAt);
    },
  );
}

test(
  "completion queued behind retention deletion cannot recreate an award or child rows",
  options,
  async (t) => {
    const f = await setup(t);
    const created = await f.create();
    await f.answerAll(created);
    await f.db
      .update(testSessions)
      .set({ createdAt: sql`clock_timestamp() - interval '8 days'` })
      .where(eq(testSessions.id, created.sessionId));
    const worker = await f.connect();
    const writer = await f.connect();
    const locked = deferred();
    const release = deferred();
    let held = false;
    const observed = observeDb(worker.db, {
      after: async (text) => {
        if (text.includes("DELETE FROM") && !held) {
          held = true;
          locked.resolve();
          await release.promise;
        }
      },
    });
    const sweeping = settled(runSessionMaintenance(observed));
    await locked.promise;
    const writing = settled(
      createAssessmentService(writer.db).completeSession(created.sessionId, {
        sessionToken: created.sessionToken,
      }),
    );
    try {
      await f.waitForBlocked(writer.pid);
    } finally {
      release.resolve();
    }
    assert.equal((await sweeping).ok, true);
    const completion = await writing;
    assert.equal(completion.ok, false);
    errorCode(ERROR_CODE.NOT_FOUND)(completion.error);
    assert.equal(await session(f.db, created), undefined);
    assert.equal((await f.db.select().from(sessionResults)).length, 0);
    assert.equal((await f.db.select().from(sessionAnswers)).length, 0);
  },
);

test(
  "missed/blocked cleanup never restores seven-day access or allows a late first completion",
  options,
  async (t) => {
    const f = await setup(t);
    const created = await f.create();
    await f.answerAll(created);
    await f.db
      .update(testSessions)
      .set({ createdAt: sql`clock_timestamp() - interval '9 days'` })
      .where(eq(testSessions.id, created.sessionId));
    await assert.rejects(
      f.service.getSession(created),
      errorCode(ERROR_CODE.ACCESS_EXPIRED),
    );
    await assert.rejects(
      f.service.completeSession(created.sessionId, {
        sessionToken: created.sessionToken,
      }),
      errorCode(ERROR_CODE.ACCESS_EXPIRED),
    );
    const discovered = await f.service.discoverSessions({
      credentials: [created],
    });
    assert.equal(discovered.sessions[0]?.kind, SESSION_DISCOVERY.UNAVAILABLE);
    assert.ok(await session(f.db, created));
    const holder = await f.connect();
    const worker = await f.connect();
    const locked = deferred();
    const release = deferred();
    const holding = holder.db.transaction(async (tx) => {
      await tx
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, created.sessionId))
        .for("update");
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    try {
      const result = await runSessionMaintenance(worker.db);
      assert.equal(result.deletion.count, 0);
      assert.equal(result.deletion.backlog, true);
      assert.equal(result.abandonment.count, 0);
      await assert.rejects(
        f.service.getSession(created),
        errorCode(ERROR_CODE.ACCESS_EXPIRED),
      );
    } finally {
      release.resolve();
      await holding;
    }
    assert.equal((await runSessionMaintenance(worker.db)).deletion.count, 1);
  },
);
