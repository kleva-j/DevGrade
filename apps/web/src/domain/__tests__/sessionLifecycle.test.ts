import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ABANDON_AFTER_MINUTES,
  SESSION_RESUME_WINDOW_HOURS,
  SESSION_RETENTION_DAYS,
  SESSION_STATUS,
  SESSION_STATUSES,
} from "@/domain/constants";
import { sessionLifecycle } from "@/domain/sessionLifecycle";

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const createdAt = new Date("2026-03-07T12:00:00-05:00");
const session = {
  createdAt,
  lastActivityAt: createdAt,
  status: SESSION_STATUS.IN_PROGRESS,
  hasQuestionSnapshot: true,
};
const atAge = (age: number) => new Date(createdAt.getTime() + age);

test("central policy durations are 30 minutes, 24 hours and seven days", () => {
  assert.equal(ABANDON_AFTER_MINUTES, 30);
  assert.equal(SESSION_RESUME_WINDOW_HOURS, 24);
  assert.equal(SESSION_RETENTION_DAYS, 7);
});

for (const offset of [-1, 0, 1]) {
  test(`effective abandonment at 30 minutes ${offset}ms is inclusive`, () => {
    const policy = sessionLifecycle(session, atAge(30 * minute + offset));
    assert.equal(
      policy.effectiveStatus,
      offset < 0 ? SESSION_STATUS.IN_PROGRESS : SESSION_STATUS.ABANDONED,
    );
    assert.equal(policy.blocksCreation, true);
    assert.equal(policy.canResume, true);
    assert.equal(policy.canSubmitAnswer, true);
    assert.equal(policy.canComplete, true);
    assert.equal(policy.canReadReport, false);
    assert.equal(policy.canSubmitSurvey, false);
    assert.equal(policy.canDelete, true);
  });

  for (const status of SESSION_STATUSES) {
    test(`${status}: attempt cutoff at 24 hours ${offset}ms despite recent activity`, () => {
      const now = atAge(day + offset);
      const policy = sessionLifecycle(
        { ...session, status, lastActivityAt: now },
        now,
      );
      const unfinished = status !== SESSION_STATUS.COMPLETED;
      assert.equal(policy.attemptExpired, offset >= 0);
      assert.equal(policy.accessExpired, false);
      assert.equal(policy.canResume, unfinished && offset < 0);
      assert.equal(policy.canSubmitAnswer, unfinished && offset < 0);
      assert.equal(policy.canComplete, unfinished && offset < 0);
      assert.equal(policy.blocksCreation, unfinished && offset < 0);
      assert.equal(policy.canReadReport, !unfinished);
      assert.equal(policy.canSubmitSurvey, !unfinished);
      assert.equal(policy.canDelete, true);
    });

    test(`${status}: access cutoff and cleanup at seven days ${offset}ms`, () => {
      const now = atAge(7 * day + offset);
      const policy = sessionLifecycle(
        { ...session, status, lastActivityAt: now },
        now,
      );
      assert.equal(policy.attemptExpired, true);
      assert.equal(policy.accessExpired, offset >= 0);
      assert.equal(policy.cleanupEligible, offset >= 0);
      assert.equal(policy.canResume, false);
      assert.equal(policy.canSubmitAnswer, false);
      assert.equal(policy.canComplete, false);
      assert.equal(policy.blocksCreation, false);
      assert.equal(
        policy.canReadReport,
        status === SESSION_STATUS.COMPLETED && offset < 0,
      );
      assert.equal(policy.canSubmitSurvey, policy.canReadReport);
      assert.equal(policy.canDelete, true);
    });
  }
}

test("persisted abandonment is resumable but completion is never effectively abandoned", () => {
  const abandoned = sessionLifecycle(
    { ...session, status: SESSION_STATUS.ABANDONED },
    createdAt,
  );
  assert.equal(abandoned.effectiveStatus, SESSION_STATUS.ABANDONED);
  assert.equal(abandoned.canResume, true);
  const completed = sessionLifecycle(
    { ...session, status: SESSION_STATUS.COMPLETED },
    atAge(day),
  );
  assert.equal(completed.effectiveStatus, SESSION_STATUS.COMPLETED);
  assert.equal(completed.canResume, false);
});

test("legacy unfinished attempts cannot continue but block until their original 24h cutoff", () => {
  for (const status of [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.ABANDONED]) {
    for (const age of [0, day - 1, day, day + 1]) {
      const policy = sessionLifecycle(
        { ...session, status, hasQuestionSnapshot: false },
        atAge(age),
      );
      assert.equal(policy.canResume, false);
      assert.equal(policy.canSubmitAnswer, false);
      assert.equal(policy.canComplete, false);
      assert.equal(policy.blocksCreation, age < day);
      assert.equal(policy.canDelete, true);
    }
  }
});

test("legacy completed summaries share the original access deadline", () => {
  const legacy = {
    ...session,
    status: SESSION_STATUS.COMPLETED,
    hasQuestionSnapshot: false,
  };
  assert.equal(
    sessionLifecycle(legacy, atAge(7 * day - 1)).canReadReport,
    true,
  );
  assert.equal(sessionLifecycle(legacy, atAge(7 * day)).canReadReport, false);
});

test("deadlines use elapsed UTC durations across spring/fall DST and never slide", () => {
  for (const creation of [createdAt, new Date("2026-10-31T12:00:00-04:00")]) {
    for (const age of [0, hour, 23 * hour, 6 * day, 8 * day]) {
      const now = new Date(creation.getTime() + age);
      const input = { ...session, createdAt: creation, lastActivityAt: now };
      const before = structuredClone(input);
      const policy = sessionLifecycle(input, now);
      assert.equal(policy.attemptExpiresAt.getTime() - creation.getTime(), day);
      assert.equal(
        policy.accessExpiresAt.getTime() - creation.getTime(),
        7 * day,
      );
      assert.deepEqual(
        input,
        before,
        "policy must not mutate timestamps/state",
      );
    }
  }
  assert.equal(
    sessionLifecycle(session, createdAt).attemptExpiresAt.toISOString(),
    "2026-03-08T17:00:00.000Z",
  );
});

test("invalid time cannot silently authorize an operation", () => {
  assert.throws(() => sessionLifecycle(session, new Date(NaN)), RangeError);
  assert.throws(
    () => sessionLifecycle({ ...session, createdAt: new Date(NaN) }, createdAt),
    RangeError,
  );
  assert.throws(
    () =>
      sessionLifecycle(
        { ...session, lastActivityAt: new Date(NaN) },
        createdAt,
      ),
    RangeError,
  );
});
