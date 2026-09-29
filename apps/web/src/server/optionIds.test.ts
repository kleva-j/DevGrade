import assert from "node:assert/strict";
import { test } from "node:test";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { TestContext } from "node:test";
import type { Transaction } from "@/db/client";
import type {
  AcceptedAnswerResult,
  CreatedSession,
} from "@/domain/sessionContracts";

import * as schema from "@/db/schema";
import {
  ASSESSMENT_CONTRACT,
  QUESTION_SNAPSHOT_FORMAT,
  SESSION_VIEW,
} from "@/domain/constants";
import { parseQuestionSnapshot } from "@/domain/sessionSnapshots";
import { toPublicQuestion } from "@/domain/types";
import { createAssessmentHandlers } from "./assessmentHandlers";
import { createAssessmentService, rowToQuestion } from "./assessmentService";
import { metadata, progress, requireCompatibleSnapshot } from "./sessionAccess";
import { AssessmentError, ERROR_CODE, assessmentEnvelope } from "./errors";
import { MESSAGES } from "./messages";
import {
  bankOptions,
  bankRows,
  configuration,
  optionIds,
  sessionRow,
  snapshotV1,
  snapshotV2,
} from "./__tests__/optionIdCases";

function serviceFixture(t: TestContext) {
  const client = postgres({ max: 1, prepare: false });
  t.after(() => client.end());
  const db = drizzle(client, { schema });
  return { db, service: createAssessmentService(db) };
}
function isError(code: AssessmentError["code"]) {
  return (error: unknown) =>
    error instanceof AssessmentError && error.code === code;
}

test("bank bridge normalizes strings and preserves object IDs; raw V1 rebases to saved indices", () => {
  const row = bankRows()[0]!;
  const legacy = rowToQuestion(row);
  assert.deepEqual(
    legacy.options.map((option) => option.id),
    [0, 1, 2, 3],
  );
  assert.equal(legacy.correctOptionId, 2);
  const canonical = rowToQuestion({
    ...row,
    options: bankOptions,
    correctAnswer: 100,
  });
  assert.deepEqual(canonical.options, bankOptions);
  assert.equal(canonical.correctOptionId, 100);
  canonical.options[0]!.text = "Changed copy";
  assert.notEqual(canonical.options[0]!.text, bankOptions[0]!.text);
  const saved = snapshotV1();
  assert.equal(saved.version, QUESTION_SNAPSHOT_FORMAT.V1);
  assert.equal(saved.questions[0]!.correctAnswer, 2);
  const parsed = parseQuestionSnapshot(
    saved,
    saved.questions.map((q) => q.id),
    configuration,
  );
  assert.deepEqual(
    parsed.questions[0]!.options.map((option) => option.id),
    [0, 1, 2, 3],
  );
  assert.equal(parsed.questions[0]!.correctOptionId, 2);
  for (const correctAnswer of [-1, 1.5, 4, 99])
    assert.throws(() =>
      rowToQuestion({ ...row, options: bankOptions, correctAnswer }),
    );
  for (const options of [
    ["A", "B", "C"],
    ["A", "B", "C", " "],
    [...bankOptions.slice(1), bankOptions[1]],
    [...bankOptions.slice(1), { id: -1, text: "Bad" }],
    [...bankOptions.slice(1), "Mixed"],
  ])
    assert.throws(() => rowToQuestion({ ...row, options }));
});

test("future snapshot writers fail closed for legacy creation; canonical callers can use V2", () => {
  requireCompatibleSnapshot(QUESTION_SNAPSHOT_FORMAT.V1, true);
  requireCompatibleSnapshot(QUESTION_SNAPSHOT_FORMAT.V2, false);
  assert.throws(
    () => requireCompatibleSnapshot(QUESTION_SNAPSHOT_FORMAT.V2, true),
    isError(ERROR_CODE.CLIENT_UPDATE_REQUIRED),
  );
});

test("wire boundary projects legacy views/answers and discriminates canonical responses without casts", async (t) => {
  const { service } = serviceFixture(t);
  const row = sessionRow(snapshotV1());
  const acceptedAnswer = {
    questionId: row.selectedQuestionIds[0]!,
    selectedOptionId: 2,
    timeSpentSeconds: 7,
  };
  const created: CreatedSession = {
    ...metadata(row, row.createdAt, [acceptedAnswer]),
    ...progress(row, [acceptedAnswer]),
    kind: SESSION_VIEW.ASSESSMENT,
    sessionToken: row.sessionToken,
    questions: parseQuestionSnapshot(
      row.questionSnapshot,
      row.selectedQuestionIds,
      row,
    ).questions.map(toPublicQuestion),
    acceptedAnswers: [acceptedAnswer],
  };
  const result: AcceptedAnswerResult = {
    ...progress(row, [acceptedAnswer]),
    success: true,
    sessionComplete: false,
    acceptedAnswer,
    acceptedAnswers: [acceptedAnswer],
  };
  const { sessionToken, ...view } = created;
  const create = t.mock.method(service, "createSession", async () => created);
  const get = t.mock.method(service, "getSession", async () => view);
  const resume = t.mock.method(service, "resumeSession", async () => view);
  const submit = t.mock.method(service, "submitAnswer", async () => result);
  const noStore = t.mock.fn();
  const handlers = createAssessmentHandlers(() => service, noStore);
  const credential = { sessionId: row.id, sessionToken };
  const creationInput = { ...configuration, rawClientId: "anonymous" };
  for (const [handler, input, mock] of [
    [handlers.createSession, creationInput, create],
    [handlers.getSession, credential, get],
    [handlers.resumeSession, credential, resume],
  ] as const) {
    const legacy = await handler(input);
    assert.ok(legacy.ok);
    assert.equal(legacy.data.assessmentContract, undefined);
    assert.equal(legacy.data.kind, SESSION_VIEW.ASSESSMENT);
    assert.deepEqual(
      legacy.data.questions[0]!.options,
      bankOptions.map((option) => option.text),
    );
    assert.deepEqual(legacy.data.acceptedAnswers, [
      {
        questionId: acceptedAnswer.questionId,
        selectedAnswer: 2,
        timeSpentSeconds: 7,
      },
    ]);
    assert.deepEqual(mock.mock.calls[0]!.arguments[1], { legacyClient: true });
    const canonical = await handler({
      ...input,
      assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS,
    });
    assert.ok(canonical.ok);
    assert.equal(
      canonical.data.assessmentContract,
      ASSESSMENT_CONTRACT.OPTION_IDS,
    );
    assert.equal(canonical.data.kind, SESSION_VIEW.ASSESSMENT);
    assert.deepEqual(
      canonical.data.questions[0]!.options,
      created.questions[0]!.options,
    );
    assert.equal(canonical.data.acceptedAnswers[0]!.selectedOptionId, 2);
    assert.deepEqual(mock.mock.calls[1]!.arguments[1], { legacyClient: false });
    assert.doesNotMatch(
      JSON.stringify(canonical),
      /"(?:correctAnswer|correctOptionId|explanation|difficultyWeight|source)"\s*:/,
    );
  }
  const legacy = await handlers.submitAnswer({
    ...credential,
    questionId: acceptedAnswer.questionId,
    selectedAnswer: 2,
    timeSpentSeconds: 999,
  });
  assert.ok(legacy.ok);
  assert.equal(legacy.data.assessmentContract, undefined);
  assert.equal(legacy.data.acceptedAnswer.selectedAnswer, 2);
  assert.equal(legacy.data.acceptedAnswer.timeSpentSeconds, 7);
  assert.deepEqual(submit.mock.calls[0]!.arguments, [
    row.id,
    { ...acceptedAnswer, sessionToken, timeSpentSeconds: 999 },
    { legacyClient: true },
  ]);
  const canonical = await handlers.submitAnswer({
    ...credential,
    ...acceptedAnswer,
  });
  assert.ok(canonical.ok);
  assert.equal(
    canonical.data.assessmentContract,
    ASSESSMENT_CONTRACT.OPTION_IDS,
  );
  assert.equal(canonical.data.acceptedAnswer.selectedOptionId, 2);
  assert.deepEqual(submit.mock.calls[1]!.arguments[2], { legacyClient: false });
  const invalid = await handlers.submitAnswer({
    ...credential,
    ...acceptedAnswer,
    selectedAnswer: 2,
  });
  assert.ok(!invalid.ok);
  assert.equal(invalid.error.code, ERROR_CODE.BAD_REQUEST);
  assert.equal(submit.mock.callCount(), 2);
  assert.equal(noStore.mock.callCount(), 9);
});

test("legacy V2 get/resume/submit reject inside the service before child reads or mutations", async (t) => {
  const { db, service } = serviceFixture(t);
  const row = sessionRow(snapshotV2());
  const credential = { sessionId: row.id, sessionToken: row.sessionToken };
  const mutations = t.mock.fn(() => {
    throw new Error("Unexpected mutation");
  });
  const locks = t.mock.fn();
  const parentReads = t.mock.fn();
  // Only the authenticated parent and DB clock are available: any child access fails.
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        assert.equal(table, schema.testSessions);
        parentReads();
        const query = Object.assign(Promise.resolve([row]), {
          for: () => {
            locks();
            return Promise.resolve([row]);
          },
        });
        return { where: () => query };
      },
    }),
    execute: async () => [{ milliseconds: row.createdAt.getTime() }],
    update: mutations,
    insert: mutations,
  } as unknown as Transaction;
  t.mock.method(
    db,
    "transaction",
    async (work: Parameters<typeof db.transaction>[0]) => work(tx),
  );
  const handlers = createAssessmentHandlers(
    () => service,
    () => {},
  );
  for (const [handler, input] of [
    [handlers.getSession, credential],
    [handlers.resumeSession, credential],
    [
      handlers.submitAnswer,
      {
        ...credential,
        questionId: row.selectedQuestionIds[0],
        selectedAnswer: 2,
        timeSpentSeconds: 1,
      },
    ],
  ] as const) {
    assert.deepEqual(await handler(input), {
      ok: false,
      error: {
        code: ERROR_CODE.CLIENT_UPDATE_REQUIRED,
        message: MESSAGES.clientUpdateRequired,
      },
    });
  }
  assert.equal(parentReads.mock.callCount(), 3);
  assert.equal(locks.mock.callCount(), 2);
  assert.equal(mutations.mock.callCount(), 0);
  assert.deepEqual(row.questionSnapshot, snapshotV2());
  assert.deepEqual(optionIds, [42, 7, 100, 9]);
});

test("refresh-required failures always serialize safe copy", async () => {
  assert.deepEqual(
    await assessmentEnvelope(async () => {
      throw new AssessmentError(
        ERROR_CODE.CLIENT_UPDATE_REQUIRED,
        "secret database detail",
      );
    }),
    {
      ok: false,
      error: {
        code: ERROR_CODE.CLIENT_UPDATE_REQUIRED,
        message: MESSAGES.clientUpdateRequired,
      },
    },
  );
});
