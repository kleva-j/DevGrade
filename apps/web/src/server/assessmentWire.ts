import type {
  AcceptedAnswerResult,
  AssessmentView,
  CreatedSession,
  SessionView,
} from "@/domain/sessionContracts";
import type { AnswerInput, PublicQuestion } from "@/domain/types";

import { ASSESSMENT_CONTRACT, SESSION_VIEW } from "@/domain/constants";

export type OptionIdsResponse<T> = T & {
  assessmentContract: typeof ASSESSMENT_CONTRACT.OPTION_IDS;
};
type LegacyResponse<T> = T & { assessmentContract?: never };
export type LegacyAnswerInput = Omit<AnswerInput, "selectedOptionId"> & {
  selectedAnswer: number;
};
export type LegacyPublicQuestion = Omit<PublicQuestion, "options"> & {
  options: string[];
};
export type LegacyAssessmentView = Omit<
  AssessmentView,
  "questions" | "acceptedAnswers"
> & {
  questions: LegacyPublicQuestion[];
  acceptedAnswers: LegacyAnswerInput[];
};
export type LegacyCreatedSession = LegacyAssessmentView &
  Pick<CreatedSession, "sessionToken">;
export type LegacySessionView =
  | LegacyAssessmentView
  | Exclude<SessionView, AssessmentView>;
export type LegacyAcceptedAnswerResult = Omit<
  AcceptedAnswerResult,
  "acceptedAnswer" | "acceptedAnswers"
> & {
  acceptedAnswer: LegacyAnswerInput;
  acceptedAnswers: LegacyAnswerInput[];
};
export type WireCreatedSession =
  | OptionIdsResponse<CreatedSession>
  | LegacyResponse<LegacyCreatedSession>;
export type WireSessionView =
  | OptionIdsResponse<SessionView>
  | LegacyResponse<LegacySessionView>;
export type WireAcceptedAnswerResult =
  | OptionIdsResponse<AcceptedAnswerResult>
  | LegacyResponse<LegacyAcceptedAnswerResult>;

function optionIdsResponse<T>(value: T): OptionIdsResponse<T> {
  return { ...value, assessmentContract: ASSESSMENT_CONTRACT.OPTION_IDS };
}
function legacyAnswer({
  selectedOptionId,
  ...answer
}: AnswerInput): LegacyAnswerInput {
  return { ...answer, selectedAnswer: selectedOptionId };
}
function legacyAssessment(view: AssessmentView): LegacyAssessmentView {
  return {
    ...view,
    questions: view.questions.map(({ options, ...question }) => ({
      ...question,
      options: options.map((option) => option.text),
    })),
    acceptedAnswers: view.acceptedAnswers.map(legacyAnswer),
  };
}

// Services must enforce V1 before these positional projections are used.
export function createdSessionResponse(
  view: CreatedSession,
  legacyClient: boolean,
): WireCreatedSession {
  return legacyClient
    ? { ...legacyAssessment(view), sessionToken: view.sessionToken }
    : optionIdsResponse(view);
}
export function sessionResponse(
  view: SessionView,
  legacyClient: boolean,
): WireSessionView {
  if (!legacyClient) return optionIdsResponse(view);
  return view.kind === SESSION_VIEW.ASSESSMENT ? legacyAssessment(view) : view;
}
export function acceptedAnswerResponse(
  result: AcceptedAnswerResult,
  legacyClient: boolean,
): WireAcceptedAnswerResult {
  return legacyClient
    ? {
        ...result,
        acceptedAnswer: legacyAnswer(result.acceptedAnswer),
        acceptedAnswers: result.acceptedAnswers.map(legacyAnswer),
      }
    : optionIdsResponse(result);
}
