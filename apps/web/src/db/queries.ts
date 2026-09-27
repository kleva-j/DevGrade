import type { QueryDb } from "./client";

import { createHash } from "node:crypto";

import { and, eq, gte, sql } from "drizzle-orm";

import { RATE_LIMIT_WINDOW_MINUTES } from "@/domain/constants";
import { testSessions } from "./schema";

/** Postgres SQLSTATE for a unique-constraint violation (`unique_violation`). */
export const PG_UNIQUE_VIOLATION = "23505";
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === PG_UNIQUE_VIOLATION
  );
}

/** Rate-limit metadata only; raw client IDs are never stored or used as auth. */
export function hashClientId(rawClientCookie: string): string {
  return createHash("sha256").update(rawClientCookie).digest("hex");
}
export async function countRecentSessionsByClient(
  db: QueryDb,
  clientId: string,
  windowMinutes: number = RATE_LIMIT_WINDOW_MINUTES,
): Promise<number> {
  const since = sql`clock_timestamp() - ${windowMinutes} * interval '1 minute'`;
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(testSessions)
    .where(
      and(
        eq(testSessions.clientId, clientId),
        gte(testSessions.createdAt, since),
      ),
    );
  return row?.value ?? 0;
}

/** Read separately AFTER mutation locks: transaction-start now() may be stale. */
export async function databaseTime(db: QueryDb): Promise<Date> {
  const [row] = await db.execute<{ milliseconds: number }>(
    sql`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::double precision AS milliseconds`,
  );
  if (!row || !Number.isFinite(row.milliseconds))
    throw new Error("Database clock unavailable");
  return new Date(row.milliseconds);
}
