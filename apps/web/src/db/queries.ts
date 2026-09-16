import type { Db } from "./client"

import { createHash } from "node:crypto"

import { and, eq, gte, lt, sql } from "drizzle-orm"

import { ABANDON_AFTER_MINUTES, SESSION_STATUS } from "../domain/constants"
import { testSessions } from "./schema"

/**
 * Hashes the raw anonymous client cookie into a non-reversible id. We store the
 * hash (not the raw value, IP, or fingerprint) so rate limiting works without
 * retaining PII — keeping the "anonymous" posture consistent with GDPR.
 */
export function hashClientId(rawClientCookie: string): string {
  return createHash("sha256").update(rawClientCookie).digest("hex").slice(0, 64)
}

/** Count sessions created by this client within the trailing window (minutes). */
export async function countRecentSessionsByClient(
  db: Db,
  clientId: string,
  windowMinutes: number
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000)
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(testSessions)
    .where(
      and(
        eq(testSessions.clientId, clientId),
        gte(testSessions.createdAt, since)
      )
    )
  return rows[0]?.value ?? 0
}

/**
 * Sweep stale in-progress sessions to `abandoned`. Intended to run on a cron /
 * scheduled task; makes the Test Completion Rate KPI measurable. Returns the
 * number of sessions transitioned.
 */
export async function markAbandonedSessions(
  db: Db,
  inactiveMinutes: number = ABANDON_AFTER_MINUTES
): Promise<number> {
  const cutoff = new Date(Date.now() - inactiveMinutes * 60_000)
  const updated = await db
    .update(testSessions)
    .set({ status: SESSION_STATUS.ABANDONED })
    .where(
      and(
        eq(testSessions.status, SESSION_STATUS.IN_PROGRESS),
        lt(testSessions.lastActivityAt, cutoff)
      )
    )
    .returning({ id: testSessions.id })
  return updated.length
}

/**
 * Right-to-erasure helper. Deleting the session cascades to answers, results,
 * and category scores (ON DELETE CASCADE). Keyed on the token the user holds.
 */
export async function deleteSessionByToken(
  db: Db,
  sessionToken: string
): Promise<boolean> {
  const deleted = await db
    .delete(testSessions)
    .where(eq(testSessions.sessionToken, sessionToken))
    .returning({ id: testSessions.id })
  return deleted.length > 0
}
