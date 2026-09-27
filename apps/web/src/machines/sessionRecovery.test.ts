import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSessionStorage,
  createSessionLock,
  SESSION_STORAGE_PREFIX,
  SESSION_LOCK_NAME,
  STORAGE_ISSUE,
} from "./sessionStorage";
import {
  createSessionRecovery,
  DiscoveryIncompleteError,
} from "./sessionRecovery";
import {
  configuration,
  fakeServer,
  makeSession,
  MemoryStorage,
  attemptExpiresAt,
  accessExpiresAt,
  clientFailure,
} from "./sessionTestFixtures";
import {
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  DIFFICULTY,
  MAX_KNOWN_SESSION_CREDENTIALS,
  SESSION_VIEW,
} from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import { AssessmentClientError } from "./createSessionAdapter";

function fixture(initial = [makeSession()]) {
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
  return { port, storage, server, recovery, initial };
}
test("all handles, not active/configuration hints, are discovered before any create", async () => {
  const h = fixture([makeSession(), makeSession(), makeSession()]);
  h.initial[0]!.completed = true;
  h.initial[1]!.assessment.configuration.targetLevel = DIFFICULTY.SENIOR;
  h.port.setItem("devgrade.activeSession", h.initial[0]!.credential.sessionId);
  const checked: string[][] = [];
  const discover = h.server.api.discoverSessions;
  h.server.api.discoverSessions = async (credentials) => {
    checked.push(credentials.map((c) => c.sessionId));
    return discover(credentials);
  };
  const result = await h.recovery.check(configuration);
  assert.equal(h.server.calls.create, 0);
  assert.equal(
    result.history.filter((entry) => entry.blocksCreation).length,
    2,
  );
  assert.equal(checked[0]?.length, 3);
  assert.equal(h.storage.scan().handles.length, 3);
});
test("completed and expired handles are retained and the FULL list is supplied for the final server recheck", async () => {
  const h = fixture([makeSession(), makeSession()]);
  h.initial[0]!.completed = true;
  h.initial[1]!.assessment.attemptExpiresAt = "2026-09-24T12:00:00.000Z";
  let knownIds: string[] = [];
  const create = h.server.api.createSession;
  h.server.api.createSession = async (config, known) => {
    knownIds = known.map((c) => c.sessionId);
    return create(config, known);
  };
  const result = await h.recovery.check(configuration);
  assert.ok(result.created);
  assert.equal("sessionToken" in result.created, false);
  assert.equal(JSON.stringify(result).includes("sessionToken"), false);
  assert.equal(result.created.kind, SESSION_VIEW.ASSESSMENT);
  assert.equal(h.server.calls.get, 0);
  assert.deepEqual(
    knownIds.sort(),
    h.initial.map((s) => s.credential.sessionId).sort(),
  );
  assert.equal(h.storage.scan().handles.length, 3);
});
test("a final server existing_attempt response becomes a choice, not blind retry", async () => {
  const h = fixture([]);
  const blocker = makeSession();
  h.server.api.createSession = async () => {
    throw new AssessmentClientError({
      code: ERROR_CODE.EXISTING_ATTEMPT,
      message: "Blocked",
      blockers: [h.server.metadata(blocker)],
    });
  };
  const result = await h.recovery.check(configuration);
  assert.equal(result.created, null);
  assert.equal(result.history[0]?.blocksCreation, true);
});
test("incomplete discovery is a failure, even if the returned subset is non-blocking", async () => {
  const h = fixture();
  h.server.api.discoverSessions = async () => ({ sessions: [] });
  await assert.rejects(
    h.recovery.check(configuration),
    DiscoveryIncompleteError,
  );
  assert.equal(h.server.calls.create, 0);
  assert.equal(h.storage.scan().handles.length, 1);
});
for (const mode of ["blocked", "full", "corrupt"] as const)
  test(`${mode} storage fails closed BEFORE creation and preserves data`, async () => {
    const h = fixture([]);
    if (mode === "blocked") h.port.blockRead = true;
    if (mode === "full") h.port.blockWrite = true;
    if (mode === "corrupt")
      h.port.values.set(SESSION_STORAGE_PREFIX + "bad", "{");
    const before = [...h.port.values];
    const result = await h.recovery.check(configuration);
    assert.ok(result.storageIssue);
    assert.equal(result.created, null);
    assert.equal(h.server.calls.create, 0);
    assert.deepEqual([...h.port.values], before);
  });
test("1,001 known handles fail closed without partial discovery or truncation", async () => {
  const h = fixture(
    Array.from({ length: MAX_KNOWN_SESSION_CREDENTIALS + 1 }, () =>
      makeSession(),
    ),
  );
  const result = await h.recovery.check(configuration);
  assert.equal(result.storageIssue, STORAGE_ISSUE.LIMIT);
  assert.equal(h.server.calls.discover, 0);
  assert.equal(h.server.calls.create, 0);
  assert.equal(h.storage.scan().handles.length, 1001);
});
test("exactly 1,000 handles are all checked", async () => {
  const h = fixture(
    Array.from({ length: MAX_KNOWN_SESSION_CREDENTIALS }, () => makeSession()),
  );
  const result = await h.recovery.check(configuration);
  assert.equal(result.history.length, 1000);
  assert.equal(h.server.calls.discover, 1);
  assert.equal(h.server.calls.create, 0);
});
test("an injected storage adapter throwing after creation still returns the in-memory session", async () => {
  const h = fixture([]);
  h.storage.save = () => {
    throw new Error("quota");
  };
  const result = await h.recovery.check(configuration);
  assert.ok(result.created);
  assert.equal(result.storageIssue, STORAGE_ISSUE.FULL);
  assert.equal(
    (await h.recovery.get(result.created.sessionId)).kind,
    SESSION_VIEW.ASSESSMENT,
  );
  assert.equal((await h.recovery.check(configuration)).created, null);
  assert.equal(h.server.calls.create, 1);
});
test("post-create quota failure keeps credential in memory and later checks never auto-recreate", async () => {
  const h = fixture([]);
  const create = h.server.api.createSession;
  h.server.api.createSession = async (...args) => {
    const result = await create(...args);
    h.port.blockWrite = true;
    return result;
  };
  const result = await h.recovery.check(configuration);
  assert.ok(result.created);
  assert.equal(result.storageIssue, STORAGE_ISSUE.FULL);
  assert.equal(
    (await h.recovery.get(result.created.sessionId)).kind,
    SESSION_VIEW.ASSESSMENT,
  );
  const again = await h.recovery.check(configuration);
  assert.equal(again.history.length, 1);
  assert.equal(again.created, null);
  assert.equal(h.server.calls.create, 1);
  h.port.blockWrite = false;
  await h.recovery.check(null);
  assert.equal(h.storage.scan().handles.length, 1);
});
test("in-memory handle survives inaccessible storage and is still discovered as a blocker", async () => {
  const h = fixture();
  await h.recovery.check(null);
  h.port.blockRead = true;
  const check = await h.recovery.check(configuration);
  assert.equal(check.history.length, 1);
  assert.equal(h.server.calls.create, 0);
  assert.equal(
    (await h.recovery.get(h.initial[0]!.credential.sessionId)).kind,
    SESSION_VIEW.ASSESSMENT,
  );
});
test("transient discovery/read/deletion failures retain ALL credentials", async () => {
  const h = fixture([makeSession(), makeSession()]);
  await h.recovery.check(null);
  const before = [...h.port.values];
  const offline = async () => {
    throw new Error("offline");
  };
  h.server.api.discoverSessions = offline;
  h.server.api.getSession = offline;
  h.server.api.deleteSession = offline;
  await assert.rejects(h.recovery.check(configuration));
  await assert.rejects(h.recovery.get(h.initial[0]!.credential.sessionId));
  await assert.rejects(
    h.recovery.delete(
      h.initial[0]!.credential.sessionId,
      DELETE_EXPECTATION.UNFINISHED,
    ),
  );
  assert.deepEqual([...h.port.values], before);
});
for (const code of [ERROR_CODE.NOT_FOUND, ERROR_CODE.ACCESS_EXPIRED])
  test(`${code} clears ONLY the affected credential`, async () => {
    const h = fixture([makeSession(), makeSession()]);
    await h.recovery.check(null);
    h.server.api.getSession = async () => {
      throw clientFailure(code);
    };
    await assert.rejects(h.recovery.get(h.initial[0]!.credential.sessionId));
    assert.deepEqual(
      h.storage.scan().handles.map((handle) => handle.sessionId),
      [h.initial[1]!.credential.sessionId],
    );
  });
test("generic discovery unavailable clears only invalid/missing/expired entries", async () => {
  const h = fixture([makeSession(), makeSession()]);
  h.server.sessions.delete(h.initial[0]!.credential.sessionId);
  const result = await h.recovery.check(configuration);
  assert.equal(result.history.length, 1);
  assert.equal(h.storage.scan().handles.length, 1);
  assert.equal(h.server.calls.create, 0);
});
test("a damaged hint cannot hide an otherwise valid blocking credential", async () => {
  const h = fixture();
  const saved = h.initial[0]!.credential;
  h.port.setItem(
    SESSION_STORAGE_PREFIX + saved.sessionId,
    JSON.stringify({ ...saved, version: 999 }),
  );
  const result = await h.recovery.check(configuration);
  assert.equal(result.history.length, 1);
  assert.equal(result.storageIssue, STORAGE_ISSUE.CORRUPT);
  assert.equal(h.server.calls.create, 0);
});
test("reads never resume or complete even an all-answered unfinished session", async () => {
  const h = fixture();
  const session = h.initial[0]!;
  session.assessment.acceptedAnswers = session.assessment.questions.map(
    (q) => ({ questionId: q.id, selectedAnswer: 0, timeSpentSeconds: 1 }),
  );
  await h.recovery.check(null);
  await h.recovery.get(session.credential.sessionId);
  assert.equal(h.server.calls.resume, 0);
  assert.equal(h.server.calls.complete, 0);
});
test("two tabs sharing Web Lock serialize final rescan/discover/create/save; prompt holds no lock", async () => {
  const h = fixture([]);
  let held = false;
  const order: string[] = [];
  const sharedLock = createSessionLock(() => undefined);
  const request = ((name: string, operation: () => Promise<unknown>) => {
    assert.equal(name, SESSION_LOCK_NAME);
    return sharedLock(async () => {
      held = true;
      try {
        return await operation();
      } finally {
        held = false;
      }
    });
  }) as LockManager["request"];
  const scan = h.storage.scan.bind(h.storage);
  h.storage.scan = () => {
    assert.ok(held);
    order.push("scan");
    return scan();
  };
  const save = h.storage.save.bind(h.storage);
  h.storage.save = (handle) => {
    assert.ok(held);
    order.push("save");
    return save(handle);
  };
  const discover = h.server.api.discoverSessions;
  h.server.api.discoverSessions = async (known) => {
    assert.ok(held);
    order.push("discover");
    await Promise.resolve();
    return discover(known);
  };
  const create = h.server.api.createSession;
  h.server.api.createSession = async (...args) => {
    assert.ok(held);
    order.push("create");
    return create(...args);
  };
  const tabA = createSessionRecovery(
    h.server.api,
    h.storage,
    createSessionLock(() => ({ request })),
  );
  const tabB = createSessionRecovery(
    h.server.api,
    h.storage,
    createSessionLock(() => ({ request })),
  );
  const [a, b] = await Promise.all([
    tabA.check(configuration),
    tabB.check(configuration),
  ]);
  assert.ok(a.created);
  assert.equal(b.created, null);
  assert.equal(b.history[0]?.sessionId, a.created.sessionId);
  assert.equal(h.server.calls.create, 1);
  assert.equal(held, false);
  assert.deepEqual(order.slice(0, 6), [
    "scan",
    "discover",
    "create",
    "save",
    "scan",
    "discover",
  ]);
  const remove = h.storage.remove.bind(h.storage);
  h.storage.remove = (known) => {
    assert.ok(held);
    return remove(known);
  };
  await tabB.delete(a.created.sessionId, DELETE_EXPECTATION.UNFINISHED);
  assert.equal(held, false);
});
test("without Web Locks per-ID writes preserve both tab handles even when simultaneous creation cannot be serialized", async () => {
  const h = fixture([]);
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.server.api.discoverSessions = async () => {
    arrivals++;
    if (arrivals === 2) release();
    await barrier;
    return { sessions: [] };
  };
  const a = createSessionRecovery(
    h.server.api,
    h.storage,
    createSessionLock(() => undefined),
  );
  const b = createSessionRecovery(
    h.server.api,
    h.storage,
    createSessionLock(() => undefined),
  );
  const results = await Promise.all([
    a.check(configuration),
    b.check(configuration),
  ]);
  assert.ok(results.every((r) => r.created));
  assert.equal(h.storage.scan().handles.length, 2);
});
test("changed-state deletion preserves completed report handle and never retries with a new expectation", async () => {
  const h = fixture();
  const session = h.initial[0]!;
  await h.recovery.check(null);
  session.completed = true;
  assert.equal(
    (
      await h.recovery.delete(
        session.credential.sessionId,
        DELETE_EXPECTATION.UNFINISHED,
      )
    ).kind,
    DELETE_OUTCOME.CHANGED_STATE,
  );
  assert.equal(
    (await h.recovery.get(session.credential.sessionId)).kind,
    SESSION_VIEW.REPORT,
  );
  assert.equal(h.storage.scan().handles.length, 1);
  assert.equal(h.server.calls.delete, 1);
});
test("lost delete response preserves handle; subsequent not_found cleans only that handle", async () => {
  const h = fixture();
  const session = h.initial[0]!;
  await h.recovery.check(null);
  const remove = h.server.api.deleteSession;
  h.server.api.deleteSession = async (input) => {
    await remove(input);
    throw new Error("lost response");
  };
  await assert.rejects(
    h.recovery.delete(
      session.credential.sessionId,
      DELETE_EXPECTATION.UNFINISHED,
    ),
  );
  assert.equal(h.storage.scan().handles.length, 1);
  h.server.api.deleteSession = remove;
  await assert.rejects(
    h.recovery.delete(
      session.credential.sessionId,
      DELETE_EXPECTATION.UNFINISHED,
    ),
  );
  assert.equal(h.storage.scan().handles.length, 0);
});
