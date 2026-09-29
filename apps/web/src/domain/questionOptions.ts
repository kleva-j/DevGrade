import { z } from "zod";

import type { QuestionOption } from "./types";

import { QUESTION_OPTION_COUNT } from "./constants";

/** New bank content and V2 snapshots only; frozen V1 has its own legacy rules. */
export const questionOptionsSchema = z
  .array(
    z.object({
      id: z.number().int().nonnegative(),
      text: z.string().refine((text) => text.trim().length > 0),
    }),
  )
  .length(QUESTION_OPTION_COUNT)
  .refine(
    (options) => new Set(options.map(({ id }) => id)).size === options.length,
  );

const bankOptionsSchema = z.union([
  questionOptionsSchema,
  z
    .array(z.string())
    .transform((options) => options.map((text, id) => ({ id, text })))
    .pipe(questionOptionsSchema),
]);

/** Validate and detach bank options; legacy bank IDs come from authored indices. */
export function normalizeQuestionOptions(value: unknown): QuestionOption[] {
  return bankOptionsSchema.parse(value);
}
