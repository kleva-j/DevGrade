import { z } from "zod";

import {
  ASSESSMENT_LENGTHS,
  DEFAULT_ASSESSMENT_LENGTH,
  DIFFICULTIES,
  FRAMEWORKS,
} from "@/domain/constants";

/** Shared by the service and the wire validator; old clients default to Quick. */
export const createSessionSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  targetLevel: z.enum(DIFFICULTIES),
  questionCount: z
    .literal(ASSESSMENT_LENGTHS)
    .default(DEFAULT_ASSESSMENT_LENGTH),
});

export const createSessionInput = createSessionSchema.extend({
  // Anonymous browser id; only its hash is stored (decision #6).
  rawClientId: z.string().min(1),
});
