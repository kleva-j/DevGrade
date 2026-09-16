/**
 * Centralized user-facing messages for the assessment API.
 *
 * Keeping copy in one place keeps wording consistent, makes review easy, and
 * gives a single seam for future i18n. Dynamic messages are functions so the
 * interpolation lives here rather than at the throw site.
 */
export const MESSAGES = {
  invalidFrameworkOrLevel: "Invalid framework or level.",
  frameworkUnavailable: (framework: string, supported: readonly string[]) =>
    `${framework} is not available yet. The MVP supports: ${supported.join(", ")}.`,
  rateLimited: (maxPerHour: number) =>
    `Rate limit reached (${maxPerHour} sessions/hour). Try again later.`,
  insufficientQuestions:
    "Not enough active questions to build a balanced assessment for this selection.",
  invalidAnswerPayload: "Invalid answer payload.",
  questionNotInSession: "Question is not part of this session.",
  questionNotFound: "Question not found.",
  optionOutOfRange: "Selected option is out of range.",
  duplicateAnswer: "This question was already answered.",
  invalidCompletionPayload: "Invalid completion payload.",
  incompleteAssessment:
    "All questions must be answered before completing the assessment.",
  sessionNotFound: "Session not found.",
  sessionAlreadyComplete: "This assessment is already complete.",
  invalidSurveyPayload: "Invalid survey response.",
  surveyBeforeComplete: "You can rate the assessment after completing it.",
  unexpectedError: "An unexpected error occurred.",
} as const;
