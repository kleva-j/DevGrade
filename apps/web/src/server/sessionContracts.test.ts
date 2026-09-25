import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import {
  DELETE_EXPECTATION,
  DIFFICULTY,
  FRAMEWORK,
  MAX_KNOWN_SESSION_CREDENTIALS,
} from "@/domain/constants";
import { createAssessmentHandlers } from "./assessmentHandlers";
import { createAssessmentService } from "./assessmentService";
import { AssessmentError, ERROR_CODE, assessmentEnvelope } from "./errors";
import { MESSAGES } from "./messages";
import {
  knownCredentialsSchema,
  sessionCredentialSchema,
} from "./assessmentValidation";

const credential = { sessionId: randomUUID(), sessionToken: "a".repeat(64) };
const configuration = {
  framework: FRAMEWORK.REACT,
  targetLevel: DIFFICULTY.MID,
  rawClientId: "test-client",
};
const malformed = [
  { ...credential, sessionId: "not-a-uuid" },
  { ...credential, sessionId: credential.sessionId.replaceAll("-", "") },
  { ...credential, sessionId: `{${credential.sessionId}}` },
  { ...credential, sessionId: ` ${credential.sessionId}` },
  ...[
    "",
    "x".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
    `${"a".repeat(64)}\n`,
  ].map((sessionToken) => ({ ...credential, sessionToken })),
];

test("UUID and token shapes are strict, normalized IDs preserve deterministic lock order", () => {
  assert.equal(
    sessionCredentialSchema.parse({
      ...credential,
      sessionId: credential.sessionId.toUpperCase(),
    }).sessionId,
    credential.sessionId,
  );
  for (const input of malformed)
    assert.equal(sessionCredentialSchema.safeParse(input).success, false);
  assert.equal(
    knownCredentialsSchema.safeParse(
      Array.from({ length: MAX_KNOWN_SESSION_CREDENTIALS }, () => credential),
    ).success,
    true,
  );
  assert.equal(
    knownCredentialsSchema.safeParse(
      Array.from(
        { length: MAX_KNOWN_SESSION_CREDENTIALS + 1 },
        () => credential,
      ),
    ).success,
    false,
  );
});

test("all service paths reject malformed credentials and over-limit lists before DB access", async (t) => {
  const client = postgres({ max: 1, prepare: false });
  t.after(() => client.end());
  const db = drizzle(client, { schema });
  const transaction = t.mock.method(db, "transaction", () => {
    throw new Error("Unexpected DB access");
  });
  const service = createAssessmentService(db);
  const badRequest = (error: unknown) =>
    error instanceof AssessmentError && error.code === ERROR_CODE.BAD_REQUEST;
  for (const input of malformed) {
    await assert.rejects(service.getSession(input), badRequest);
    await assert.rejects(service.resumeSession(input), badRequest);
    await assert.rejects(
      service.deleteSession({
        ...input,
        expectedState: DELETE_EXPECTATION.UNFINISHED,
      }),
      badRequest,
    );
    await assert.rejects(
      service.submitAnswer(input.sessionId, {
        ...input,
        questionId: "q",
        selectedAnswer: 0,
        timeSpentSeconds: 1,
      }),
      badRequest,
    );
    await assert.rejects(
      service.completeSession(input.sessionId, input),
      badRequest,
    );
    await assert.rejects(
      service.submitSurvey(input.sessionId, { ...input, rating: 3 }),
      badRequest,
    );
    await assert.rejects(
      service.discoverSessions({ credentials: [credential, input] }),
      badRequest,
    );
    await assert.rejects(
      service.createSession({
        ...configuration,
        knownCredentials: [credential, input],
      }),
      badRequest,
    );
  }
  const overLimit = Array.from(
    { length: MAX_KNOWN_SESSION_CREDENTIALS + 1 },
    () => credential,
  );
  await assert.rejects(
    service.discoverSessions({ credentials: overLimit }),
    badRequest,
  );
  await assert.rejects(
    service.createSession({ ...configuration, knownCredentials: overLimit }),
    badRequest,
  );
  assert.equal(transaction.mock.callCount(), 0);
});

test("wire boundary envelopes validation, lazy DB failures and typed errors without leaking inputs, SQL or credentials", async (t) => {
  const unsafe = `postgres://secret:password@private/database ${credential.sessionToken} SQL SELECT`;
  const noStore = t.mock.fn();
  const getService = t.mock.fn(() => {
    throw new Error(unsafe);
  });
  const handlers = createAssessmentHandlers(getService, noStore);
  for (const handler of Object.values(handlers)) {
    const result = await handler({ sessionId: unsafe, sessionToken: unsafe });
    assert.deepEqual(result, {
      ok: false,
      error: { code: ERROR_CODE.BAD_REQUEST, message: MESSAGES.invalidRequest },
    });
  }
  assert.equal(getService.mock.callCount(), 0);
  assert.equal(noStore.mock.callCount(), 8);
  for (const [handler, input] of [
    [handlers.createSession, configuration],
    [handlers.discoverSessions, { credentials: [credential] }],
    [handlers.getSession, credential],
    [handlers.resumeSession, credential],
    [handlers.completeSession, credential],
    [
      handlers.deleteSession,
      { ...credential, expectedState: DELETE_EXPECTATION.UNFINISHED },
    ],
    [
      handlers.submitAnswer,
      {
        ...credential,
        questionId: "q",
        selectedAnswer: 0,
        timeSpentSeconds: 1,
      },
    ],
    [handlers.submitSurvey, { ...credential, rating: 3 }],
  ] as const) {
    const result = await handler(input);
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: ERROR_CODE.INTERNAL_ERROR,
        message: MESSAGES.unexpectedError,
      },
    });
    assert.doesNotMatch(
      JSON.stringify(result),
      /secret|password|SELECT|private/,
    );
  }
  assert.equal(noStore.mock.callCount(), 16);
  assert.deepEqual(
    await assessmentEnvelope(async () => {
      throw new AssessmentError(ERROR_CODE.BAD_REQUEST, unsafe);
    }),
    {
      ok: false,
      error: { code: ERROR_CODE.BAD_REQUEST, message: MESSAGES.invalidRequest },
    },
  );
  assert.deepEqual(await assessmentEnvelope(async () => 42), {
    ok: true,
    data: 42,
  });
});

test("every exported Start wrapper is POST and uses the no-store safe handler boundary", async () => {
  const source = await readFile(
    new URL("./assessmentFns.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    (source.match(/createServerFn\(\{ method: "POST" \}\)/g) ?? []).length,
    8,
  );
  assert.equal((source.match(/handlers\(\)\./g) ?? []).length, 8);
  assert.match(source, /setResponseHeader\("Cache-Control", "no-store"\)/);
});
