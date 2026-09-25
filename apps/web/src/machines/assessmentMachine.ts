import { assign, fromPromise, setup } from "xstate";
import type { DoneActorEvent } from "xstate";

import type { AnswerInput, AssessmentConfiguration } from "@/domain/types";
import type {
  AssessmentView,
  DeleteSessionInput,
  SessionMetadata,
  SessionView,
} from "@/domain/sessionContracts";
import type { ErrorCode } from "@/server/errors";
import type { DiscoveryCheck, SessionRecovery } from "./sessionRecovery";
import type { StorageIssue } from "./sessionStorage";

import {
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  SESSION_STATUS,
  SESSION_VIEW,
  SURVEY_RATING_MAX,
  SURVEY_RATING_MIN,
} from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import { AssessmentClientError } from "./createSessionAdapter";
import { isUnavailableError, needsReconciliation } from "./sessionRecovery";

export interface AssessmentContext {
  recovery: SessionRecovery;
  now: () => number;
  requestedConfiguration: AssessmentConfiguration | null;
  history: SessionMetadata[];
  storageIssue: StorageIssue | null;
  sessionId: string | null;
  view: SessionView | null;
  selectedOption: number | null;
  questionStartedAt: number;
  timerPausedAt: number | null;
  pendingAnswer: AnswerInput | null;
  focusLossCount: number;
  expectedDeleteState: DeleteSessionInput["expectedState"];
  /** Only deletion from the creation gate may continue the original Start. */
  afterDelete: AssessmentConfiguration | null;
  error: ErrorCode | "request_failed" | null;
  notice: "changed_state" | null;
  pendingRating: number | null;
}
export interface AssessmentInput {
  recovery: SessionRecovery;
  now?: () => number;
}
export type AssessmentEvent =
  | { type: "BOOTSTRAP" }
  | { type: "CONFIGURE"; configuration: AssessmentConfiguration }
  | { type: "START" }
  | { type: "REFRESH" }
  | { type: "OPEN"; sessionId: string }
  | { type: "RESUME"; sessionId: string }
  | {
      type: "DELETE";
      sessionId: string;
      expectedState: DeleteSessionInput["expectedState"];
    }
  | { type: "CONFIRM_DELETE" }
  | { type: "CANCEL" }
  | { type: "SELECT_OPTION"; option: number }
  | { type: "SUBMIT_ANSWER" }
  | { type: "FOCUS_LOSS" }
  | { type: "OFFLINE" }
  | { type: "FOCUS_RETURN" }
  | { type: "RETRY" }
  | { type: "HISTORY" }
  | { type: "SUBMIT_SURVEY"; rating: number };

export function boundedDuration(startedAt: number, now: number) {
  const seconds = Math.round((now - startedAt) / 1000);
  return Number.isFinite(seconds) ? Math.min(3600, Math.max(0, seconds)) : 0;
}
/** Accepted IDs, never answeredCount or a local index increment, define order. */
export function firstUnanswered(view: AssessmentView) {
  const accepted = new Set(
    view.acceptedAnswers.map((answer) => answer.questionId),
  );
  return view.questions.find((question) => !accepted.has(question.id)) ?? null;
}
function assessment(context: AssessmentContext) {
  return context.view?.kind === SESSION_VIEW.ASSESSMENT ? context.view : null;
}

const receiveView = {
  type: "applyView",
  params: ({ event }: { event: DoneActorEvent<SessionView> }) => event.output,
} as const;
const receiveCheck = {
  type: "applyCheck",
  params: ({ event }: { event: DoneActorEvent<DiscoveryCheck> }) =>
    event.output,
} as const;

const machineSetup = setup({
  types: {
    context: {} as AssessmentContext,
    events: {} as AssessmentEvent,
    input: {} as AssessmentInput,
  },
  actors: {
    check: fromPromise(
      ({
        input,
        signal,
      }: {
        input: Pick<AssessmentContext, "recovery" | "requestedConfiguration">;
        signal: AbortSignal;
      }) => input.recovery.check(input.requestedConfiguration, signal),
    ),
    get: fromPromise(({ input }: { input: AssessmentContext }) =>
      input.recovery.get(input.sessionId!),
    ),
    resume: fromPromise(({ input }: { input: AssessmentContext }) =>
      input.recovery.resume(input.sessionId!),
    ),
    answer: fromPromise(({ input }: { input: AssessmentContext }) =>
      input.recovery.answer(input.sessionId!, input.pendingAnswer!),
    ),
    complete: fromPromise(({ input }: { input: AssessmentContext }) =>
      input.recovery.complete(input.sessionId!),
    ),
    delete: fromPromise(({ input }: { input: AssessmentContext }) =>
      input.recovery.delete(input.sessionId!, input.expectedDeleteState),
    ),
    survey: fromPromise(({ input }: { input: AssessmentContext }) =>
      input.recovery.survey(input.sessionId!, input.pendingRating!),
    ),
  },
  guards: {
    unavailable: ({ event }) =>
      "error" in event && isUnavailableError(event.error),
    reconcile: ({ event }) =>
      "error" in event && needsReconciliation(event.error),
  },
  actions: {
    setError: assign({
      error: ({ event }) =>
        "error" in event && event.error instanceof AssessmentClientError
          ? event.error.code
          : "request_failed",
    }),

    goHome: assign({
      view: null,
      sessionId: null,
      afterDelete: null,
      selectedOption: null,
      pendingAnswer: null,
      error: null,
      notice: null,
    }),
    open: assign({
      sessionId: ({ event }) =>
        event.type === "OPEN" || event.type === "RESUME"
          ? event.sessionId
          : null,
    }),
    requestDelete: assign(
      ({ event }, afterDelete: AssessmentConfiguration | null) =>
        event.type === "DELETE"
          ? {
              sessionId: event.sessionId,
              expectedDeleteState: event.expectedState,
              afterDelete,
              error: null,
              notice: null,
            }
          : {},
    ),
    applyCheck: assign((_, check: DiscoveryCheck) => ({
      history: check.history,
      storageIssue: check.storageIssue,
    })),
    applyView: assign(({ context }, view: SessionView) => {
      const previous = assessment(context);
      const sameQuestion =
        previous &&
        view.kind === SESSION_VIEW.ASSESSMENT &&
        firstUnanswered(previous)?.id === firstUnanswered(view)?.id;
      return {
        view,
        sessionId: view.sessionId,
        pendingAnswer: null,
        error: null,
        selectedOption: sameQuestion ? context.selectedOption : null,
        questionStartedAt: sameQuestion
          ? context.questionStartedAt
          : context.now(),
        timerPausedAt: sameQuestion ? context.timerPausedAt : null,
        storageIssue: context.recovery.warning,
        afterDelete: null,
      };
    }),
    pauseTimer: assign({
      timerPausedAt: ({ context }) => context.timerPausedAt ?? context.now(),
    }),
  },
});

const unavailable = {
  guard: "unavailable",
  target: "#assessment.unavailable",
} as const;
const reconcileView = {
  guard: "reconcile",
  target: "#assessment.viewing.restoring",
} as const;
// Both read paths retain their parent state's viewing/attempting permission.
const reading = machineSetup.createStateConfig({
  invoke: {
    src: "get",
    input: ({ context }) => context,
    onDone: { target: "ready", actions: receiveView },
    onError: [unavailable, { target: "readFailed", actions: "setError" }],
  },
});
// Discovery never creates; only the separate creating state supplies configuration.
const checking = machineSetup.createStateConfig({
  entry: assign({ error: null }),
  invoke: {
    src: "check",
    input: ({ context }) => ({
      recovery: context.recovery,
      requestedConfiguration: null,
    }),
    onDone: { target: "ready", actions: receiveCheck },
    onError: { target: "checkFailed", actions: "setError" },
  },
});

export const assessmentMachine = machineSetup.createMachine({
  id: "assessment",
  context: ({ input }) => ({
    recovery: input.recovery,
    now: input.now ?? Date.now,
    requestedConfiguration: null,
    history: [],
    storageIssue: null,
    sessionId: null,
    view: null,
    selectedOption: null,
    questionStartedAt: 0,
    timerPausedAt: null,
    pendingAnswer: null,
    focusLossCount: 0,
    expectedDeleteState: DELETE_EXPECTATION.UNFINISHED,
    afterDelete: null,
    error: null,
    notice: null,
    pendingRating: null,
  }),
  initial: "bootstrap",
  on: {
    HISTORY: { target: ".history", actions: "goHome" },
    CANCEL: { target: ".history.ready", actions: "goHome" },
    OPEN: { target: ".viewing.restoring", actions: ["goHome", "open"] },
    RESUME: { target: ".attempting.resuming", actions: ["goHome", "open"] },
    DELETE: {
      target: ".confirmDelete",
      actions: { type: "requestDelete", params: null },
    },
  },
  states: {
    bootstrap: { on: { BOOTSTRAP: "history" } },
    history: {
      initial: "checking",
      states: {
        checking,
        checkFailed: { on: { RETRY: "checking" } },
        ready: {
          on: {
            CONFIGURE: {
              actions: assign({
                requestedConfiguration: ({ event }) => ({
                  ...event.configuration,
                }),
              }),
            },
            START: {
              guard: ({ context }) => context.requestedConfiguration !== null,
              target: "#assessment.creation",
            },
            REFRESH: "checking",
          },
        },
      },
    },
    creation: {
      initial: "creating",
      on: {
        DELETE: {
          target: "confirmDelete",
          actions: {
            type: "requestDelete",
            params: ({ context }) => context.requestedConfiguration,
          },
        },
      },
      states: {
        creating: {
          entry: assign({ error: null, notice: null }),
          invoke: {
            src: "check",
            input: ({ context }) => ({
              recovery: context.recovery,
              requestedConfiguration: context.requestedConfiguration,
            }),
            onDone: [
              {
                guard: ({ event }) => event.output.created !== null,
                target: "#assessment.attempting.ready",
                actions: [
                  receiveCheck,
                  {
                    type: "applyView",
                    params: ({ event }) => event.output.created!,
                  },
                ],
              },
              {
                target: "ready",
                actions: receiveCheck,
              },
            ],
            onError: {
              target: "createFailed",
              actions: "setError",
            },
          },
        },
        createFailed: { on: { RETRY: "creating" } },
        checking,
        checkFailed: { on: { RETRY: "checking" } },
        ready: { on: { REFRESH: "checking", START: "creating" } },
      },
    },
    // Opening/refreshing history never grants permission to answer or first-complete.
    viewing: {
      initial: "ready",
      states: {
        restoring: reading,
        readFailed: { on: { RETRY: "restoring" } },
        ready: {
          always: {
            guard: ({ context }) =>
              context.view?.kind === SESSION_VIEW.REPORT ||
              context.view?.kind === SESSION_VIEW.LEGACY_SUMMARY,
            target: "#assessment.completed",
          },
          on: { REFRESH: "restoring" },
        },
      },
    },
    attempting: {
      initial: "resuming",
      on: {
        OFFLINE: { actions: "pauseTimer" },
        FOCUS_LOSS: {
          actions: [
            "pauseTimer",
            assign({
              focusLossCount: ({ context }) => context.focusLossCount + 1,
            }),
          ],
        },
        FOCUS_RETURN: {
          actions: assign({
            questionStartedAt: ({ context }) =>
              context.timerPausedAt === null
                ? context.questionStartedAt
                : context.questionStartedAt +
                  Math.max(0, context.now() - context.timerPausedAt),
            timerPausedAt: null,
          }),
        },
      },
      states: {
        resuming: {
          invoke: {
            src: "resume",
            input: ({ context }) => context,
            onDone: {
              target: "ready",
              actions: receiveView,
            },
            onError: [
              unavailable,
              reconcileView,
              {
                target: "resumeFailed",
                actions: "setError",
              },
            ],
          },
        },
        resumeFailed: { on: { RETRY: "resuming" } },
        ready: {
          always: [
            {
              guard: ({ context }) => !assessment(context),
              target: "#assessment.viewing.ready",
            },
            {
              guard: ({ context }) =>
                firstUnanswered(assessment(context)!) === null,
              target: "completing",
            },
            { target: "answering" },
          ],
        },
        answering: {
          on: {
            SELECT_OPTION: {
              guard: ({ context, event }) =>
                Number.isInteger(event.option) &&
                event.option >= 0 &&
                event.option <
                  (firstUnanswered(assessment(context)!)?.options.length ?? 0),
              actions: assign({ selectedOption: ({ event }) => event.option }),
            },
            SUBMIT_ANSWER: {
              guard: ({ context }) => context.selectedOption !== null,
              target: "submittingAnswer",
              actions: assign({
                pendingAnswer: ({ context }) => ({
                  questionId: firstUnanswered(assessment(context)!)!.id,
                  selectedAnswer: context.selectedOption!,
                  timeSpentSeconds: boundedDuration(
                    context.questionStartedAt,
                    context.timerPausedAt ?? context.now(),
                  ),
                }),
              }),
            },
            REFRESH: "reconciling",
          },
        },
        submittingAnswer: {
          invoke: {
            src: "answer",
            input: ({ context }) => context,
            onDone: {
              target: "ready",
              actions: {
                type: "applyView",
                params: ({ context, event }) => ({
                  ...assessment(context)!,
                  acceptedAnswers: event.output.acceptedAnswers,
                  answeredCount: event.output.answeredCount,
                  totalQuestions: event.output.totalQuestions,
                  nextQuestionId: event.output.nextQuestionId,
                }),
              },
            },
            onError: [
              unavailable,
              {
                guard: ({ event }) =>
                  event.error instanceof AssessmentClientError &&
                  event.error.code === ERROR_CODE.CONFLICT,
                target: "reconciling",
              },
              reconcileView,
              {
                target: "answerFailed",
                actions: "setError",
              },
            ],
          },
        },
        // Replay exactly the pending answer, including its original duration.
        answerFailed: { on: { RETRY: "submittingAnswer" } },
        reconciling: reading,
        readFailed: { on: { RETRY: "reconciling" } },
        completing: {
          invoke: {
            src: "complete",
            input: ({ context }) => context,
            onDone: {
              target: "#assessment.completed",
              actions: receiveView,
            },
            onError: [
              unavailable,
              reconcileView,
              {
                target: "completeFailed",
                actions: "setError",
              },
            ],
          },
        },
        // A lost completion may already have awarded a report; read before retrying.
        completeFailed: { on: { RETRY: "reconciling" } },
      },
    },
    unavailable: {
      entry: assign(({ context }) => ({
        view: null,
        pendingAnswer: null,
        selectedOption: null,
        afterDelete: null,
        history: context.history.filter(
          (entry) => entry.sessionId !== context.sessionId,
        ),
      })),
    },
    confirmDelete: { on: { CONFIRM_DELETE: "deleting" } },
    deleting: {
      invoke: {
        src: "delete",
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }) =>
              event.output.kind === DELETE_OUTCOME.CHANGED_STATE,
            target: "viewing.restoring",
            actions: assign({ afterDelete: null, notice: "changed_state" }),
          },
          { target: "deleted" },
        ],
        onError: [
          {
            guard: "unavailable",
            target: "deleted",
          },
          {
            target: "deleteFailed",
            actions: "setError",
          },
        ],
      },
    },
    deleted: {
      entry: assign(({ context }) => ({
        view: null,
        history: context.history.filter(
          (entry) => entry.sessionId !== context.sessionId,
        ),
      })),
      always: [
        {
          guard: ({ context }) => context.afterDelete !== null,
          target: "creation",
          actions: assign({
            requestedConfiguration: ({ context }) => context.afterDelete,
            afterDelete: null,
          }),
        },
        { target: "history", actions: "goHome" },
      ],
    },
    deleteFailed: { on: { RETRY: "deleting" } },
    completed: {
      initial: "surveyPrompt",
      on: { REFRESH: "viewing.restoring" },
      states: {
        surveyPrompt: {
          on: {
            SUBMIT_SURVEY: {
              guard: ({ event }) =>
                Number.isInteger(event.rating) &&
                event.rating >= SURVEY_RATING_MIN &&
                event.rating <= SURVEY_RATING_MAX,
              target: "submittingSurvey",
              actions: assign({
                pendingRating: ({ event }) => event.rating,
                error: null,
              }),
            },
          },
        },
        submittingSurvey: {
          invoke: {
            src: "survey",
            input: ({ context }) => context,
            onDone: {
              target: "surveyPrompt",
              actions: assign(({ context }) => ({
                view:
                  context.view && "surveyRating" in context.view
                    ? { ...context.view, surveyRating: context.pendingRating }
                    : context.view,
                error: null,
              })),
            },
            onError: [
              unavailable,
              reconcileView,
              {
                target: "surveyPrompt",
                actions: "setError",
              },
            ],
          },
        },
      },
    },
  },
});

export function deletionExpectation(
  metadata: Pick<SessionMetadata, "effectiveStatus">,
) {
  return metadata.effectiveStatus === SESSION_STATUS.COMPLETED
    ? DELETE_EXPECTATION.COMPLETED
    : DELETE_EXPECTATION.UNFINISHED;
}
