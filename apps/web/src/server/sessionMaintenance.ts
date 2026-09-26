import "@tanstack/react-start/server-only";

import { sql } from "drizzle-orm";

import type { SQL } from "drizzle-orm";
import type { Db } from "@/db/client";

import {
  ABANDON_AFTER_MINUTES,
  SESSION_RETENTION_DAYS,
  SESSION_STATUS,
} from "@/domain/constants";

const batchSize = 200;
const maxBatches = 5;
const budgetMs = 20_000;
const idleReserveMs = 5_000;
const statementTimeoutMs = 1_000;
const lockTimeoutMs = 250;
const transactionMarginMs = 25;

type MaintenanceFailure =
  | "statement_timeout"
  | "lock_timeout"
  | "database_error";
interface MaintenanceOperationResult {
  count: number;
  batches: number;
  cap: "batch_limit" | "budget" | null;
  failure: MaintenanceFailure | null;
  /** A short SKIP LOCKED batch does not prove emptiness; null means unknown. */
  backlog: boolean | null;
  backlogFailure: MaintenanceFailure | "budget" | null;
}
export interface SessionMaintenanceResult {
  ok: boolean;
  durationMs: number;
  clockFailure: MaintenanceFailure | "budget" | null;
  deletion: MaintenanceOperationResult;
  abandonment: MaintenanceOperationResult;
}

type Cutoffs = { deletion: string; abandonment: string };
type Operation = keyof Cutoffs;
class BudgetExhausted extends Error {}

function emptyOperation(): MaintenanceOperationResult {
  return {
    count: 0,
    batches: 0,
    cap: null,
    failure: null,
    backlog: null,
    backlogFailure: null,
  };
}

/** Whitelist SQLSTATE, including Drizzle's cause wrapper, never exception text. */
function failureCode(error: unknown): MaintenanceFailure | "budget" {
  if (error instanceof BudgetExhausted) return "budget";
  let current = error;
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== "object") break;
    if ("code" in current) {
      if (current.code === "57014") return "statement_timeout";
      if (current.code === "55P03") return "lock_timeout";
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return "database_error";
}

async function execute<T extends Record<string, unknown>>(
  db: Db,
  deadline: number,
  query: SQL,
) {
  const checkBudget = () => {
    // Leave a full statement window, including after pool acquisition/configuration.
    if (deadline - performance.now() < statementTimeoutMs + transactionMarginMs)
      throw new BudgetExhausted();
  };
  checkBudget();
  return db.transaction(async (tx) => {
    checkBudget();
    await tx.execute(sql`SELECT
      set_config('statement_timeout', ${`${statementTimeoutMs}ms`}, true),
      set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true),
      set_config('idle_in_transaction_session_timeout', ${`${statementTimeoutMs + 1000}ms`}, true)`);
    checkBudget();
    return tx.execute<T>(query);
  });
}

function eligibility(operation: Operation, cutoffs: Cutoffs): SQL {
  return operation === "deletion"
    ? sql`created_at <= ${cutoffs.deletion}::timestamptz`
    : sql`created_at > ${cutoffs.deletion}::timestamptz
        AND status = ${SESSION_STATUS.IN_PROGRESS}
        AND last_activity_at <= ${cutoffs.abandonment}::timestamptz`;
}

/**
 * All-status retention cleanup, then retained idle marking; each batch commits
 * independently. Await every transaction/rollback, never detach timed-out work.
 * DB budgets cannot bound an unavailable network/pool: host limits are also needed.
 */
export async function runSessionMaintenance(
  db: Db,
): Promise<SessionMaintenanceResult> {
  const started = performance.now();
  const deadline = started + budgetMs;
  const deletionDeadline = deadline - idleReserveMs;
  const deletion = emptyOperation();
  const abandonment = emptyOperation();
  let clockFailure: SessionMaintenanceResult["clockFailure"] = null;
  let cutoffs: Cutoffs | undefined;
  try {
    // One DB clock, 24-hour days, and text round-trip to preserve microseconds.
    [cutoffs] = await execute<Cutoffs>(
      db,
      deletionDeadline,
      sql`
      WITH reference AS MATERIALIZED (SELECT clock_timestamp() AS now)
      SELECT (now - ${SESSION_RETENTION_DAYS} * interval '24 hours')::text AS deletion,
             (now - ${ABANDON_AFTER_MINUTES} * interval '1 minute')::text AS abandonment
      FROM reference`,
    );
    if (!cutoffs) throw new Error("Maintenance clock unavailable");
  } catch (error) {
    clockFailure = failureCode(error);
  }

  if (cutoffs) {
    for (const operation of ["deletion", "abandonment"] as const) {
      const result = operation === "deletion" ? deletion : abandonment;
      const workDeadline =
        operation === "deletion" ? deletionDeadline : deadline;
      const predicate = eligibility(operation, cutoffs);
      const order =
        operation === "deletion"
          ? sql`created_at, id`
          : sql`last_activity_at, id`;
      const mutation =
        operation === "deletion"
          ? sql`DELETE FROM test_sessions WHERE id IN (SELECT id FROM candidates) AND ${predicate}`
          : sql`UPDATE test_sessions SET status = ${SESSION_STATUS.ABANDONED}
            WHERE id IN (SELECT id FROM candidates) AND ${predicate}`;
      try {
        for (let batch = 0; batch < maxBatches; batch++) {
          // Lock parents first, matching answer/resume/complete/delete discipline.
          // RETURNING 1 keeps identities and content inside PostgreSQL.
          const [row] = await execute<{ count: number }>(
            db,
            workDeadline,
            sql`
            WITH candidates AS MATERIALIZED (
              SELECT id FROM test_sessions WHERE ${predicate}
              ORDER BY ${order} LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
            ), changed AS (${mutation} RETURNING 1)
            SELECT count(*)::int AS count FROM changed`,
          );
          if (!row) throw new Error("Maintenance count unavailable");
          result.count += row.count;
          result.batches++;
          if (row.count < batchSize) break;
          if (result.batches === maxBatches) result.cap = "batch_limit";
        }
      } catch (error) {
        const failure = failureCode(error);
        if (failure === "budget") result.cap = failure;
        else result.failure = failure;
      }
    }

    // MVCC existence checks include locked/skipped rows; no lag/oldest-row scan.
    for (const operation of ["deletion", "abandonment"] as const) {
      const result = operation === "deletion" ? deletion : abandonment;
      try {
        const [row] = await execute<{ backlog: boolean }>(
          db,
          deadline,
          sql`
          SELECT EXISTS (SELECT 1 FROM test_sessions
            WHERE ${eligibility(operation, cutoffs)}) AS backlog`,
        );
        if (!row) throw new Error("Maintenance backlog unavailable");
        result.backlog = row.backlog;
      } catch (error) {
        result.backlogFailure = failureCode(error);
      }
    }
  }

  return {
    ok:
      clockFailure === null &&
      [deletion, abandonment].every(
        (result) => result.failure === null && result.backlogFailure === null,
      ),
    durationMs: Math.ceil(performance.now() - started),
    clockFailure,
    deletion,
    abandonment,
  };
}
