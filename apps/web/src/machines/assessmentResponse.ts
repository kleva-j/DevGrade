import { z } from "zod";

import { SESSION_VIEW } from "@/domain/constants";
import { optionIdSchema } from "@/domain/questionOptions";

const answer = z
  .object({
    questionId: z.string().min(1),
    selectedOptionId: optionIdSchema,
    selectedAnswer: z.never().optional(),
  })
  .refine((value) => !Object.hasOwn(value, "selectedAnswer"));
const answers = z
  .array(answer)
  .refine(
    (values) =>
      new Set(values.map(({ questionId }) => questionId)).size ===
      values.length,
  );
// Frozen V1 content allows 2+ choices and blank text. This checks only the
// option-ID contract, not metadata, progress, timing or scoring/report rules.
const question = z.object({
  id: z.string().min(1),
  options: z
    .array(z.object({ id: optionIdSchema, text: z.string() }))
    .min(2)
    .refine(
      (options) => new Set(options.map(({ id }) => id)).size === options.length,
    ),
});
export const assessmentResponseSchema = z
  .object({
    kind: z.literal(SESSION_VIEW.ASSESSMENT),
    questions: z.array(question).min(1),
    acceptedAnswers: answers,
  })
  .refine(
    (view) =>
      new Set(view.questions.map(({ id }) => id)).size ===
        view.questions.length &&
      view.acceptedAnswers.every((accepted) =>
        view.questions.some(
          (q) =>
            q.id === accepted.questionId &&
            q.options.some(({ id }) => id === accepted.selectedOptionId),
        ),
      ),
  );

// Non-assessment views have no option-ID payload; their existing models pass through.
export const sessionResponseSchema = z.union([
  assessmentResponseSchema,
  z.object({
    kind: z.enum([
      SESSION_VIEW.REPORT,
      SESSION_VIEW.LEGACY_SUMMARY,
      SESSION_VIEW.ATTEMPT_EXPIRED,
      SESSION_VIEW.LEGACY_UNRESTORABLE,
    ]),
  }),
]);
export const acceptedAnswerResponseSchema = z
  .object({
    acceptedAnswer: answer,
    acceptedAnswers: answers,
  })
  .refine((result) =>
    result.acceptedAnswers.some(
      (accepted) =>
        accepted.questionId === result.acceptedAnswer.questionId &&
        accepted.selectedOptionId === result.acceptedAnswer.selectedOptionId,
    ),
  );
