import assert from "node:assert/strict";
import { test } from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import type { SQL } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";

import { runSessionMaintenance } from "./sessionMaintenance";

const dialect = new PgDialect();
function fakeDb(execute: (text: string, params: unknown[]) => unknown) {
  const transactions: string[][] = [];
  const db = {
    transaction: async (work: (tx: Transaction) => Promise<unknown>) => {
      const statements: string[] = [];
      transactions.push(statements);
      return work({
        execute: async (query: SQL) => {
          const { sql: text, params } = dialect.sqlToQuery(query);
          statements.push(text);
          return execute(text, params);
        },
      } as unknown as Transaction);
    },
  } as unknown as Db;
  return { db, transactions };
}
const cutoffs = {
  deletion: "2026-01-01 12:00:00.123456+00",
  abandonment: "2026-01-08 11:30:00.123456+00",
};

test("runner captures one DB clock, retains microseconds, locks ordered bounded candidates and returns no IDs", async () => {
  let clocks = 0;
  let deletes = 0;
  let marks = 0;
  const { db, transactions } = fakeDb((text, params) => {
    if (text.includes("set_config")) {
      assert.deepEqual(params, ["1000ms", "250ms", "2000ms"]);
      assert.match(text, /lock_timeout/);
      return [];
    }
    if (text.includes("WITH reference")) {
      clocks++;
      assert.deepEqual(params, [7, 30]);
      return [cutoffs];
    }
    if (text.includes("changed AS")) {
      assert.match(text, /FOR UPDATE SKIP LOCKED/);
      assert.match(text, /LIMIT/);
      assert.ok(params.includes(200));
      assert.match(text, /RETURNING 1/);
      assert.match(text, /SELECT count\(\*\)::int/);
      assert.ok(params.includes(cutoffs.deletion));
      assert.equal(
        params.filter((value) => value === cutoffs.deletion).length,
        2,
      );
      if (text.includes("DELETE")) {
        deletes++;
        assert.match(text, /ORDER BY created_at, id/);
      } else {
        marks++;
        assert.equal(deletes, 1);
        assert.match(text, /ORDER BY last_activity_at, id/);
        assert.ok(params.includes(cutoffs.abandonment));
      }
      return [{ count: 0 }];
    }
    assert.match(text, /SELECT EXISTS \(SELECT 1/);
    assert.doesNotMatch(text, /SKIP LOCKED|ORDER BY|extract|oldest/);
    return [{ backlog: false }];
  });
  const result = await runSessionMaintenance(db);
  assert.equal(result.ok, true);
  assert.equal(clocks, 1);
  assert.equal(marks, 1);
  assert.equal(transactions.length, 5);
  assert.ok(
    transactions.every(
      (statements) =>
        statements.length === 2 && statements[0]!.includes("set_config"),
    ),
  );
  assert.equal(result.deletion.backlog, false);
  assert.equal(result.abandonment.backlog, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /sessionToken|clientId|question|params|ids/,
  );
});

test("deletion budget exhaustion reserves idle work and backlog observations", async (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  let deletions = 0;
  let markings = 0;
  const { db } = fakeDb((text) => {
    if (text.includes("set_config")) return [];
    if (text.includes("WITH reference")) return [cutoffs];
    if (text.includes("changed AS")) {
      if (text.includes("DELETE")) {
        deletions++;
        now = 14_000;
        return [{ count: 200 }];
      }
      markings++;
      return [{ count: 1 }];
    }
    return [{ backlog: true }];
  });
  const result = await runSessionMaintenance(db);
  assert.equal(deletions, 1);
  assert.equal(markings, 1);
  assert.equal(result.deletion.count, 200);
  assert.equal(result.deletion.cap, "budget");
  assert.equal(result.abandonment.count, 1);
  assert.equal(result.deletion.backlog, true);
  assert.equal(result.abandonment.cap, null);
  assert.equal(result.durationMs, 14_000);
});

test("the 20-second deadline stops new batches and leaves unobserved backlog unknown", async (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const { db, transactions } = fakeDb((text) => {
    if (text.includes("set_config")) return [];
    if (text.includes("WITH reference")) return [cutoffs];
    assert.match(text, /changed AS/);
    if (text.includes("DELETE")) return [{ count: 0 }];
    now = 20_000;
    return [{ count: 200 }];
  });
  const result = await runSessionMaintenance(db);
  assert.equal(transactions.length, 3);
  assert.equal(result.durationMs, 20_000);
  assert.equal(result.abandonment.count, 200);
  assert.equal(result.abandonment.cap, "budget");
  assert.equal(result.ok, false);
  for (const operation of [result.deletion, result.abandonment]) {
    assert.equal(operation.backlog, null);
    assert.equal(operation.backlogFailure, "budget");
  }
});

test("pool acquisition or timeout setup consuming the budget cannot start work", async (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  for (const phase of ["pool", "setup"]) {
    now = 0;
    const { db, transactions } = fakeDb((text) => {
      assert.match(text, /set_config/);
      now = 20_000;
      return [];
    });
    if (phase === "pool") {
      const transact = db.transaction.bind(db);
      t.mock.method(
        db,
        "transaction",
        (...args: Parameters<Db["transaction"]>) => {
          now = 20_000;
          return transact(...args);
        },
      );
    }
    const result = await runSessionMaintenance(db);
    assert.equal(result.ok, false);
    assert.equal(result.clockFailure, "budget");
    assert.equal(result.deletion.count, 0);
    assert.equal(result.abandonment.count, 0);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0]!.length, phase === "pool" ? 0 : 1);
  }
});

test("clock failure is sanitized and does not attempt mutation", async () => {
  const { db, transactions } = fakeDb((text) => {
    if (text.includes("set_config")) return [];
    throw new Error("password=private sessionToken=private SQL");
  });
  const result = await runSessionMaintenance(db);
  assert.equal(result.ok, false);
  assert.equal(result.clockFailure, "database_error");
  assert.equal(transactions.length, 1);
  assert.equal(result.deletion.backlog, null);
  assert.equal(result.abandonment.backlog, null);
  assert.doesNotMatch(JSON.stringify(result), /password|private|SQL/);
});

test("failed/short batches do not imply empty backlog; wrapped SQLSTATE is sanitized", async () => {
  const { db } = fakeDb((text) => {
    if (text.includes("set_config")) return [];
    if (text.includes("WITH reference")) return [cutoffs];
    if (text.includes("DELETE"))
      throw new Error("private SQL", {
        cause: { code: "55P03", message: "private" },
      });
    if (text.includes("changed AS")) return [{ count: 0 }];
    if (!text.includes("last_activity_at")) return [{ backlog: true }];
    throw { code: "57014", message: "private SQL" };
  });
  const result = await runSessionMaintenance(db);
  assert.equal(result.ok, false);
  assert.equal(result.deletion.failure, "lock_timeout");
  assert.equal(result.deletion.count, 0);
  assert.equal(result.deletion.backlog, true);

  assert.equal(result.abandonment.backlog, null);
  assert.equal(result.abandonment.backlogFailure, "statement_timeout");
  assert.doesNotMatch(JSON.stringify(result), /private|SQL/);
});
