import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import type { ActorRefFrom, SnapshotFrom } from "xstate";
import { createActor, waitFor } from "xstate";
import {
  ASSESSMENT_LENGTHS,
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  DIFFICULTY,
  SESSION_VIEW,
  SESSION_STATUS,
} from "@/domain/constants";
import { CLIENT_ERROR_CODE, ERROR_CODE } from "@/server/errors";
import {
  assessmentMachine,
  advisoryRefreshDelay,
  attachAssessmentBrowserEvents,
  boundedDuration,
  firstUnanswered,
} from "./assessmentMachine";
import { createSessionRecovery } from "./sessionRecovery";
import {
  createSessionStorage,
  createSessionLock,
  STORAGE_ISSUE,
  SESSION_STORAGE_PREFIX,
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
import type { AssessmentEvent } from "./assessmentMachine";

type Actor = ActorRefFrom<typeof assessmentMachine>;
type State = Parameters<SnapshotFrom<typeof assessmentMachine>["matches"]>[0];
function until(actor: Actor, state: State) {
  return waitFor(actor, (snapshot) => snapshot.matches(state), {
    timeout: 2000,
  });
}
function deferred(t: TestContext) {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  t.after(() => resolve());
  return { promise, resolve };
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
  function submit(optionId = 0) {
    actor.send({ type: "SELECT_OPTION", optionId });
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

test("SSR/bootstrap and CONFIGURE have no storage/network effects until BOOTSTRAP or explicit Start", async (t) => {
  const h = fixture(t);
  const scan = t.mock.method(h.storage, "scan");
  h.actor.send({ type: "START" });
  h.actor.send({ type: "CONFIGURE", configuration });
  h.actor.send({ type: "REFRESH" });
  await Promise.resolve();
  assert.ok(h.actor.getSnapshot().matches("bootstrap"));
  assert.deepEqual(
    h.actor.getSnapshot().context.requestedConfiguration,
    configuration,
  );
  assert.equal(scan.mock.callCount(), 0);
  assert.equal(h.server.calls.discover, 0);
  assert.equal(h.server.calls.create, 0);
  assert.equal(h.port.writes.length, 0);
  await h.boot();
  assert.equal(scan.mock.callCount(), 1);
  assert.equal(h.server.calls.discover, 1);
  assert.equal(h.server.calls.create, 0);
  assert.equal(h.server.calls.resume, 0);
});

test(
  "explicit Start before BOOTSTRAP waits for discovery and ignores a late BOOTSTRAP",
  { timeout: 3000 },
  async (t) => {
    const h = fixture(t);
    const entered = deferred(t);
    const response = deferred(t);
    const discover = h.server.api.discoverSessions;
    t.mock.method(
      h.server.api,
      "discoverSessions",
      async (known: Parameters<typeof discover>[0]) => {
        entered.resolve();
        await response.promise;
        return discover(known);
      },
    );
    const requested = { ...configuration, targetLevel: DIFFICULTY.SENIOR };
    h.start(requested);
    assert.ok(h.actor.getSnapshot().matches({ creation: "creating" }));
    await entered.promise;
    h.actor.send({ type: "BOOTSTRAP" });
    assert.ok(h.actor.getSnapshot().matches({ creation: "creating" }));
    assert.equal(h.server.calls.create, 0);
    response.resolve();
    await until(h.actor, { attempting: "answering" });
    assert.deepEqual(h.current().configuration, requested);
    assert.equal(h.server.calls.discover, 1);
    assert.equal(h.server.calls.create, 1);
    assert.equal(h.server.calls.resume, 0);
    h.actor.send({ type: "CONFIGURE", configuration });
    assert.deepEqual(
      h.actor.getSnapshot().context.requestedConfiguration,
      requested,
    );
    assert.deepEqual(h.current().configuration, requested);
  },
);

for (const entry of ["BOOTSTRAP", "REFRESH"] as const)
  for (const blocksCreation of [false, true])
    test(
      `${entry}: Start supersedes deferred passive discovery and ${blocksCreation ? "reveals a fresh blocker" : "creates only after a fresh full check"}`,
      { timeout: 3000 },
      async (t) => {
        const saved = makeSession();
        saved.completed = true;
        const h = fixture(t, [saved]);
        if (entry === "REFRESH") await h.boot();
        const previousHistory = h.actor.getSnapshot().context.history;
        const passiveEntered = deferred(t);
        const passiveResponse = deferred(t);
        const activeEntered = deferred(t);
        const activeResponse = deferred(t);
        const check = t.mock.method(h.recovery, "check");
        const scan = t.mock.method(h.storage, "scan");
        const save = t.mock.method(h.storage, "save");
        const create = t.mock.method(h.server.api, "createSession");
        const discover = h.server.api.discoverSessions;
        const discovery = t.mock.method(
          h.server.api,
          "discoverSessions",
          async (known: Parameters<typeof discover>[0]) => {
            const result = await discover(known);
            if (discovery.mock.callCount() === 1) {
              passiveEntered.resolve();
              await passiveResponse.promise;
            } else {
              activeEntered.resolve();
              await activeResponse.promise;
            }
            return result;
          },
        );
        h.actor.send({ type: entry });
        await passiveEntered.promise;
        assert.ok(h.actor.getSnapshot().matches({ history: "checking" }));
        const passiveSignal = check.mock.calls[0]!.arguments[1];
        assert.ok(passiveSignal);
        assert.equal(passiveSignal.aborted, false);
        assert.equal(h.server.calls.create, 0);
        assert.equal(h.server.calls.resume, 0);

        // A different tab saves a handle after the passive scan; Start must rescan.
        const added = makeSession();
        added.completed = !blocksCreation;
        h.server.sessions.set(added.credential.sessionId, added);
        h.storage.save(added.credential);
        const savesBeforeStart = save.mock.callCount();
        const requested = { ...configuration, targetLevel: DIFFICULTY.SENIOR };
        h.start(requested);
        assert.ok(h.actor.getSnapshot().matches({ creation: "creating" }));
        assert.equal(passiveSignal.aborted, true);
        assert.deepEqual(check.mock.calls[1]!.arguments[0], requested);
        assert.equal(check.mock.calls[1]!.arguments[1]?.aborted, false);
        assert.equal(discovery.mock.callCount(), 1);
        assert.equal(h.server.calls.create, 0);
        passiveResponse.resolve();
        await activeEntered.promise;
        assert.ok(h.actor.getSnapshot().matches({ creation: "creating" }));
        assert.deepEqual(
          h.actor.getSnapshot().context.history,
          previousHistory,
        );
        assert.equal(save.mock.callCount(), savesBeforeStart);
        assert.equal(scan.mock.callCount(), 2);
        assert.deepEqual(discovery.mock.calls[1]!.arguments[0], [
          saved.credential,
          added.credential,
        ]);
        assert.equal(h.server.calls.create, 0);
        activeResponse.resolve();
        await until(
          h.actor,
          blocksCreation ? { creation: "ready" } : { attempting: "answering" },
        );
        assert.deepEqual(h.actor.getSnapshot().context.history, [
          h.server.metadata(saved),
          h.server.metadata(added),
        ]);
        assert.equal(h.server.calls.create, blocksCreation ? 0 : 1);
        assert.equal(h.server.calls.resume, 0);
        assert.equal(h.server.calls.get, 0);
        if (blocksCreation) {
          assert.equal(h.actor.getSnapshot().context.view, null);
        } else {
          assert.deepEqual(create.mock.calls[0]!.arguments, [
            requested,
            [saved.credential, added.credential],
          ]);
          assert.deepEqual(h.current().configuration, requested);
        }
      },
    );

test(
  "bootstrap Start preserves the server gate when a blocker changes after discovery",
  { timeout: 3000 },
  async (t) => {
    const session = makeSession();
    session.completed = true;
    const h = fixture(t, [session]);
    const discover = h.server.api.discoverSessions;
    t.mock.method(
      h.server.api,
      "discoverSessions",
      async (known: Parameters<typeof discover>[0]) => {
        const result = await discover(known);
        session.completed = false;
        return result;
      },
    );
    const create = t.mock.method(h.server.api, "createSession");
    h.start();
    await until(h.actor, { creation: "ready" });
    assert.deepEqual(create.mock.calls[0]!.arguments, [
      configuration,
      [session.credential],
    ]);
    assert.equal(h.server.sessions.size, 1);
    assert.deepEqual(h.actor.getSnapshot().context.history, [
      h.server.metadata(session),
    ]);
    assert.equal(h.actor.getSnapshot().context.view, null);
    assert.equal(h.server.calls.resume, 0);
  },
);

for (const blocksCreation of [false, true])
  test(
    `failed history discovery then explicit Start rechecks and ${blocksCreation ? "keeps the blocker" : "creates"}`,
    { timeout: 3000 },
    async (t) => {
      const session = makeSession();
      session.completed = !blocksCreation;
      const h = fixture(t, [session]);
      const discover = h.server.api.discoverSessions;
      const discovery = t.mock.method(
        h.server.api,
        "discoverSessions",
        async () => {
          throw new Error("offline");
        },
      );
      h.actor.send({ type: "BOOTSTRAP" });
      await until(h.actor, { history: "checkFailed" });
      assert.equal(
        h.actor.getSnapshot().context.error,
        CLIENT_ERROR_CODE.REQUEST_FAILED,
      );
      assert.equal(h.server.calls.create, 0);
      const entered = deferred(t);
      const response = deferred(t);
      discovery.mock.mockImplementation(async (known) => {
        entered.resolve();
        await response.promise;
        return discover(known);
      });
      const requested = { ...configuration, targetLevel: DIFFICULTY.SENIOR };
      h.start(requested);
      assert.ok(h.actor.getSnapshot().matches({ creation: "creating" }));
      assert.equal(h.actor.getSnapshot().context.error, null);
      await entered.promise;
      assert.equal(h.server.calls.create, 0);
      assert.deepEqual(discovery.mock.calls[1]!.arguments[0], [
        session.credential,
      ]);
      response.resolve();
      await until(
        h.actor,
        blocksCreation ? { creation: "ready" } : { attempting: "answering" },
      );
      assert.equal(discovery.mock.callCount(), 2);
      assert.equal(h.server.calls.create, blocksCreation ? 0 : 1);
      assert.equal(h.server.calls.resume, 0);
      assert.deepEqual(
        h.actor.getSnapshot().context.requestedConfiguration,
        requested,
      );
      assert.deepEqual(h.actor.getSnapshot().context.history, [
        h.server.metadata(session),
      ]);
      if (!blocksCreation)
        assert.deepEqual(h.current().configuration, requested);
    },
  );

test(
  "REFRESH recovers failed history discovery without auto-resume or auto-create",
  { timeout: 3000 },
  async (t) => {
    const session = makeSession();
    const h = fixture(t, [session]);
    const discover = h.server.api.discoverSessions;
    const discovery = t.mock.method(
      h.server.api,
      "discoverSessions",
      async () => {
        throw new Error("offline");
      },
    );
    h.actor.send({ type: "BOOTSTRAP" });
    await until(h.actor, { history: "checkFailed" });
    h.actor.send({ type: "CONFIGURE", configuration });
    assert.deepEqual(
      h.actor.getSnapshot().context.requestedConfiguration,
      configuration,
    );
    discovery.mock.mockImplementation(discover);
    h.actor.send({ type: "REFRESH" });
    await until(h.actor, { history: "ready" });
    assert.equal(h.actor.getSnapshot().context.error, null);
    assert.deepEqual(h.actor.getSnapshot().context.history, [
      h.server.metadata(session),
    ]);
    assert.equal(h.actor.getSnapshot().context.view, null);
    assert.equal(h.server.calls.create, 0);
    assert.equal(h.server.calls.resume, 0);
    assert.equal(discovery.mock.callCount(), 2);
  },
);
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
    h.actor.send({ type: "SELECT_OPTION", optionId: 2 });
    h.actor.send({ type: "HISTORY" });
    await until(h.actor, { history: "ready" });
    h.open(session);
    await until(h.actor, { viewing: "ready" });
    assert.equal(h.actor.getSnapshot().context.selectedOptionId, null);
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
  h.actor.send({ type: "SELECT_OPTION", optionId: 0 });
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
  assert.equal(h.current().acceptedAnswers[0]?.selectedOptionId, 3);
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
  assert.equal(
    h.actor.getSnapshot().context.notice,
    DELETE_OUTCOME.CHANGED_STATE,
  );
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
test("blocked removal on access expiry retains credentials and displays the recovery warning", async (t) => {
  const session = makeSession();
  session.completed = true;
  const other = makeSession();
  const h = fixture(t, [session, other]);
  await h.boot();
  h.open(session);
  await until(h.actor, "completed");
  assert.equal(h.actor.getSnapshot().context.storageIssue, null);
  const before = h.storage.scan().handles;
  h.port.blockRemove = true;
  h.setNow(Date.parse(accessExpiresAt));
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, "unavailable");
  const context = h.actor.getSnapshot().context;
  assert.equal(context.view, null);
  assert.deepEqual(h.storage.scan().handles, before);
  assert.deepEqual(
    context.history.map((entry) => entry.sessionId),
    [other.credential.sessionId],
  );
  assert.equal(h.recovery.warning, STORAGE_ISSUE.UNAVAILABLE);
  assert.equal(context.storageIssue, STORAGE_ISSUE.UNAVAILABLE);
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
  assert.equal(
    h.actor.getSnapshot().context.error,
    CLIENT_ERROR_CODE.REQUEST_FAILED,
  );
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
test("advisory refresh waits for access expiry after the attempt has expired", async () => {
  const session = makeSession();
  const server = fakeServer([session]);
  const now = Date.parse(attemptExpiresAt) + 60_000;
  server.setNow(now);
  const view = await server.api.getSession(session.credential);
  assert.equal(view.kind, SESSION_VIEW.ATTEMPT_EXPIRED);
  assert.equal(advisoryRefreshDelay(view, [], false, now), 518_340_000);
  assert.equal(
    advisoryRefreshDelay(view, [], false, now + 30_000),
    518_310_000,
  );
});

for (const legacy of [false, true])
  test(`advisory refresh keeps ${legacy ? "legacy summaries" : "reports"} on the access deadline`, async () => {
    const session = makeSession();
    session.completed = true;
    session.legacy = legacy;
    const server = fakeServer([session]);
    const now = Date.parse(attemptExpiresAt) + 60_000;
    server.setNow(now);
    const view = await server.api.getSession(session.credential);
    assert.equal(advisoryRefreshDelay(view, [], false, now), 518_340_000);
  });

test("advisory refresh keeps active attempt deadlines and clock-skew retries", () => {
  const { assessment } = makeSession();
  const now = Date.parse(createdAt);
  assert.equal(advisoryRefreshDelay(assessment, [], false, now), 86_400_000);
  assert.equal(
    advisoryRefreshDelay(assessment, [], false, Date.parse(attemptExpiresAt)),
    30_000,
  );
});

test("advisory refresh bounds creation-gate polling without polling idle intake", () => {
  const history = [makeSession().assessment];
  const now = Date.parse(createdAt);
  assert.equal(advisoryRefreshDelay(null, history, false, now), null);
  assert.equal(advisoryRefreshDelay(null, [], true, now), 30_000);
  assert.equal(advisoryRefreshDelay(null, history, true, now), 30_000);
  assert.equal(
    advisoryRefreshDelay(
      null,
      history,
      true,
      Date.parse(attemptExpiresAt) - 5000,
    ),
    5000,
  );
  assert.equal(
    advisoryRefreshDelay(null, history, true, Date.parse(attemptExpiresAt)),
    30_000,
  );
});

test("background refresh preserves the current choice/timer; offline time is excluded", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  h.actor.send({ type: "SELECT_OPTION", optionId: 2 });
  h.setNow(Date.parse(createdAt) + 30_000);
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.actor.getSnapshot().context.selectedOptionId, 2);
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
class VisibilityTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}
function browserEvents() {
  return {
    window: new EventTarget(),
    document: new VisibilityTarget(),
    navigator: { onLine: true },
  };
}

test("browser listeners exclude hidden online reconciliation from submitted duration", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  const browser = browserEvents();
  const send = (event: AssessmentEvent) => h.actor.send(event);
  let detach = attachAssessmentBrowserEvents(send, true, browser);
  t.after(() => detach());
  const start = Date.parse(createdAt);
  h.setNow(start + 10_000);
  browser.document.visibilityState = "hidden";
  browser.document.dispatchEvent(new Event("visibilitychange"));
  browser.navigator.onLine = false;
  browser.window.dispatchEvent(new Event("offline"));

  let arrived!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const get = h.server.api.getSession;
  h.server.api.getSession = async (known) => {
    arrived();
    await response;
    return get(known);
  };
  h.setNow(start + 70_000);
  browser.navigator.onLine = true;
  browser.window.dispatchEvent(new Event("online"));
  await entered;
  await until(h.actor, { attempting: "reconciling" });
  const pausedDuringRead = h.actor.getSnapshot().context.timerPausedAt;
  // Exercise the effect's cleanup/rebind across reconciling and answering.
  detach();
  detach = attachAssessmentBrowserEvents(send, false, browser);
  h.setNow(start + 100_000);
  release();
  await until(h.actor, { attempting: "answering" });
  detach();
  detach = attachAssessmentBrowserEvents(send, true, browser);

  h.setNow(start + 130_000);
  browser.document.visibilityState = "visible";
  browser.document.dispatchEvent(new Event("visibilitychange"));
  await until(h.actor, { attempting: "answering" });
  const submit = t.mock.method(h.server.api, "submitAnswer");
  h.submit();
  await until(h.actor, { attempting: "answering" });
  assert.equal(submit.mock.calls[0]!.arguments[0].answer.timeSpentSeconds, 10);
  assert.equal(h.current().acceptedAnswers[0]?.timeSpentSeconds, 10);
  assert.equal(pausedDuringRead, start + 10_000);
  assert.equal(h.server.calls.get, 2);
});

test("browser listeners keep visible-offline time paused until online", async (t) => {
  const session = makeSession();
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  const browser = browserEvents();
  const detach = attachAssessmentBrowserEvents(
    (event) => h.actor.send(event),
    true,
    browser,
  );
  t.after(detach);
  const start = Date.parse(createdAt);
  h.setNow(start + 10_000);
  browser.document.visibilityState = "hidden";
  browser.document.dispatchEvent(new Event("visibilitychange"));
  browser.navigator.onLine = false;
  browser.window.dispatchEvent(new Event("offline"));
  h.setNow(start + 70_000);
  browser.document.visibilityState = "visible";
  browser.document.dispatchEvent(new Event("visibilitychange"));
  browser.window.dispatchEvent(new Event("focus"));
  assert.equal(h.actor.getSnapshot().context.timerPausedAt, start + 10_000);
  assert.equal(h.server.calls.get, 0);
  h.setNow(start + 130_000);
  browser.navigator.onLine = true;
  browser.window.dispatchEvent(new Event("online"));
  await until(h.actor, { attempting: "answering" });
  h.submit();
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.current().acceptedAnswers[0]?.timeSpentSeconds, 10);
});

test("browser listeners preserve storage filtering, initial pause and cleanup", () => {
  const browser = browserEvents();
  browser.navigator.onLine = false;
  const events: AssessmentEvent[] = [];
  const detach = attachAssessmentBrowserEvents(
    (event) => events.push(event),
    true,
    browser,
  );
  assert.deepEqual(events, [{ type: "OFFLINE" }]);
  events.length = 0;
  const storage = (key: string | null) =>
    browser.window.dispatchEvent(Object.assign(new Event("storage"), { key }));
  storage("unrelated");
  storage(SESSION_STORAGE_PREFIX + "saved-id");
  storage(null);
  assert.deepEqual(events, [{ type: "REFRESH" }, { type: "REFRESH" }]);
  events.length = 0;
  browser.navigator.onLine = true;
  browser.window.dispatchEvent(new Event("focus"));
  assert.deepEqual(events, [{ type: "FOCUS_RETURN" }, { type: "REFRESH" }]);
  detach();
  events.length = 0;
  browser.document.visibilityState = "hidden";
  browser.document.dispatchEvent(new Event("visibilitychange"));
  for (const type of ["online", "offline", "focus"])
    browser.window.dispatchEvent(new Event(type));
  storage(null);
  assert.deepEqual(events, []);
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

test("selection uses question-local option IDs, not array positions", async (t) => {
  const session = makeSession();
  session.assessment.questions[0]!.options = [42, 7, 99, 100].map((id) => ({
    id,
    text: String(id),
  }));
  const h = fixture(t, [session]);
  await h.boot();
  h.resume(session);
  await until(h.actor, { attempting: "answering" });
  for (const optionId of [0, 1, 2, 3, -1, 7.5, NaN, Infinity]) {
    h.actor.send({ type: "SELECT_OPTION", optionId });
    h.actor.send({ type: "SUBMIT_ANSWER" });
    assert.equal(h.actor.getSnapshot().context.selectedOptionId, null);
    assert.ok(h.actor.getSnapshot().matches({ attempting: "answering" }));
  }
  assert.equal(h.server.calls.answer, 0);
  h.actor.send({ type: "SELECT_OPTION", optionId: 99 });
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, { attempting: "answering" });
  assert.equal(h.actor.getSnapshot().context.selectedOptionId, 99);
  h.setNow(Date.parse(createdAt) + 9000);
  h.actor.send({ type: "SUBMIT_ANSWER" });
  await until(h.actor, { attempting: "answering" });
  assert.deepEqual(h.current().acceptedAnswers[0], {
    questionId: "question-0",
    selectedOptionId: 99,
    timeSpentSeconds: 9,
  });
  assert.equal(h.actor.getSnapshot().context.selectedOptionId, null);
});

for (const code of [ERROR_CODE.CLIENT_UPDATE_REQUIRED]) {
  for (const operation of ["read", "resume", "answer", "complete"] as const) {
    test(`${code} during ${operation} stays in existing failure state without retry/reconciliation or credential loss`, async (t) => {
      const session = makeSession();
      if (operation === "complete")
        session.assessment.questions.forEach((_, index) =>
          accept(session, index),
        );
      const h = fixture(t, [session]);
      await h.boot();
      const before = [...h.port.values];
      const fail = t.mock.fn(async () => {
        throw clientFailure(code);
      });
      let state: State;
      if (operation === "read") {
        h.server.api.getSession = fail;
        h.open(session);
        state = { viewing: "readFailed" };
      } else if (operation === "resume") {
        h.server.api.resumeSession = fail;
        h.resume(session);
        state = { attempting: "resumeFailed" };
      } else if (operation === "complete") {
        h.server.api.completeSession = fail;
        h.resume(session);
        state = { attempting: "completeFailed" };
      } else {
        h.resume(session);
        await until(h.actor, { attempting: "answering" });
        h.server.api.submitAnswer = fail;
        h.setNow(Date.parse(createdAt) + 6000);
        h.submit(2);
        state = { attempting: "answerFailed" };
      }
      await until(h.actor, state);
      assert.equal(h.actor.getSnapshot().context.error, code);
      const pending = h.actor.getSnapshot().context.pendingAnswer;
      if (operation === "answer")
        assert.deepEqual(pending, {
          questionId: "question-0",
          selectedOptionId: 2,
          timeSpentSeconds: 6,
        });
      h.actor.send({ type: "RETRY" });
      h.actor.send({ type: "REFRESH" });
      h.actor.send({ type: "RETRY" });
      assert.ok(h.actor.getSnapshot().matches(state));
      assert.equal(fail.mock.callCount(), 1);
      assert.equal(h.server.calls.get, 0);
      assert.deepEqual(h.actor.getSnapshot().context.pendingAnswer, pending);
      assert.deepEqual([...h.port.values], before);
      h.actor.send({ type: "HISTORY" });
      await until(h.actor, { history: "ready" });
      h.start();
      await until(h.actor, { creation: "ready" });
      assert.equal(h.server.calls.create, 0);
    });
  }
}

for (const operation of ["create", "delete", "survey"] as const) {
  test(`client_update_required during ${operation} does not retry, reconcile or erase credentials`, async (t) => {
    const session = makeSession();
    session.completed = operation === "survey";
    const h = fixture(t, operation === "create" ? [] : [session]);
    await h.boot();
    const fail = t.mock.fn(async () => {
      throw clientFailure(ERROR_CODE.CLIENT_UPDATE_REQUIRED);
    });
    let state: State;
    if (operation === "create") {
      h.server.api.createSession = fail;
      h.start();
      state = { creation: "createFailed" };
    } else if (operation === "delete") {
      h.server.api.deleteSession = fail;
      h.actor.send({
        type: "DELETE",
        sessionId: session.credential.sessionId,
        expectedState: DELETE_EXPECTATION.UNFINISHED,
      });
      h.actor.send({ type: "CONFIRM_DELETE" });
      state = "deleteFailed";
    } else {
      h.open(session);
      await until(h.actor, "completed");
      h.server.api.submitSurvey = fail;
      h.actor.send({ type: "SUBMIT_SURVEY", rating: 4 });
      state = { completed: "surveyPrompt" };
    }
    await until(h.actor, state);
    const reads = h.server.calls.get;
    assert.equal(
      h.actor.getSnapshot().context.error,
      ERROR_CODE.CLIENT_UPDATE_REQUIRED,
    );
    h.actor.send({ type: "RETRY" });
    h.actor.send({ type: "REFRESH" });
    h.actor.send({ type: "SUBMIT_SURVEY", rating: 5 });
    assert.ok(h.actor.getSnapshot().matches(state));
    assert.equal(fail.mock.callCount(), 1);
    assert.equal(h.server.calls.get, reads);
    assert.equal(
      h.storage.scan().handles.length,
      operation === "create" ? 0 : 1,
    );
  });
}

for (const code of [
  ERROR_CODE.INTERNAL_ERROR,
  ERROR_CODE.RATE_LIMITED,
  ERROR_CODE.BAD_REQUEST,
  ERROR_CODE.INSUFFICIENT_QUESTIONS,
  ERROR_CODE.SNAPSHOT_UNAVAILABLE,
]) {
  test(`${code} answer retries preserve the original option ID and duration`, async (t) => {
    const session = makeSession();
    const h = fixture(t, [session]);
    await h.boot();
    h.resume(session);
    await until(h.actor, { attempting: "answering" });
    const submit = h.server.api.submitAnswer;
    const calls: unknown[] = [];
    h.server.api.submitAnswer = async (input) => {
      calls.push(structuredClone(input));
      if (calls.length === 1) throw clientFailure(code);
      return submit(input);
    };
    h.setNow(Date.parse(createdAt) + 4000);
    h.submit(2);
    await until(h.actor, { attempting: "answerFailed" });
    h.setNow(Date.parse(createdAt) + 90_000);
    h.actor.send({ type: "SELECT_OPTION", optionId: 0 });
    h.actor.send({ type: "RETRY" });
    await until(h.actor, { attempting: "answering" });
    assert.deepEqual(calls[1], calls[0]);
    assert.deepEqual(h.current().acceptedAnswers[0], {
      questionId: "question-0",
      selectedOptionId: 2,
      timeSpentSeconds: 4,
    });
  });
}

test("setError preserves the previous storage warning when a failed recheck has no new warning", async (t) => {
  const h = fixture(t);
  h.port.blockRead = true;
  await h.boot();
  assert.equal(
    h.actor.getSnapshot().context.storageIssue,
    STORAGE_ISSUE.UNAVAILABLE,
  );
  h.port.blockRead = false;
  const discover = h.server.api.discoverSessions;
  h.server.api.discoverSessions = async () => {
    throw clientFailure(ERROR_CODE.CLIENT_UPDATE_REQUIRED);
  };
  h.actor.send({ type: "REFRESH" });
  await until(h.actor, { history: "checkFailed" });
  assert.equal(h.recovery.warning, null);
  assert.equal(
    h.actor.getSnapshot().context.storageIssue,
    STORAGE_ISSUE.UNAVAILABLE,
  );
  h.server.api.discoverSessions = discover;
  h.actor.send({ type: "HISTORY" });
  await until(h.actor, { history: "ready" });
  assert.equal(h.actor.getSnapshot().context.storageIssue, null);
});

for (const code of [
  ERROR_CODE.INSUFFICIENT_QUESTIONS,
  ERROR_CODE.SNAPSHOT_UNAVAILABLE,
]) {
  test(`${code} creation keeps Try again active and retries the original configuration`, async (t) => {
    const h = fixture(t);
    await h.boot();
    const create = h.server.api.createSession;
    h.server.api.createSession = async () => {
      throw clientFailure(code);
    };
    const requested = { ...configuration, targetLevel: DIFFICULTY.SENIOR };
    h.start(requested);
    await until(h.actor, { creation: "createFailed" });
    assert.equal(h.actor.getSnapshot().context.error, code);
    assert.ok(h.actor.getSnapshot().can({ type: "RETRY" }));
    h.server.api.createSession = create;
    h.actor.send({ type: "RETRY" });
    await until(h.actor, { attempting: "answering" });
    assert.deepEqual(h.current().configuration, requested);
  });
}

for (const operation of ["read", "resume", "complete"] as const) {
  test(`snapshot_unavailable during ${operation} retains the existing retry path`, async (t) => {
    const session = makeSession();
    if (operation === "complete")
      session.assessment.questions.forEach((_, index) =>
        accept(session, index),
      );
    const h = fixture(t, [session]);
    await h.boot();
    const original = { ...h.server.api };
    const fail = async () => {
      throw clientFailure(ERROR_CODE.SNAPSHOT_UNAVAILABLE);
    };
    let state: State;
    if (operation === "read") {
      h.server.api.getSession = fail;
      h.open(session);
      state = { viewing: "readFailed" };
    } else {
      if (operation === "resume") h.server.api.resumeSession = fail;
      else h.server.api.completeSession = fail;
      h.resume(session);
      state = {
        attempting: operation === "resume" ? "resumeFailed" : "completeFailed",
      };
    }
    await until(h.actor, state);
    assert.ok(h.actor.getSnapshot().can({ type: "RETRY" }));
    Object.assign(h.server.api, original);
    h.actor.send({ type: "RETRY" });
    await until(
      h.actor,
      operation === "complete"
        ? "completed"
        : operation === "resume"
          ? { attempting: "answering" }
          : { viewing: "ready" },
    );
    assert.equal(h.server.calls.get, operation === "resume" ? 0 : 1);
    assert.equal(h.storage.scan().handles.length, 1);
  });
}

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
