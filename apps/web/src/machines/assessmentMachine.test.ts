import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { TestContext } from "node:test";
import type { ActorRefFrom } from "xstate";
import type {
  AssessmentConfiguration,
  AssessmentResult,
  PublicQuestion,
} from "@/domain/types";
import type { AssessmentServices } from "./assessmentMachine";

import { createActor, waitFor } from "xstate";

import {
  ASSESSMENT_LENGTH,
  ASSESSMENT_LENGTHS,
  DEFAULT_ASSESSMENT_LENGTH,
  DIFFICULTY,
  FRAMEWORK,
  PROFICIENCY,
  SKILL_CATEGORY,
} from "@/domain/constants";

import { assessmentMachine } from "./assessmentMachine";

type AssessmentActor = ActorRefFrom<typeof assessmentMachine>;

const defaultConfiguration: AssessmentConfiguration = {
  framework: FRAMEWORK.REACT,
  targetLevel: DIFFICULTY.MID,
  questionCount: DEFAULT_ASSESSMENT_LENGTH,
};

function harness(
  t: TestContext,
  configuration = defaultConfiguration,
  returnedCount: number = configuration.questionCount,
) {
  const questions: PublicQuestion[] = Array.from(
    { length: returnedCount },
    (_, index) => ({
      id: `question-${index}`,
      skillCategory: SKILL_CATEGORY.REACTIVITY,
      title: `Question ${index + 1}`,
      prompt: "Select an answer.",
      codeBlock: null,
      options: ["A", "B", "C", "D"],
    }),
  );
  const session = {
    sessionId: "session-id",
    sessionToken: "session-token",
    questions,
  };
  const result: AssessmentResult = {
    sessionId: session.sessionId,
    framework: configuration.framework,
    targetLevel: configuration.targetLevel,
    totalScore: 100,
    maxScore: 100,
    proficiencyLevel: PROFICIENCY.PROFICIENT,
    categoryScores: [],
    skillGaps: [],
    questionResults: questions.map((question) => ({
      questionId: question.id,
      isCorrect: true,
      explanation: "Explanation returned after completion.",
    })),
  };
  const services = {
    createSession: t.mock.fn<AssessmentServices["createSession"]>(
      async () => session,
    ),
    submitAnswer: t.mock.fn<AssessmentServices["submitAnswer"]>(async () => ({
      sessionComplete: false,
    })),
    completeSession: t.mock.fn<AssessmentServices["completeSession"]>(
      async () => result,
    ),
    submitSurvey: t.mock.fn<AssessmentServices["submitSurvey"]>(async () => ({
      success: true,
    })),
  } satisfies AssessmentServices;
  const actor = createActor(assessmentMachine, { input: { services } });
  actor.start();
  t.after(() => actor.stop());
  const initialContext = actor.getSnapshot().context;

  function configureAndStart() {
    actor.send({ type: "CONFIGURE", configuration });
    actor.send({ type: "START" });
  }

  return {
    actor,
    services,
    configuration,
    questions,
    session,
    result,
    initialContext,
    configureAndStart,
  };
}

function waitForState(
  actor: AssessmentActor,
  state:
    | "answering"
    | "setupFailed"
    | "answerFailed"
    | "completeFailed"
    | "completed",
) {
  return waitFor(actor, (snapshot) => snapshot.matches(state), {
    timeout: 1_000,
  });
}

function submitAnswer(actor: AssessmentActor) {
  actor.send({ type: "SELECT_OPTION", option: 0 });
  actor.send({ type: "SUBMIT_ANSWER" });
}

function assertConfigurationLocked(
  actor: AssessmentActor,
  configuration: AssessmentConfiguration,
) {
  const before = actor.getSnapshot().context;
  actor.send({
    type: "CONFIGURE",
    configuration: {
      framework: FRAMEWORK.VUE,
      targetLevel: DIFFICULTY.JUNIOR,
      questionCount:
        configuration.questionCount === ASSESSMENT_LENGTH.DEEP
          ? ASSESSMENT_LENGTH.QUICK
          : ASSESSMENT_LENGTH.DEEP,
    },
  });
  assert.deepEqual(actor.getSnapshot().context, before);
  assert.deepEqual(actor.getSnapshot().context.configuration, configuration);
}

describe("assessment lengths", () => {
  for (const questionCount of ASSESSMENT_LENGTHS) {
    test(`${questionCount} questions: complete only after the actual last answer is saved`, async (t) => {
      const h = harness(t, { ...defaultConfiguration, questionCount });
      h.configureAndStart();
      await waitForState(h.actor, "answering");

      assert.deepEqual(h.services.createSession.mock.calls[0]?.arguments, [
        h.configuration,
      ]);
      assert.equal(
        h.actor.getSnapshot().context.questions.length,
        questionCount,
      );

      for (let index = 0; index < questionCount; index++) {
        assert.equal(h.actor.getSnapshot().context.currentIndex, index);
        assert.equal(h.services.completeSession.mock.callCount(), 0);
        assertConfigurationLocked(h.actor, h.configuration);
        submitAnswer(h.actor);
        assert.ok(h.actor.getSnapshot().matches("submittingAnswer"));
        assert.equal(h.services.completeSession.mock.callCount(), 0);
        await waitForState(
          h.actor,
          index === questionCount - 1 ? "completed" : "answering",
        );
        assert.equal(
          Object.keys(h.actor.getSnapshot().context.answers).length,
          index + 1,
        );
      }

      assert.equal(h.services.submitAnswer.mock.callCount(), questionCount);
      assert.equal(h.services.completeSession.mock.callCount(), 1);
      assert.deepEqual(
        h.services.submitAnswer.mock.calls.map(
          (call) => call.arguments[0].answer.questionId,
        ),
        h.questions.map((question) => question.id),
      );
      assert.deepEqual(h.services.completeSession.mock.calls[0]?.arguments, [
        {
          sessionId: h.session.sessionId,
          sessionToken: h.session.sessionToken,
        },
      ]);
      assert.deepEqual(h.actor.getSnapshot().context.result, h.result);
      assertConfigurationLocked(h.actor, h.configuration);
    });
  }

  for (const [requested, returned] of [
    [ASSESSMENT_LENGTH.QUICK, ASSESSMENT_LENGTH.STANDARD],
    [ASSESSMENT_LENGTH.DEEP, ASSESSMENT_LENGTH.QUICK],
  ] as const) {
    test(`returned questions are authoritative: requested ${requested}, received ${returned}`, async (t) => {
      const h = harness(
        t,
        { ...defaultConfiguration, questionCount: requested },
        returned,
      );
      // A premature server completion flag must not skip returned questions.
      h.services.submitAnswer.mock.mockImplementation(async () => ({
        sessionComplete: true,
      }));
      h.configureAndStart();
      await waitForState(h.actor, "answering");

      for (let index = 0; index < returned; index++) {
        assert.equal(h.actor.getSnapshot().context.currentIndex, index);
        assert.equal(h.services.completeSession.mock.callCount(), 0);
        submitAnswer(h.actor);
        await waitForState(
          h.actor,
          index === returned - 1 ? "completed" : "answering",
        );
      }

      assert.equal(h.services.submitAnswer.mock.callCount(), returned);
      assert.equal(h.services.completeSession.mock.callCount(), 1);
      assert.equal(
        h.actor.getSnapshot().context.result?.questionResults.length,
        returned,
      );
      assert.equal(
        h.actor.getSnapshot().context.configuration?.questionCount,
        requested,
      );
    });
  }
});

describe("assessment configuration lifecycle", () => {
  test("requires configuration and copies selections before starting", async (t) => {
    const h = harness(t);
    h.actor.send({ type: "START" });
    assert.ok(h.actor.getSnapshot().matches("configuring"));
    assert.equal(h.services.createSession.mock.callCount(), 0);

    h.actor.send({ type: "CONFIGURE", configuration: defaultConfiguration });
    const configuration = {
      ...defaultConfiguration,
      questionCount: ASSESSMENT_LENGTH.DEEP,
    };
    h.actor.send({ type: "CONFIGURE", configuration });
    const expected = { ...configuration };
    configuration.targetLevel = DIFFICULTY.SENIOR;
    assert.deepEqual(h.actor.getSnapshot().context.configuration, expected);
    h.actor.send({ type: "START" });
    await waitForState(h.actor, "answering");
    assert.deepEqual(h.services.createSession.mock.calls[0]?.arguments, [
      expected,
    ]);
  });

  test("creation retry preserves the locked configuration", async (t) => {
    const h = harness(t, {
      ...defaultConfiguration,
      questionCount: ASSESSMENT_LENGTH.STANDARD,
    });
    h.services.createSession.mock.mockImplementationOnce(async () => {
      throw new Error("Creation failed");
    });
    h.configureAndStart();
    assert.ok(h.actor.getSnapshot().matches("creatingSession"));
    assertConfigurationLocked(h.actor, h.configuration);
    await waitForState(h.actor, "setupFailed");
    assertConfigurationLocked(h.actor, h.configuration);
    h.actor.send({ type: "RETRY" });
    assertConfigurationLocked(h.actor, h.configuration);
    await waitForState(h.actor, "answering");

    assert.deepEqual(
      h.services.createSession.mock.calls.map((call) => call.arguments),
      [[h.configuration], [h.configuration]],
    );
    assert.equal(h.actor.getSnapshot().context.error, null);
  });

  test("return to setup retains selections, clears the failure, and allows reconfiguration", async (t) => {
    const h = harness(t, {
      ...defaultConfiguration,
      targetLevel: DIFFICULTY.SENIOR,
      questionCount: ASSESSMENT_LENGTH.DEEP,
    });
    h.services.createSession.mock.mockImplementationOnce(async () => {
      throw new Error("Creation failed");
    });
    h.configureAndStart();
    await waitForState(h.actor, "setupFailed");
    h.actor.send({ type: "RESTART" });
    assert.ok(h.actor.getSnapshot().matches("configuring"));
    assert.deepEqual(h.actor.getSnapshot().context, {
      ...h.initialContext,
      configuration: h.configuration,
    });

    h.actor.send({ type: "CONFIGURE", configuration: defaultConfiguration });
    h.actor.send({ type: "START" });
    await waitForState(h.actor, "answering");
    assert.deepEqual(h.services.createSession.mock.calls[1]?.arguments, [
      defaultConfiguration,
    ]);
  });

  test("answer and completion retries preserve configuration, credentials, and the pending answer", async (t) => {
    const h = harness(t);
    h.services.submitAnswer.mock.mockImplementationOnce(async () => {
      throw new Error("Answer failed");
    });
    h.services.completeSession.mock.mockImplementationOnce(async () => {
      throw new Error("Completion failed");
    });
    h.configureAndStart();
    await waitForState(h.actor, "answering");
    h.actor.send({ type: "FOCUS_LOSS" });
    submitAnswer(h.actor);
    assertConfigurationLocked(h.actor, h.configuration);
    await waitForState(h.actor, "answerFailed");
    const failed = h.actor.getSnapshot().context;
    assert.equal(failed.currentIndex, 0);
    assert.equal(failed.selectedOption, 0);
    assert.deepEqual(failed.answers, {});
    assertConfigurationLocked(h.actor, h.configuration);

    h.actor.send({ type: "RETRY" });
    assertConfigurationLocked(h.actor, h.configuration);
    await waitForState(h.actor, "answering");
    assert.deepEqual(
      h.services.submitAnswer.mock.calls[1]?.arguments,
      h.services.submitAnswer.mock.calls[0]?.arguments,
    );
    assert.equal(h.actor.getSnapshot().context.currentIndex, 1);
    assert.equal(h.actor.getSnapshot().context.pendingAnswer, null);
    assert.equal(h.actor.getSnapshot().context.focusLossCount, 1);

    for (let index = 1; index < h.questions.length; index++) {
      submitAnswer(h.actor);
      await waitForState(
        h.actor,
        index === h.questions.length - 1 ? "completeFailed" : "answering",
      );
    }
    const answers = h.actor.getSnapshot().context.answers;
    assertConfigurationLocked(h.actor, h.configuration);
    h.actor.send({ type: "RETRY" });
    assert.ok(h.actor.getSnapshot().matches("completing"));
    assertConfigurationLocked(h.actor, h.configuration);
    await waitForState(h.actor, "completed");
    assert.deepEqual(
      h.services.completeSession.mock.calls[1]?.arguments,
      h.services.completeSession.mock.calls[0]?.arguments,
    );
    assert.deepEqual(h.actor.getSnapshot().context.answers, answers);
    assert.equal(h.services.createSession.mock.callCount(), 1);
    assert.equal(
      h.services.submitAnswer.mock.callCount(),
      h.questions.length + 1,
    );
    assert.equal(h.actor.getSnapshot().context.error, null);
  });

  test("completed restart retains selections but clears every session, timing, and survey field", async (t) => {
    const h = harness(t, {
      ...defaultConfiguration,
      targetLevel: DIFFICULTY.SENIOR,
      questionCount: ASSESSMENT_LENGTH.DEEP,
    });
    h.services.submitSurvey.mock.mockImplementationOnce(async () => {
      throw new Error("Survey failed");
    });
    h.configureAndStart();
    await waitForState(h.actor, "answering");
    h.actor.send({ type: "FOCUS_LOSS" });
    for (let index = 0; index < h.questions.length; index++) {
      submitAnswer(h.actor);
      await waitForState(
        h.actor,
        index === h.questions.length - 1 ? "completed" : "answering",
      );
    }
    h.actor.send({ type: "SUBMIT_SURVEY", rating: 5 });
    assertConfigurationLocked(h.actor, h.configuration);
    await waitFor(
      h.actor,
      (snapshot) => snapshot.matches({ completed: "surveyPrompt" }),
      { timeout: 1_000 },
    );
    assert.equal(h.actor.getSnapshot().context.surveyError, "Survey failed");
    assert.equal(h.actor.getSnapshot().context.surveyRating, 5);
    assert.ok(h.actor.getSnapshot().context.questionStartedAt > 0);

    h.actor.send({ type: "RESTART" });
    assert.ok(h.actor.getSnapshot().matches("configuring"));
    assert.deepEqual(h.actor.getSnapshot().context, {
      ...h.initialContext,
      configuration: h.configuration,
    });
    h.services.createSession.mock.mockImplementationOnce(async () => ({
      ...h.session,
      sessionId: "new-session",
      sessionToken: "new-token",
    }));
    h.actor.send({ type: "START" });
    await waitForState(h.actor, "answering");
    assert.deepEqual(h.services.createSession.mock.calls[1]?.arguments, [
      h.configuration,
    ]);
    assert.equal(h.actor.getSnapshot().context.sessionId, "new-session");
    assert.equal(h.actor.getSnapshot().context.sessionToken, "new-token");
    assert.equal(h.actor.getSnapshot().context.currentIndex, 0);
    assert.deepEqual(h.actor.getSnapshot().context.answers, {});
  });
});
