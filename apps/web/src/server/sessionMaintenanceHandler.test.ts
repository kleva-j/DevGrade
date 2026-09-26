import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import type { SessionMaintenanceResult } from "./sessionMaintenance";

import { createSessionMaintenanceHandler } from "./sessionMaintenanceHandler";

const secret = randomBytes(32).toString("hex");
function summary(): SessionMaintenanceResult {
  const operation = {
    count: 0,
    batches: 1,
    cap: null,
    failure: null,
    backlog: false,
    backlogFailure: null,
  };
  return {
    ok: true,
    durationMs: 12,
    clockFailure: null,
    deletion: { ...operation },
    abandonment: { ...operation },
  };
}
function request(
  authorization: string | null = `Bearer ${secret}`,
  method = "GET",
) {
  return new Request(
    "https://example.invalid/api/internal/session-maintenance?retentionDays=0&batchSize=999999",
    {
      method,
      headers: authorization === null ? {} : { authorization },
    },
  );
}
function assertTransport(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("location"), null);
}

test("unauthorized and unconfigured calls perform zero DB initialization/work", async () => {
  let initialized = 0;
  const logs: unknown[] = [];
  const handler = (env: NodeJS.ProcessEnv) =>
    createSessionMaintenanceHandler({
      environment: () => env,
      run: async () => {
        initialized++;
        throw new Error("must not initialize database");
      },
      log: (_level, event) => logs.push(event),
    });
  for (const authorization of [
    null,
    "",
    "Basic bad",
    "Bearer",
    "Bearer wrong",
    `Bearer ${secret}x`,
    `Bearer ${secret.slice(1)}`,
    `Bearer  ${secret}`,
    `Bearer ${secret},other`,
    `Bearer ${"x".repeat(600)}`,
  ]) {
    const response = await handler({
      CRON_SECRET: secret,
      SESSION_MAINTENANCE_ENABLED: "true",
    })(request(authorization));
    assertTransport(response, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "unauthorized",
    });
  }
  for (const configured of [
    undefined,
    "",
    "weak",
    "x".repeat(31),
    "x".repeat(257),
    "x".repeat(32) + " ",
    "\nx".repeat(32),
    "x".repeat(32) + "===",
    "secret with spaces",
  ]) {
    assertTransport(
      await handler({
        CRON_SECRET: configured,
        SESSION_MAINTENANCE_ENABLED: "true",
      })(request()),
      401,
    );
  }
  assert.equal(initialized, 0);
  assert.deepEqual(logs, []);
});

test("32..256-character bearer-safe secrets authenticate, including base64 padding", async () => {
  for (const configured of [
    "x".repeat(32),
    "x".repeat(256),
    "a+/_-".repeat(7) + "==",
  ]) {
    let calls = 0;
    const handler = createSessionMaintenanceHandler({
      environment: () => ({
        CRON_SECRET: configured,
        SESSION_MAINTENANCE_ENABLED: "true",
      }),
      run: async () => {
        calls++;
        return summary();
      },
      log: () => {},
    });
    assertTransport(await handler(request(`Bearer ${configured}`)), 200);
    assert.equal(calls, 1);
  }
});

test("activation is exact, default-off and evaluated at request time, including previews", async () => {
  let calls = 0;
  const env: NodeJS.ProcessEnv = {
    CRON_SECRET: secret,
    VERCEL_ENV: "preview",
  };
  const handler = createSessionMaintenanceHandler({
    environment: () => env,
    run: async () => {
      calls++;
      return summary();
    },
    log: () => {},
  });
  for (const enabled of [undefined, "", "false", "TRUE", "1", " true "]) {
    env.SESSION_MAINTENANCE_ENABLED = enabled;
    const response = await handler(request());
    assertTransport(response, 200);
    assert.deepEqual(await response.json(), { ok: true, enabled: false });
  }
  assert.equal(calls, 0);
  env.SESSION_MAINTENANCE_ENABLED = "true";
  assertTransport(await handler(request()), 200);
  assert.equal(calls, 1);
  delete env.SESSION_MAINTENANCE_ENABLED;
  await handler(request());
  assert.equal(calls, 1);
});

test("GET only: HEAD fallback and other methods cannot trigger DB work", async () => {
  let calls = 0;
  const handler = createSessionMaintenanceHandler({
    environment: () => ({
      CRON_SECRET: secret,
      SESSION_MAINTENANCE_ENABLED: "true",
    }),
    run: async () => {
      calls++;
      return summary();
    },
    log: () => {},
  });
  for (const method of ["HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
    const response = await handler(request(undefined, method));
    assertTransport(response, 405);
    assert.equal(response.headers.get("allow"), "GET");
  }
  assert.equal(calls, 0);
});

test("authorized work is awaited, ignores query budgets, projects scalar response/log fields", async () => {
  let release!: (value: SessionMaintenanceResult) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<SessionMaintenanceResult>((resolve) => {
    release = resolve;
  });
  const logs: unknown[] = [];
  const handler = createSessionMaintenanceHandler({
    environment: () => ({
      CRON_SECRET: secret,
      SESSION_MAINTENANCE_ENABLED: "true",
    }),
    run: async (...args) => {
      assert.equal(args.length, 0);
      started();
      return pending;
    },
    log: (level, event) => logs.push({ level, ...event }),
  });
  let responded = false;
  const responsePromise = handler(request(`bearer ${secret}`)).then((value) => {
    responded = true;
    return value;
  });
  await entered;
  assert.equal(responded, false);
  assert.deepEqual(logs, []);
  const result = {
    ...summary(),
    sessionToken: secret,
    sql: "private SQL",
    deletion: { ...summary().deletion, ids: ["private-id"] },
  };
  release(result);
  const response = await responsePromise;
  assertTransport(response, 200);
  assert.deepEqual(await response.json(), { ...summary(), enabled: true });
  assert.doesNotMatch(JSON.stringify(logs), /sessionToken|private|ids|sql/);
});

test("partial failure is 503; caps and locked backlog are observable 200 warnings", async () => {
  for (const kind of [
    "failure",
    "cap",
    "backlog",
    "observation",
    "clock",
  ] as const) {
    const result = summary();
    if (kind === "failure") {
      result.ok = false;
      result.deletion.failure = "lock_timeout";
      result.deletion.count = 200;
    }
    if (kind === "observation") {
      result.ok = false;
      result.deletion.backlog = null;
      result.deletion.backlogFailure = "statement_timeout";
    }
    if (kind === "clock") {
      result.ok = false;
      result.clockFailure = "database_error";
    }
    if (kind === "cap") {
      result.deletion.cap = "batch_limit";
    }
    if (kind === "backlog") {
      result.deletion.backlog = true;
    }
    const levels: string[] = [];
    const handler = createSessionMaintenanceHandler({
      environment: () => ({
        CRON_SECRET: secret,
        SESSION_MAINTENANCE_ENABLED: "true",
      }),
      run: async () => result,
      log: (level) => levels.push(level),
    });
    const response = await handler(request());
    assertTransport(response, result.ok ? 200 : 503);
    assert.deepEqual(await response.json(), { ...result, enabled: true });
    assert.deepEqual(levels, [result.ok ? "warn" : "error"]);
  }
});

test("DB init, runner, configuration and logger exceptions are sanitized", async () => {
  const privateMessage = `SQL password token ${secret} client_id private-id`;
  for (const phase of ["environment", "init", "runner", "logger"] as const) {
    const logs: unknown[] = [];
    const handler = createSessionMaintenanceHandler({
      environment: () => {
        if (phase === "environment") throw new Error(privateMessage);
        return { CRON_SECRET: secret, SESSION_MAINTENANCE_ENABLED: "true" };
      },
      run: () => {
        if (phase === "init") throw new Error(privateMessage);
        if (phase === "runner")
          return Promise.reject(new Error(privateMessage));

        return Promise.resolve(summary());
      },
      log: (level, event) => {
        logs.push({ level, ...event });
        if (phase === "logger") throw new Error(privateMessage);
      },
    });
    const response = await handler(request());
    assertTransport(response, phase === "logger" ? 200 : 503);
    assert.doesNotMatch(
      JSON.stringify([await response.json(), logs]),
      /password|token|client_id|private-id|SQL/,
    );
    assert.ok(!JSON.stringify(logs).includes(secret));
  }
});
