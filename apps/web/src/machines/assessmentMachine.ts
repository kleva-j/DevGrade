import { assign, fromPromise, setup } from "xstate"

import type { Difficulty, Framework } from "../domain/constants"
import type {
  AssessmentResult,
  PublicQuestion,
  AnswerInput,
} from "../domain/types"

/**
 * Client-facing service contract the machine drives. In the app these are thin
 * wrappers over the TanStack Start server functions (which call
 * `createAssessmentService`); in tests they can be plain stubs. Keeping them in
 * `input` makes the machine decoupled and fully unit-testable.
 */
export interface AssessmentServices {
  createSession: (args: {
    framework: Framework
    targetLevel: Difficulty
  }) => Promise<{
    sessionId: string
    sessionToken: string
    questions: PublicQuestion[]
  }>
  submitAnswer: (args: {
    sessionId: string
    sessionToken: string
    answer: AnswerInput
  }) => Promise<{ sessionComplete: boolean }>
  completeSession: (args: {
    sessionId: string
    sessionToken: string
  }) => Promise<AssessmentResult>
}

export interface AssessmentContext {
  services: AssessmentServices
  framework: Framework | null
  targetLevel: Difficulty | null
  sessionId: string | null
  sessionToken: string | null
  questions: PublicQuestion[]
  answers: Record<string, AnswerInput>
  currentIndex: number
  selectedOption: number | null
  /** Epoch ms when the current question was first shown (for time tracking). */
  questionStartedAt: number
  focusLossCount: number
  /** The answer currently being persisted (kept for the submit actor + retry). */
  pendingAnswer: AnswerInput | null
  result: AssessmentResult | null
  error: string | null
}

export type AssessmentEvent =
  | { type: "CONFIGURE"; framework: Framework; targetLevel: Difficulty }
  | { type: "START" }
  | { type: "SELECT_OPTION"; option: number }
  | { type: "SUBMIT_ANSWER" }
  | { type: "FOCUS_LOSS" }
  | { type: "RETRY" }
  | { type: "RESTART" }

export interface AssessmentInput {
  services: AssessmentServices
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong."
}

export const assessmentMachine = setup({
  types: {
    context: {} as AssessmentContext,
    events: {} as AssessmentEvent,
    input: {} as AssessmentInput,
  },
  actors: {
    createSession: fromPromise(
      async ({
        input,
      }: {
        input: {
          services: AssessmentServices
          framework: Framework
          targetLevel: Difficulty
        }
      }) =>
        input.services.createSession({
          framework: input.framework,
          targetLevel: input.targetLevel,
        })
    ),
    submitAnswer: fromPromise(
      async ({
        input,
      }: {
        input: {
          services: AssessmentServices
          sessionId: string
          sessionToken: string
          answer: AnswerInput
        }
      }) =>
        input.services.submitAnswer({
          sessionId: input.sessionId,
          sessionToken: input.sessionToken,
          answer: input.answer,
        })
    ),
    completeSession: fromPromise(
      async ({
        input,
      }: {
        input: {
          services: AssessmentServices
          sessionId: string
          sessionToken: string
        }
      }) =>
        input.services.completeSession({
          sessionId: input.sessionId,
          sessionToken: input.sessionToken,
        })
    ),
  },
  guards: {
    isConfigured: ({ context }) =>
      context.framework !== null && context.targetLevel !== null,
    hasSelection: ({ context }) => context.selectedOption !== null,
    isLastQuestion: ({ context }) =>
      context.currentIndex >= context.questions.length - 1,
  },
  actions: {
    commitPendingAnswer: assign({
      answers: ({ context }) => {
        if (!context.pendingAnswer) return context.answers
        return {
          ...context.answers,
          [context.pendingAnswer.questionId]: context.pendingAnswer,
        }
      },
      pendingAnswer: null,
    }),
    resetSession: assign({
      sessionId: null,
      sessionToken: null,
      questions: [],
      answers: {},
      currentIndex: 0,
      selectedOption: null,
      pendingAnswer: null,
      result: null,
      error: null,
      focusLossCount: 0,
    }),
  },
}).createMachine({
  id: "assessment",
  context: ({ input }) => ({
    services: input.services,
    framework: null,
    targetLevel: null,
    sessionId: null,
    sessionToken: null,
    questions: [],
    answers: {},
    currentIndex: 0,
    selectedOption: null,
    questionStartedAt: 0,
    focusLossCount: 0,
    pendingAnswer: null,
    result: null,
    error: null,
  }),
  initial: "configuring",
  states: {
    configuring: {
      on: {
        CONFIGURE: {
          actions: assign({
            framework: ({ event }) => event.framework,
            targetLevel: ({ event }) => event.targetLevel,
          }),
        },
        START: { target: "creatingSession", guard: "isConfigured" },
      },
    },

    creatingSession: {
      invoke: {
        src: "createSession",
        input: ({ context }) => ({
          services: context.services,
          framework: context.framework!,
          targetLevel: context.targetLevel!,
        }),
        onDone: {
          target: "answering",
          actions: assign({
            sessionId: ({ event }) => event.output.sessionId,
            sessionToken: ({ event }) => event.output.sessionToken,
            questions: ({ event }) => event.output.questions,
            currentIndex: 0,
            answers: {},
            error: null,
          }),
        },
        onError: {
          target: "setupFailed",
          actions: assign({ error: ({ event }) => errorMessage(event.error) }),
        },
      },
    },

    answering: {
      // Reset the per-question selection + timer whenever a question is shown.
      entry: assign({
        selectedOption: null,
        questionStartedAt: () => Date.now(),
      }),
      on: {
        SELECT_OPTION: {
          actions: assign({ selectedOption: ({ event }) => event.option }),
        },
        FOCUS_LOSS: {
          actions: assign({
            focusLossCount: ({ context }) => context.focusLossCount + 1,
          }),
        },
        SUBMIT_ANSWER: {
          target: "submittingAnswer",
          guard: "hasSelection",
          actions: assign({
            pendingAnswer: ({ context }) => ({
              questionId: context.questions[context.currentIndex].id,
              selectedAnswer: context.selectedOption!,
              timeSpentSeconds: Math.max(
                0,
                Math.round((Date.now() - context.questionStartedAt) / 1000)
              ),
            }),
          }),
        },
      },
    },

    submittingAnswer: {
      invoke: {
        src: "submitAnswer",
        input: ({ context }) => ({
          services: context.services,
          sessionId: context.sessionId!,
          sessionToken: context.sessionToken!,
          answer: context.pendingAnswer!,
        }),
        onDone: [
          {
            // Record the answer, then move on or finish.
            target: "completing",
            guard: "isLastQuestion",
            actions: "commitPendingAnswer",
          },
          {
            target: "answering",
            actions: [
              "commitPendingAnswer",
              assign({
                currentIndex: ({ context }) => context.currentIndex + 1,
              }),
            ],
          },
        ],
        onError: {
          target: "answerFailed",
          actions: assign({ error: ({ event }) => errorMessage(event.error) }),
        },
      },
    },

    // Transient retry states keep the user's selection so they can resubmit.
    answerFailed: {
      on: {
        RETRY: { target: "submittingAnswer" },
      },
    },

    completing: {
      invoke: {
        src: "completeSession",
        input: ({ context }) => ({
          services: context.services,
          sessionId: context.sessionId!,
          sessionToken: context.sessionToken!,
        }),
        onDone: {
          target: "completed",
          actions: assign({
            result: ({ event }) => event.output,
            error: null,
          }),
        },
        onError: {
          target: "completeFailed",
          actions: assign({ error: ({ event }) => errorMessage(event.error) }),
        },
      },
    },

    completeFailed: {
      on: { RETRY: { target: "completing" } },
    },

    setupFailed: {
      on: {
        RETRY: { target: "creatingSession" },
        RESTART: { target: "configuring" },
      },
    },

    completed: {
      on: { RESTART: { target: "configuring", actions: "resetSession" } },
    },
  },
})
