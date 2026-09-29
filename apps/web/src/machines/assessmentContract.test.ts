import assert from "node:assert/strict";
import { test } from "node:test";
import { createActor, waitFor } from "xstate";

import { ASSESSMENT_CONTRACT, SESSION_VIEW } from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import {
  createAssessmentApi,
  isClientUpdateRequired,
} from "./createSessionAdapter";
import { assessmentMachine } from "./assessmentMachine";
import {
  createSessionRecovery,
  isUnavailableError,
  needsReconciliation,
} from "./sessionRecovery";
import {
  createSessionStorage,
  createSessionLock,
  STORAGE_ISSUE,
} from "./sessionStorage";
import {
  assessmentResponseSchema,
  acceptedAnswerResponseSchema,
  sessionResponseSchema,
} from "./assessmentResponse";
import {
  configuration,
  fakeEndpoints,
  fakeServer,
  makeSession,
  MemoryStorage,
  optionIdsResponse,
  clientFailure,
} from "./sessionTestFixtures";

for (const marker of [
  undefined,
  "unsupported_contract",
  ASSESSMENT_CONTRACT.OPTION_IDS,
]) {
  for (const operation of [
    "createSession",
    "getSession",
    "resumeSession",
    "submitAnswer",
  ] as const) {
    test(`${operation}: rejects legacy shape with marker ${String(marker)} as refresh-required`, async (t) => {
      const session = makeSession();
      const endpoints = fakeEndpoints(fakeServer([session]).api);
      const answer = {
        questionId: "question-0",
        selectedOptionId: 1,
        timeSpentSeconds: 9,
      };
      const oldAnswer = {
        questionId: answer.questionId,
        selectedAnswer: 1,
        timeSpentSeconds: 9,
      };
      const data =
        operation === "submitAnswer"
          ? {
              success: true,
              acceptedAnswer: oldAnswer,
              acceptedAnswers: [oldAnswer],
              answeredCount: 1,
              totalQuestions: 8,
              nextQuestionId: "question-1",
              sessionComplete: false,
            }
          : {
              ...session.assessment,
              ...(operation === "createSession" ? session.credential : {}),
              questions: session.report.reportSnapshot.questions,
              acceptedAnswers: [],
            };
      t.mock.method(endpoints, operation, async () => ({
        ok: true,
        data: { ...data, assessmentContract: marker },
      }));
      const api = createAssessmentApi(endpoints, () => "client");
      const result =
        operation === "createSession"
          ? api.createSession(configuration, [])
          : operation === "submitAnswer"
            ? api.submitAnswer({ ...session.credential, answer })
            : api[operation](session.credential);
      await assert.rejects(result, (error) => {
        assert.ok(isClientUpdateRequired(error));
        assert.equal(isUnavailableError(error), false);
        assert.equal(needsReconciliation(error), false);
        assert.equal(
          JSON.stringify(error).includes(session.credential.sessionToken),
          false,
        );
        return true;
      });
    });
  }
}

test("canonical response fields cannot compensate for a missing/wrong contract marker", async (t) => {
  for (const marker of [undefined, "unsupported_contract"]) {
    const session = makeSession();
    const endpoints = fakeEndpoints(fakeServer([session]).api);
    for (const operation of [
      "createSession",
      "getSession",
      "resumeSession",
      "submitAnswer",
    ] as const) {
      const answer = {
        questionId: "question-0",
        selectedOptionId: 1,
        timeSpentSeconds: 9,
      };
      const data =
        operation === "submitAnswer"
          ? {
              success: true,
              acceptedAnswer: answer,
              acceptedAnswers: [answer],
              answeredCount: 1,
              totalQuestions: 8,
              nextQuestionId: "question-1",
              sessionComplete: false,
            }
          : { ...session.assessment, ...session.credential };
      t.mock.method(endpoints, operation, async () => ({
        ok: true,
        data: { ...data, assessmentContract: marker },
      }));
      const api = createAssessmentApi(endpoints, () => "client");
      await assert.rejects(
        operation === "createSession"
          ? api.createSession(configuration, [])
          : operation === "submitAnswer"
            ? api.submitAnswer({ ...session.credential, answer })
            : api[operation](session.credential),
        isClientUpdateRequired,
      );
    }
  }
});

for (const data of [null, undefined]) {
  test(`${String(data)} success payloads require a client update on every option-ID endpoint`, async (t) => {
    const session = makeSession();
    const endpoints = fakeEndpoints(fakeServer([session]).api);
    for (const operation of [
      "createSession",
      "getSession",
      "resumeSession",
      "submitAnswer",
    ] as const) {
      t.mock.method(endpoints, operation, async () => ({ ok: true, data }));
    }
    const api = createAssessmentApi(endpoints, () => "client");
    await assert.rejects(
      api.createSession(configuration, []),
      isClientUpdateRequired,
    );
    await assert.rejects(
      api.getSession(session.credential),
      isClientUpdateRequired,
    );
    await assert.rejects(
      api.resumeSession(session.credential),
      isClientUpdateRequired,
    );
    await assert.rejects(
      api.submitAnswer({
        ...session.credential,
        answer: {
          questionId: "question-0",
          selectedOptionId: 1,
          timeSpentSeconds: 5,
        },
      }),
      isClientUpdateRequired,
    );
  });
}

test("marked responses reject malformed option IDs and accepted answers without casts/coercion", async (t) => {
  const session = makeSession();
  const endpoints = fakeEndpoints(fakeServer([session]).api);
  const api = createAssessmentApi(endpoints, () => "client");
  const first = session.assessment.questions[0]!;
  const answer = {
    questionId: first.id,
    selectedOptionId: 1,
    timeSpentSeconds: 9,
  };
  const malformed: unknown[] = [
    null,
    { assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS },
    ...[
      [{ id: "1", text: "A" }, ...first.options.slice(1)],
      [{ id: -1, text: "A" }, ...first.options.slice(1)],
      [{ id: 0.5, text: "A" }, ...first.options.slice(1)],
      [{ id: 1, text: "A" }, ...first.options.slice(1)],
    ].map((options) =>
      optionIdsResponse({
        ...session.assessment,
        questions: [
          { ...first, options },
          ...session.assessment.questions.slice(1),
        ],
      }),
    ),
    ...[
      { ...answer, selectedOptionId: "1" },
      { ...answer, selectedAnswer: 1 },
      { ...answer, selectedOptionId: 99 },
    ].map((invalid) =>
      optionIdsResponse({
        ...session.assessment,
        acceptedAnswers: [invalid],
        answeredCount: 1,
        nextQuestionId: "question-1",
      }),
    ),
  ];
  for (const data of malformed) {
    t.mock.method(endpoints, "getSession", async () => ({ ok: true, data }));
    await assert.rejects(
      api.getSession(session.credential),
      isClientUpdateRequired,
    );
  }
  for (const invalid of [
    { ...answer, selectedOptionId: "1" },
    { ...answer, selectedOptionId: -1 },
    { ...answer, selectedAnswer: 1 },
  ]) {
    t.mock.method(endpoints, "submitAnswer", async () => ({
      ok: true,
      data: optionIdsResponse({
        success: true,
        acceptedAnswer: invalid,
        acceptedAnswers: [invalid],
        answeredCount: 1,
        totalQuestions: 8,
        nextQuestionId: "question-1",
        sessionComplete: false,
      }),
    }));
    await assert.rejects(
      api.submitAnswer({ ...session.credential, answer }),
      isClientUpdateRequired,
    );
  }
});

test("option-ID compatibility allows V1 two-choice questions and blank text", async () => {
  const session = makeSession();
  session.assessment.questions[0]!.options = [
    { id: 7, text: "" },
    { id: 42, text: " " },
  ];
  const api = createAssessmentApi(
    fakeEndpoints(fakeServer([session]).api),
    () => "client",
  );
  const view = await api.resumeSession(session.credential);
  assert.ok(view.kind === SESSION_VIEW.ASSESSMENT);
  assert.deepEqual(
    view.questions[0]?.options,
    session.assessment.questions[0]?.options,
  );
  const answer = {
    questionId: "question-0",
    selectedOptionId: 42,
    timeSpentSeconds: 5,
  };
  assert.deepEqual(
    (await api.submitAnswer({ ...session.credential, answer })).acceptedAnswer,
    answer,
  );
  const restored = await api.getSession(session.credential);
  assert.ok(restored.kind === SESSION_VIEW.ASSESSMENT);
  assert.deepEqual(restored.acceptedAnswers, [answer]);
});

test("compatibility validation does not duplicate metadata, progress, timing or report models", () => {
  const answer = { questionId: "question-0", selectedOptionId: 7 };
  assert.ok(
    assessmentResponseSchema.safeParse({
      kind: SESSION_VIEW.ASSESSMENT,
      questions: [
        {
          id: answer.questionId,
          options: [
            { id: 7, text: "" },
            { id: 42, text: "B" },
          ],
        },
      ],
      acceptedAnswers: [answer],
    }).success,
  );
  assert.ok(
    acceptedAnswerResponseSchema.safeParse({
      acceptedAnswer: answer,
      acceptedAnswers: [answer],
    }).success,
  );
  for (const kind of [
    SESSION_VIEW.REPORT,
    SESSION_VIEW.LEGACY_SUMMARY,
    SESSION_VIEW.ATTEMPT_EXPIRED,
    SESSION_VIEW.LEGACY_UNRESTORABLE,
  ]) {
    assert.ok(sessionResponseSchema.safeParse({ kind }).success);
  }
});

test("option-ID compatibility rejects duplicate/missing memberships and mixed answer aliases", () => {
  const answer = { questionId: "question-0", selectedOptionId: 7 };
  const question = {
    id: answer.questionId,
    options: [
      { id: 7, text: "A" },
      { id: 42, text: "B" },
    ],
  };
  const view = {
    kind: SESSION_VIEW.ASSESSMENT,
    questions: [question],
    acceptedAnswers: [answer],
  };
  for (const malformed of [
    { ...view, questions: [question, question] },
    { ...view, acceptedAnswers: [answer, answer] },
    {
      ...view,
      acceptedAnswers: [{ ...answer, questionId: "absent-question" }],
    },
    { ...view, acceptedAnswers: [{ ...answer, selectedOptionId: 99 }] },
    { ...view, acceptedAnswers: [{ ...answer, selectedAnswer: undefined }] },
  ])
    assert.equal(assessmentResponseSchema.safeParse(malformed).success, false);
  for (const acceptedAnswers of [
    [answer, answer],
    [{ ...answer, questionId: "absent-question" }],
    [{ ...answer, selectedOptionId: 42 }],
    [{ ...answer, selectedAnswer: undefined }],
    [{ questionId: answer.questionId, selectedAnswer: 7 }],
  ])
    assert.equal(
      acceptedAnswerResponseSchema.safeParse({
        acceptedAnswer: answer,
        acceptedAnswers,
      }).success,
      false,
    );
});

test("non-contiguous canonical IDs survive transport reads and answer acceptance", async () => {
  const session = makeSession();
  session.assessment.questions[0]!.options = [42, 7, 99, 100].map((id) => ({
    id,
    text: String(id),
  }));
  const server = fakeServer([session]);
  const api = createAssessmentApi(fakeEndpoints(server.api), () => "client");
  const resumed = await api.resumeSession(session.credential);
  assert.ok(resumed.kind === SESSION_VIEW.ASSESSMENT);
  assert.deepEqual(
    resumed.questions[0]?.options.map(({ id }) => id),
    [42, 7, 99, 100],
  );
  const answer = {
    questionId: "question-0",
    selectedOptionId: 99,
    timeSpentSeconds: 8,
  };
  const accepted = await api.submitAnswer({ ...session.credential, answer });
  assert.deepEqual(accepted.acceptedAnswer, answer);
  assert.equal("selectedAnswer" in accepted.acceptedAnswer, false);
  const read = await api.getSession(session.credential);
  assert.ok(read.kind === SESSION_VIEW.ASSESSMENT);
  assert.deepEqual(read.acceptedAnswers, [answer]);
});

for (const mode of [
  "old response",
  "wrong marker",
  "marked old shape",
  "invalid credential",
  "quota failure",
  "canceled creation",
] as const) {
  test(
    `incompatible creation (${mode}) fails closed without losing a valid newly issued token`,
    { timeout: 5000 },
    async (t) => {
      const server = fakeServer();
      const endpoints = fakeEndpoints(server.api);
      const port = new MemoryStorage();
      const storage = createSessionStorage(() => port);
      const create = endpoints.createSession;
      const controller = new AbortController();
      t.mock.method(
        endpoints,
        "createSession",
        async (input: Parameters<typeof create>[0]) => {
          const envelope = await create(input);
          assert.ok(envelope.ok);
          const data = envelope.data;
          if (mode === "quota failure") port.blockWrite = true;
          if (mode === "canceled creation") controller.abort();
          return {
            ok: true,
            data: {
              ...data,
              assessmentContract:
                mode === "marked old shape"
                  ? ASSESSMENT_CONTRACT.OPTION_IDS
                  : mode === "wrong marker"
                    ? "unsupported_contract"
                    : undefined,
              questions: mode === "marked old shape" ? [] : data.questions,
              sessionToken:
                mode === "invalid credential" ? "invalid" : data.sessionToken,
            },
          };
        },
      );
      const api = createAssessmentApi(endpoints, () => "client");
      const recovery = createSessionRecovery(
        api,
        storage,
        createSessionLock(() => undefined),
      );
      await assert.rejects(
        recovery.check(configuration, controller.signal),
        isClientUpdateRequired,
      );
      assert.equal(server.calls.create, 1);
      const created = [...server.sessions.values()][0]!;
      if (mode === "invalid credential") {
        assert.equal(storage.scan().handles.length, 0);
        return;
      }
      // Even failed disk writes must leave an in-memory handle for discovery.
      port.blockWrite = false;
      const checked = await recovery.check(configuration);
      assert.equal(checked.created, null);
      assert.equal(checked.history[0]?.sessionId, created.credential.sessionId);
      assert.equal(server.calls.create, 1);
      assert.equal(
        storage.scan().handles[0]?.sessionToken,
        created.credential.sessionToken,
      );
      assert.equal(JSON.stringify(checked).includes("sessionToken"), false);
      const reloaded = createSessionRecovery(
        api,
        storage,
        createSessionLock(() => undefined),
      );
      await reloaded.check(null);
      assert.equal(
        (await reloaded.get(created.credential.sessionId)).kind,
        SESSION_VIEW.ASSESSMENT,
      );
    },
  );
}

for (const storageFails of [false, true])
  test(
    `wrong-contract creation with ${storageFails ? "failed" : "successful"} storage exposes reload safety and cannot retry creation`,
    { timeout: 5000 },
    async (t) => {
      const server = fakeServer();
      const endpoints = fakeEndpoints(server.api);
      const port = new MemoryStorage();
      const create = endpoints.createSession;
      t.mock.method(
        endpoints,
        "createSession",
        async (input: Parameters<typeof create>[0]) => {
          const response = await create(input);
          assert.ok(response.ok);
          port.blockWrite = storageFails;
          return {
            ok: true,
            data: { ...response.data, assessmentContract: undefined },
          };
        },
      );
      const storage = createSessionStorage(() => port);
      const recovery = createSessionRecovery(
        createAssessmentApi(endpoints, () => "client"),
        storage,
        createSessionLock(() => undefined),
      );
      const actor = createActor(assessmentMachine, {
        input: { recovery },
      }).start();
      t.after(() => actor.stop());
      actor.send({ type: "CONFIGURE", configuration });
      actor.send({ type: "START" });
      await waitFor(
        actor,
        (state) => state.matches({ creation: "createFailed" }),
        { timeout: 2000 },
      );
      assert.ok(isClientUpdateRequired(actor.getSnapshot().context.error));
      assert.equal(actor.getSnapshot().context.view, null);
      assert.equal(
        JSON.stringify(actor.getSnapshot().context).includes("sessionToken"),
        false,
      );
      assert.equal(recovery.warning, storageFails ? STORAGE_ISSUE.FULL : null);
      assert.equal(actor.getSnapshot().context.storageIssue, recovery.warning);
      assert.equal(storage.scan().handles.length, storageFails ? 0 : 1);
      const created = [...server.sessions.values()][0]!;
      assert.equal(
        (await recovery.get(created.credential.sessionId)).kind,
        SESSION_VIEW.ASSESSMENT,
      );
      assert.equal(storage.scan().handles.length, storageFails ? 0 : 1);
      actor.send({ type: "RETRY" });
      actor.send({ type: "REFRESH" });
      assert.ok(actor.getSnapshot().matches({ creation: "createFailed" }));
      assert.equal(server.calls.create, 1);
      port.blockWrite = false;
      actor.send({ type: "HISTORY" });
      await waitFor(actor, (state) => state.matches({ history: "ready" }), {
        timeout: 2000,
      });
      assert.equal(actor.getSnapshot().context.storageIssue, null);
      assert.equal(
        storage.scan().handles[0]?.sessionToken,
        created.credential.sessionToken,
      );
      assert.equal(server.calls.create, 1);
    },
  );

test("refresh-required envelopes and malformed reads retain every existing credential", async (t) => {
  const sessions = [makeSession(), makeSession()];
  const server = fakeServer(sessions);
  const endpoints = fakeEndpoints(server.api);
  const port = new MemoryStorage();
  const storage = createSessionStorage(() => port);
  sessions.forEach(({ credential }) => storage.save(credential));
  const recovery = createSessionRecovery(
    createAssessmentApi(endpoints, () => "client"),
    storage,
    createSessionLock(() => undefined),
  );
  await recovery.check(null);
  const before = [...port.values];
  const credential = sessions[0]!.credential;
  const failure = clientFailure(ERROR_CODE.CLIENT_UPDATE_REQUIRED).failure;
  for (const malformed of [false, true]) {
    for (const operation of [
      "getSession",
      "resumeSession",
      "submitAnswer",
    ] as const) {
      t.mock.method(endpoints, operation, async () =>
        malformed
          ? { ok: true, data: optionIdsResponse({}) }
          : { ok: false, error: failure },
      );
    }
    await assert.rejects(
      recovery.get(credential.sessionId),
      isClientUpdateRequired,
    );
    await assert.rejects(
      recovery.resume(credential.sessionId),
      isClientUpdateRequired,
    );
    await assert.rejects(
      recovery.answer(credential.sessionId, {
        questionId: "question-0",
        selectedOptionId: 1,
        timeSpentSeconds: 5,
      }),
      isClientUpdateRequired,
    );
    assert.deepEqual([...port.values], before);
  }
  const checked = await recovery.check(configuration);
  assert.equal(checked.history.length, 2);
  assert.equal(checked.created, null);
  assert.equal(server.calls.create, 0);
});
