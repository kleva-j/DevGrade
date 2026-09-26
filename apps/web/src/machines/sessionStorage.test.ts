import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSessionLock,
  createSessionStorage,
  SESSION_LOCK_NAME,
  SESSION_STORAGE_PREFIX,
  SESSION_STORAGE_VERSION,
  STORAGE_ISSUE,
} from "./sessionStorage";
import {
  accessExpiresAt,
  attemptExpiresAt,
  configuration,
  makeSession,
  MemoryStorage,
} from "./sessionTestFixtures";

const handle = () => ({
  ...makeSession().credential,
  attemptExpiresAt,
  accessExpiresAt,
  hint: configuration,
});

test("storage construction/SSR does not access browser globals and fails closed on scan", () => {
  let reads = 0;
  const storage = createSessionStorage(() => {
    reads++;
    return undefined;
  });
  assert.equal(reads, 0);
  assert.deepEqual(storage.scan(), {
    handles: [],
    issue: STORAGE_ISSUE.UNAVAILABLE,
  });
  assert.equal(storage.preflight(), STORAGE_ISSUE.FULL);
});
test("blocked getter/read errors are safe and do not mutate saved data", () => {
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  const saved = handle();
  storage.save(saved);
  const before = [...port.values];
  port.blockRead = true;
  assert.equal(storage.scan().issue, STORAGE_ISSUE.UNAVAILABLE);
  assert.deepEqual([...port.values], before);
  assert.equal(
    createSessionStorage(() => {
      throw new Error("SecurityError");
    }).scan().issue,
    STORAGE_ISSUE.UNAVAILABLE,
  );
});
test("versioned independent keys contain only credentials, deadlines and display hints", () => {
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  const one = handle();
  const two = handle();
  storage.save({
    ...one,
    questions: ["private"],
    report: "private",
    machine: {},
  } as typeof one);
  storage.save(two);
  assert.deepEqual(storage.scan(), { handles: [one, two], issue: null });
  const raw = JSON.parse(port.getItem(SESSION_STORAGE_PREFIX + one.sessionId)!);
  assert.deepEqual(raw, { version: SESSION_STORAGE_VERSION, ...one });
  storage.remove(one);
  assert.deepEqual(storage.scan().handles, [two]);
});
test("24-hour deadline never causes local removal of completed/report handles", () => {
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  const saved = { ...handle(), attemptExpiresAt: "2000-01-01T00:00:00.000Z" };
  storage.save(saved);
  assert.deepEqual(storage.scan().handles, [saved]);
});
test("corrupt entries and unsupported versions remain untouched; valid credentials are still recovered", () => {
  for (const damaged of [
    "{",
    "null",
    JSON.stringify({ ...handle(), version: 500 }),
    JSON.stringify({ ...handle(), version: 1, attemptExpiresAt: "bad" }),
  ]) {
    const port = new MemoryStorage();
    const storage = createSessionStorage(() => port);
    const good = handle();
    storage.save(good);
    let id = makeSession().credential.sessionId;
    try {
      id = JSON.parse(damaged)?.sessionId ?? id;
    } catch {
      /* malformed fixture */
    }
    port.setItem(SESSION_STORAGE_PREFIX + id, damaged);
    const before = [...port.values];
    const scan = storage.scan();
    assert.equal(scan.issue, STORAGE_ISSUE.CORRUPT);
    assert.ok(scan.handles.some((h) => h.sessionId === good.sessionId));
    assert.deepEqual([...port.values], before);
  }
});
test("malformed token and mismatched key cannot be silently accepted or overwritten", () => {
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  const saved = handle();
  port.setItem(
    SESSION_STORAGE_PREFIX + saved.sessionId,
    JSON.stringify({ ...saved, sessionToken: "bad", version: 1 }),
  );
  const before = [...port.values];
  assert.equal(storage.scan().issue, STORAGE_ISSUE.CORRUPT);
  assert.equal(storage.save(saved), STORAGE_ISSUE.CORRUPT);
  assert.equal(storage.remove(saved), STORAGE_ISSUE.CORRUPT);
  assert.deepEqual([...port.values], before);
});
test("write/quota failures and silent writes fail preflight without touching handles", () => {
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  const saved = handle();
  storage.save(saved);
  port.blockWrite = true;
  assert.equal(storage.preflight(), STORAGE_ISSUE.FULL);
  assert.equal(storage.save(handle()), STORAGE_ISSUE.FULL);
  port.blockWrite = false;
  assert.deepEqual(storage.scan().handles, [saved]);
  assert.equal(storage.preflight(), null);
  assert.equal(port.length, 1);
  const silent = new MemoryStorage();
  silent.setItem = () => {};
  assert.equal(
    createSessionStorage(() => silent).preflight(),
    STORAGE_ISSUE.FULL,
  );
});
test("remove is compare-and-delete and a failed removal preserves other keys", () => {
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  const saved = handle();
  storage.save(saved);
  assert.equal(
    storage.remove({ ...saved, sessionToken: "b".repeat(64) }),
    STORAGE_ISSUE.CORRUPT,
  );
  port.blockRemove = true;
  assert.equal(storage.remove(saved), STORAGE_ISSUE.UNAVAILABLE);
  assert.deepEqual(storage.scan().handles, [saved]);
});
test("Web Lock is named, surrounds the whole async operation and releases on rejection", async () => {
  let held = false;
  const names: string[] = [];
  const request = (async (name: string, operation: () => Promise<unknown>) => {
    names.push(name);
    assert.equal(held, false);
    held = true;
    try {
      return await operation();
    } finally {
      held = false;
    }
  }) as LockManager["request"];
  const lock = createSessionLock(() => ({ request }));
  await assert.rejects(
    lock(async () => {
      assert.ok(held);
      throw new Error("failed");
    }),
  );
  assert.equal(
    await lock(async () => {
      assert.ok(held);
      await Promise.resolve();
      assert.ok(held);
      return 42;
    }),
    42,
  );
  assert.equal(held, false);
  assert.deepEqual(names, [SESSION_LOCK_NAME, SESSION_LOCK_NAME]);
});
test("unsupported Web Locks still serialize this tab without pretending to lock other tabs", async () => {
  const lock = createSessionLock(() => undefined);
  const events: string[] = [];
  await Promise.all([
    lock(async () => {
      events.push("one-start");
      await Promise.resolve();
      events.push("one-end");
    }),
    lock(async () => {
      events.push("two");
    }),
  ]);
  assert.deepEqual(events, ["one-start", "one-end", "two"]);
});
