import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import type { ActorRefFrom, SnapshotFrom } from "xstate";
import { createActor, waitFor } from "xstate";
import {
  ASSESSMENT_LENGTHS,
  DELETE_EXPECTATION,
  DIFFICULTY,
  SESSION_VIEW,
  SESSION_STATUS,
} from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import {
  assessmentMachine,
  boundedDuration,
  firstUnanswered,
} from "./assessmentMachine";
import { createSessionRecovery } from "./sessionRecovery";
import {
  createSessionStorage,
  createSessionLock,
  STORAGE_ISSUE,
} from "./sessionStorage";
import {
  configuration,
  fakeServer,
  makeSession,
  MemoryStorage,
  attemptExpiresAt,
  accessExpiresAt,
  accept,
  clientFailure,
  createdAt,
} from "./sessionTestFixtures";
import type { TestSession } from "./sessionTestFixtures";

type Actor = ActorRefFrom<typeof assessmentMachine>;
type State = Parameters<SnapshotFrom<typeof assessmentMachine>["matches"]>[0];
function until(actor: Actor, state: State) {
  return waitFor(actor, (snapshot) => snapshot.matches(state), {
    timeout: 2000,
  });
}
function fixture(t: TestContext, initial: TestSession[] = []) {
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  initial.forEach((session) =>
    storage.save({
      ...session.credential,
      attemptExpiresAt,
      accessExpiresAt,
      hint: session.assessment.configuration,
    }),
  );
  const server = fakeServer(initial);
  const recovery = createSessionRecovery(
    server.api,
    storage,
    createSessionLock(() => undefined),
  );
  let now = Date.parse(createdAt);
  const actor = createActor(assessmentMachine, {
    input: { recovery, now: () => now },
  });
  actor.start();
  t.after(() => actor.stop());
  async function boot() {
    actor.send({ type: "BOOTSTRAP" });
    await until(actor, { history: "ready" });
  }
  function start(config = configuration) {
    actor.send({ type: "CONFIGURE", configuration: config });
    actor.send({ type: "START" });
  }
  function open(session: TestSession) {
    actor.send({ type: "OPEN", sessionId: session.credential.sessionId });
  }
  function resume(session: TestSession) {
    actor.send({ type: "RESUME", sessionId: session.credential.sessionId });
  }
  function submit(option = 0) {
    actor.send({ type: "SELECT_OPTION", option });
    actor.send({ type: "SUBMIT_ANSWER" });
  }
  function current() {
    const view = actor.getSnapshot().context.view;
    assert.ok(view?.kind === SESSION_VIEW.ASSESSMENT);
    return view;
  }
  return {
    actor,
    port,
    storage,
    server,
    recovery,
    boot,
    start,
    open,
    resume,
    submit,
    current,
    setNow: (value: number) => {
      now = value;
      server.setNow(value);
    },
  };
}

test("SSR/bootstrap has no storage/network side effects until mounted BOOTSTRAP event", async (t) => {
  const h = fixture(t);
  await Promise.resolve();
  assert.ok(h.actor.getSnapshot().matches("bootstrap"));
  assert.equal(h.server.calls.discover, 0);
  assert.equal(h.port.writes.length, 0);
  await h.boot();
  assert.equal(h.server.calls.discover, 1);
});
for (const questionCount of ASSESSMENT_LENGTHS)
  test(`${questionCount}: refresh/reopen restores original config and first unanswered, without auto-resume`, async (t) => {
    const session = makeSession({
      ...configuration,
      questionCount,
      targetLevel: DIFFICULTY.SENIOR,
    });
    accept(session, 2);
    accept(session, 0);
    const h = fixture(t, [session]);
    await h.boot();
    h.actor.send({ type: "CONFIGURE", configuration });
    h.open(session);
    await until(h.actor, { viewing: "ready" });
    assert.equal(h.server.calls.resume, 0);
    assert.equal(h.server.calls.complete, 0);
    assert.equal(firstUnanswered(h.current())?.id, "question-1");
    assert.equal(h.current().configuration.targetLevel, DIFFICULTY.SENIOR);
    assert.equal(h.current().totalQuestions, questionCount);
    h.setNow(Date.parse(createdAt) + 60_000);
    h.resume(session);
    await until(h.actor, { attempting: "answering" });
    assert.equal(h.server.calls.resume, 1);
    assert.equal(
      h.actor.getSnapshot().context.questionStartedAt,
      Date.parse(createdAt) + 60_000,
    );
    h.actor.send({ type: "CONFIGURE", configuration });
    assert.equal(h.current().configuration.targetLevel, DIFFICULTY.SENIOR);
    h.actor.send({ type: "SELECT_OPTION", option: 2 });
    h.actor.send({ type: "HISTORY" });
    await until(h.actor, { history: "ready" });
    h.open(session);
    await until(h.actor, { viewing: "ready" });
    assert.equal(h.actor.getSnapshot().context.selectedOption, null);
    assert.equal(h.server.calls.resume, 1);
  });
for (const questionCount of ASSESSMENT_LENGTHS)
  test(`${questionCount}: create/answer/complete consume returned views with ZERO get requests`, async (t) => {
    const h = fixture(t);
    await h.boot();
    h.start({ ...configuration, questionCount });
    await until(h.actor, { attempting: "answering" });
    const complete = h.server.api.completeSession;
    h.server.api.completeSession = async (known) => {
      const saved = await complete(known);
      if (saved.kind === SESSION_VIEW.REPORT)
        saved.reportSnapshot.result.totalScore = 61;
      return saved;
    };
    assert.equal(h.server.calls.get, 0);
    assert.equal("sessionToken" in h.current(), false);
    assert.equal(
      JSON.stringify(h.actor.getSnapshot().context).includes("sessionToken"),
      false,
    );
    for (let i = 0; i < questionCount; i++) {
      assert.equal(firstUnanswered(h.current())?.id, `question-${i}`);
      h.submit();
      await until(
        h.actor,
        i === questionCount - 1 ? "completed" : { attempting: "answering" },
      );
      assert.equal(h.server.calls.get, 0);
    }
    const view = h.actor.getSnapshot().context.view;
    assert.ok(view?.kind === SESSION_VIEW.REPORT);
    assert.equal(view.reportSnapshot.result.totalScore, 61);
    assert.equal(
      view.reportSnapshot.pillars[0]?.displayName,
      "Saved pillar name",
    );
    assert.equal(h.server.calls.complete, 1);
    assert.equal(h.server.calls.resume, 0);
    assert.equal(h.storage.scan().handles.length, 1);
    h.actor.send({ type: "HISTORY" });
    await until(h.actor, { history: "ready" });
    h.start();
    await until(h.actor, { attempting: "answering" });
    assert.equal(h.storage.scan().handles.length, 2);
  });
test("accepted IDs prevent skipping unanswered holes when another tab answers ahead", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  accept(session, 2);
  h.submit();
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.current().answeredCount, 2);
  assert.equal(firstUnanswered(h.current())?.id, "question-1");
  h.submit();
  await until(h.actor, { attempting: "answering" });
  assert.equal(firstUnanswered(h.current())?.id, "question-3");
  assert.equal(h.server.calls.get, 0);
});
test("lost answer response retains the identical request/duration; same-option retry uses accepted server timing", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  const answer = h.server.api.submitAnswer;
  let first = true;
  h.server.api.submitAnswer = async (input) => {
    const result = await answer(input);
    if (first) {
      first = false;
      throw new Error("lost response");
    }
    return result;
  };
  h.setNow(Date.parse(createdAt) + 4000);
  h.submit(2);
  await until(h.actor, { attempting: "answerFailed" });
  const pending = h.actor.getSnapshot().context.pendingAnswer;
  assert.equal(pending?.timeSpentSeconds, 4);
  h.setNow(Date.parse(createdAt) + 50_000);
  h.actor.send({ type: "SELECT_OPTION", option: 0 });
  assert.deepEqual(h.actor.getSnapshot().context.pendingAnswer, pending);
  h.actor.send({ type: "RETRY" });
  await until(h.actor, { attempting: "answering" });
  assert.deepEqual(h.current().acceptedAnswers[0], pending);
  assert.equal(h.server.calls.answer, 2);
});
test("different-option retry conflict reconciles the accepted answer instead of endless Retry", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  accept(session, 0, 3, 100);
  h.submit(1);
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.current().acceptedAnswers[0]?.selectedAnswer, 3);
  assert.equal(h.current().acceptedAnswers[0]?.timeSpentSeconds, 100);
  assert.equal(h.server.calls.get, 1);
  assert.equal(firstUnanswered(h.current())?.id, "question-1");
});
for (const offset of [-1, 0, 1])
  test(`all-answered unfinished at deadline ${offset}ms requires explicit Resume; late completion is never attempted`, async (t) => {
    const session = makeSession();
    session.assessment.questions.forEach((_, i) => accept(session, i));
    const h = fixture(t, [session]);
    await h.boot();
    h.open(session);
    await until(h.actor, { viewing: "ready" });
    assert.equal(h.server.calls.complete, 0);
    h.setNow(Date.parse(attemptExpiresAt) + offset);
    h.resume(session);
    await until(h.actor, offset < 0 ? "completed" : { viewing: "ready" });
    assert.equal(h.server.calls.complete, offset < 0 ? 1 : 0);
    if (offset >= 0)
      assert.equal(
        h.actor.getSnapshot().context.view?.kind,
        SESSION_VIEW.ATTEMPT_EXPIRED,
      );
  });
test("completion race with the attempt cutoff reconciles expiry, not automatic completion retries", async (t) => {
  const session = makeSession();
  session.assessment.questions.forEach((_, i) => accept(session, i));
  const h = fixture(t, [session]);
  await h.boot();
  const complete = h.server.api.completeSession;
  h.server.api.completeSession = async (known) => {
    h.setNow(Date.parse(attemptExpiresAt));
    return complete(known);
  };
  h.resume(session);
  await until(h.actor, { viewing: "ready" });
  assert.equal(
    h.actor.getSnapshot().context.view?.kind,
    SESSION_VIEW.ATTEMPT_EXPIRED,
  );
  assert.equal(h.server.calls.complete, 1);
  h.actor.send({ type: "RETRY" });
  assert.equal(h.server.calls.complete, 1);
});
test("lost completion response reconciles the awarded report before any retry", async (t) => {
  const session = makeSession();
  session.assessment.questions.forEach((_, i) => accept(session, i));
  const h = fixture(t, [session]);
  await h.boot();
  const complete = h.server.api.completeSession;
  h.server.api.completeSession = async (known) => {
    await complete(known);
    throw new Error("lost response");
  };
  h.resume(session);
  await until(h.actor, { attempting: "completeFailed" });
  h.actor.send({ type: "RETRY" });
  await until(h.actor, "completed");
  assert.equal(h.server.calls.complete, 1);
});
for (const outcome of ["completed", "expired", "unavailable"] as const)
  test(`answer in another tab outcome ${outcome} is reconciled`, async (t) => {
    const session = makeSession();
    const h = fixture(t, [session]);
    await h.boot();
    h.resume(session);
    await until(h.actor, { attempting: "answering" });
    if (outcome === "completed") session.completed = true;
    if (outcome === "expired") h.setNow(Date.parse(attemptExpiresAt));
    if (outcome === "unavailable") h.setNow(Date.parse(accessExpiresAt));
    h.submit();
    await until(
      h.actor,
      outcome === "expired" ? { viewing: "ready" } : outcome,
    );
    if (outcome === "expired")
      assert.equal(
        h.actor.getSnapshot().context.view?.kind,
        SESSION_VIEW.ATTEMPT_EXPIRED,
      );
    h.actor.send({ type: "RETRY" });
    assert.equal(h.server.calls.answer, 1);
    assert.equal(
      h.storage.scan().handles.length,
      outcome === "unavailable" ? 0 : 1,
    );
  });
test("multiple mismatched/abandoned blockers require resolving ALL; cancel and failure cannot bypass", async (t) => {
  const a = makeSession();
  const b = makeSession({ ...configuration, targetLevel: DIFFICULTY.SENIOR });
  b.assessment.effectiveStatus = SESSION_STATUS.ABANDONED;
  const h = fixture(t, [a, b]);
  await h.boot();
  h.start();
  await until(h.actor, { creation: "ready" });
  assert.equal(
    h.actor.getSnapshot().context.history.filter((m) => m.blocksCreation)
      .length,
    2,
  );
  h.actor.send({ type: "CANCEL" });
  h.start();
  await until(h.actor, { creation: "ready" });
  assert.equal(h.server.calls.create, 0);
  h.actor.send({
    type: "DELETE",
    sessionId: a.credential.sessionId,
    expectedState: DELETE_EXPECTATION.UNFINISHED,
  });
  await until(h.actor, "confirmDelete");
  h.actor.send({ type: "CANCEL" });
  await until(h.actor, { history: "ready" });
  assert.equal(h.server.calls.delete, 0);
  h.start();
  await until(h.actor, { creation: "ready" });
  h.actor.send({
    type: "DELETE",
    sessionId: a.credential.sessionId,
    expectedState: DELETE_EXPECTATION.UNFINISHED,
  });
  h.actor.send({ type: "CONFIRM_DELETE" });
  await until(h.actor, { creation: "ready" });
  assert.equal(h.server.calls.create, 0);
  assert.equal(h.storage.scan().handles.length, 1);
  h.actor.send({
    type: "DELETE",
    sessionId: b.credential.sessionId,
    expectedState: DELETE_EXPECTATION.UNFINISHED,
  });
  h.actor.send({ type: "CONFIRM_DELETE" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.server.calls.create, 1);
});
test("prompt expiry refresh does not force deletion or create automatically; explicit recheck then creates", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.start();
  await until(h.actor, { creation: "ready" });
  h.setNow(Date.parse(attemptExpiresAt));
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, { creation: "ready" });
  assert.equal(h.actor.getSnapshot().context.history[0]?.blocksCreation, false);
  assert.equal(h.server.calls.create, 0);
  assert.equal(h.server.calls.delete, 0);
  h.actor.send({ type: "START" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.server.calls.create, 1);
});
test("delete failure/cancel retains the blocker; it cannot bypass into creation", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.start();
  await until(h.actor, { creation: "ready" });
  h.server.api.deleteSession = async () => {
    throw new Error("offline");
  };
  h.actor.send({
    type: "DELETE",
    sessionId: session.credential.sessionId,
    expectedState: DELETE_EXPECTATION.UNFINISHED,
  });
  h.actor.send({ type: "CONFIRM_DELETE" });
  await until(h.actor, "deleteFailed");
  assert.equal(h.storage.scan().handles.length, 1);
  h.actor.send({ type: "CANCEL" });
  await until(h.actor, { history: "ready" });
  h.start();
  await until(h.actor, { creation: "ready" });
  assert.equal(h.server.calls.create, 0);
});
test("Resume racing completion renders the returned saved report with no second fetch", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  const resume = h.server.api.resumeSession;
  h.server.api.resumeSession = async (known) => {
    session.completed = true;
    const output = await resume(known);
    if (output.kind === SESSION_VIEW.REPORT)
      output.reportSnapshot.result.totalScore = 0;
    return output;
  };
  h.resume(session);
  await until(h.actor, "completed");
  const view = h.actor.getSnapshot().context.view;
  assert.ok(view?.kind === SESSION_VIEW.REPORT);
  assert.equal(view.reportSnapshot.result.totalScore, 0);
  assert.equal(h.server.calls.get, 0);
});
test("completion during delete confirmation shows report and preserves it; new creation rechecks", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.start();
  await until(h.actor, { creation: "ready" });
  h.actor.send({
    type: "DELETE",
    sessionId: session.credential.sessionId,
    expectedState: DELETE_EXPECTATION.UNFINISHED,
  });
  await until(h.actor, "confirmDelete");
  session.completed = true;
  h.actor.send({ type: "CONFIRM_DELETE" });
  await until(h.actor, "completed");
  assert.equal(h.actor.getSnapshot().context.notice, "changed_state");
  assert.equal(h.server.calls.delete, 1);
  assert.equal(h.server.calls.create, 0);
  assert.equal(h.storage.scan().handles.length, 1);
  h.actor.send({ type: "HISTORY" });
  await until(h.actor, { history: "ready" });
  h.start();
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.storage.scan().handles.length, 2);
});
test("legacy unfinished is delete-only, legacy summary renders without completion/reconstruction", async (t) => {
  const session = makeSession();
  session.legacy = true;
  const h = fixture(t, [session]);
  await h.boot();
  h.start();
  await until(h.actor, { creation: "ready" });
  h.open(session);
  await until(h.actor, { viewing: "ready" });
  assert.equal(
    h.actor.getSnapshot().context.view?.kind,
    SESSION_VIEW.LEGACY_UNRESTORABLE,
  );
  assert.equal(h.server.calls.resume, 0);
  session.completed = true;
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, "completed");
  assert.equal(
    h.actor.getSnapshot().context.view?.kind,
    SESSION_VIEW.LEGACY_SUMMARY,
  );
  assert.equal(h.server.calls.complete, 0);
});
test("saved report and survey rating survive refresh after 24h; seven-day cutoff clears only its handle", async (t) => {
  const session = makeSession();
  session.completed = true;
  session.report.surveyRating = 4;
  const h = fixture(t, [session, makeSession()]);
  h.setNow(Date.parse(attemptExpiresAt));
  await h.boot();
  h.open(session);
  await until(h.actor, "completed");
  const view = h.actor.getSnapshot().context.view;
  assert.ok(view && "surveyRating" in view);
  assert.equal(view.surveyRating, 4);
  assert.equal(h.server.calls.resume, 0);
  h.setNow(Date.parse(accessExpiresAt));
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, "unavailable");
  assert.equal(h.storage.scan().handles.length, 1);
});
test("survey failure preserves report, valid resubmission persists rating, expiry exits retry flow", async (t) => {
  const session = makeSession();
  session.completed = true;
  const h = fixture(t, [session]);
  await h.boot();
  h.open(session);
  await until(h.actor, "completed");
  const survey = h.server.api.submitSurvey;
  h.server.api.submitSurvey = async () => {
    throw new Error("offline");
  };
  h.actor.send({ type: "SUBMIT_SURVEY", rating: 4 });
  await until(h.actor, { completed: "surveyPrompt" });
  assert.equal(h.actor.getSnapshot().context.error, "request_failed");
  h.server.api.submitSurvey = survey;
  h.actor.send({ type: "SUBMIT_SURVEY", rating: 4 });
  await until(h.actor, { completed: "surveyPrompt" });
  assert.equal(session.report.surveyRating, 4);
  h.setNow(Date.parse(accessExpiresAt));
  h.actor.send({ type: "SUBMIT_SURVEY", rating: 5 });
  await until(h.actor, "unavailable");
});
test("post-create storage failure still renders immediately; later refresh retries READ, never create", async (t) => {
  const h = fixture(t);
  await h.boot();
  const create = h.server.api.createSession;
  const get = h.server.api.getSession;
  h.server.api.createSession = async (...args) => {
    const result = await create(...args);
    h.port.blockRead = true;
    return result;
  };
  h.server.api.getSession = async () => {
    throw new Error("offline");
  };
  h.start();
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.server.calls.get, 0);
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, { attempting: "readFailed" });
  assert.ok(h.actor.getSnapshot().context.sessionId);
  assert.ok(h.actor.getSnapshot().context.storageIssue);
  h.server.api.getSession = get;
  h.actor.send({ type: "RETRY" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.server.calls.create, 1);
  h.actor.send({ type: "HISTORY" });
  await until(h.actor, { history: "ready" });
  h.start();
  await until(h.actor, { creation: "ready" });
  assert.equal(h.server.calls.create, 1);
});
test("storage blocked on bootstrap can retry without dropping history or creating", async (t) => {
  const h = fixture(t);
  h.port.blockRead = true;
  await h.boot();
  assert.equal(
    h.actor.getSnapshot().context.storageIssue,
    STORAGE_ISSUE.UNAVAILABLE,
  );
  h.start();
  await until(h.actor, { creation: "ready" });
  assert.equal(h.server.calls.create, 0);
  h.port.blockRead = false;
  h.actor.send({ type: "START" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.server.calls.create, 1);
});
test("transient reconciliation failure retains handle and retries read without resubmitting answer", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  const get = h.server.api.getSession;
  h.server.api.getSession = async () => {
    throw new Error("offline");
  };
  accept(session, 0, 3);
  h.submit();
  await until(h.actor, { attempting: "readFailed" });
  assert.equal(h.storage.scan().handles.length, 1);
  h.server.api.getSession = get;
  h.actor.send({ type: "RETRY" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.server.calls.answer, 1);
});
test("snapshot_unavailable never drops credential or bypasses the creation gate", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.server.api.getSession = async () => {
    throw clientFailure(ERROR_CODE.SNAPSHOT_UNAVAILABLE);
  };
  h.open(session);
  await until(h.actor, { viewing: "readFailed" });
  assert.equal(h.storage.scan().handles.length, 1);
  h.actor.send({ type: "HISTORY" });
  await until(h.actor, { history: "ready" });
  h.start();
  await until(h.actor, { creation: "ready" });
  assert.equal(h.server.calls.create, 0);
});
test("background refresh preserves the current choice/timer; offline time is excluded", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  h.actor.send({ type: "SELECT_OPTION", option: 2 });
  h.setNow(Date.parse(createdAt) + 30_000);
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.actor.getSnapshot().context.selectedOption, 2);
  assert.equal(
    h.actor.getSnapshot().context.questionStartedAt,
    Date.parse(createdAt),
  );
  h.actor.send({ type: "OFFLINE" });
  h.setNow(Date.parse(createdAt) + 90_000);
  h.actor.send({ type: "FOCUS_RETURN" });
  h.actor.send({ type: "SUBMIT_ANSWER" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.current().acceptedAnswers[0]?.timeSpentSeconds, 30);
});
test("timer bounds and in-process retries preserve original duration", async (t) => {
  assert.equal(boundedDuration(1000, 0), 0);
  assert.equal(boundedDuration(0, 10_000_000), 3600);
  assert.equal(boundedDuration(0, Number.NaN), 0);
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  h.setNow(Date.parse(createdAt) + 4_000_000);
  h.submit();
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.current().acceptedAnswers[0]?.timeSpentSeconds, 3600);
});

test("Cancel during discovery stops queued creation; a later explicit Start may create", async (t) => {
  const h = fixture(t);
  await h.boot();
  let arrived!: () => void;
  let release!: () => void;
  const checking = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  const discover = h.server.api.discoverSessions;
  h.server.api.discoverSessions = async (known) => {
    arrived();
    await response;
    return discover(known);
  };
  h.start();
  await checking;
  h.actor.send({ type: "CANCEL" });
  release();
  await h.recovery.check(null);
  assert.ok(h.actor.getSnapshot().matches({ history: "ready" }));
  assert.equal(h.server.calls.create, 0);
  h.start();
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.server.calls.create, 1);
});

test("Cancel after create was sent retains the arriving credential without resuming or creating twice", async (t) => {
  const h = fixture(t);
  await h.boot();
  let arrived!: () => void;
  let release!: () => void;
  const creating = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  const create = h.server.api.createSession;
  h.server.api.createSession = async (...args) => {
    const created = await create(...args);
    arrived();
    await response;
    return created;
  };
  h.start();
  await creating;
  h.actor.send({ type: "CANCEL" });
  release();
  const recovered = await h.recovery.check(null);
  assert.equal(recovered.history.length, 1);
  assert.equal(h.actor.getSnapshot().context.view, null);
  assert.ok(h.actor.getSnapshot().matches({ history: "ready" }));
  h.start();
  await until(h.actor, { creation: "ready" });
  assert.equal(h.server.calls.create, 1);
  assert.equal(h.server.calls.resume, 0);
  assert.equal(h.server.calls.get, 0);
  assert.equal(h.storage.scan().handles.length, 1);
});

test("creation failure retries the original configuration", async (t) => {
  const h = fixture(t);
  await h.boot();
  const create = h.server.api.createSession;
  h.server.api.createSession = async () => {
    throw new Error("offline");
  };
  const requested = { ...configuration, targetLevel: DIFFICULTY.SENIOR };
  h.start(requested);
  await until(h.actor, { creation: "createFailed" });
  h.actor.send({ type: "CONFIGURE", configuration });
  h.server.api.createSession = create;
  h.actor.send({ type: "RETRY" });
  await until(h.actor, { attempting: "answering" });
  assert.deepEqual(h.current().configuration, requested);
  assert.equal(h.server.calls.get, 0);
});
