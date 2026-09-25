import { z } from "zod";

import type { AssessmentConfiguration, Question } from "./types";

import {
  QUESTION_SNAPSHOT_VERSION,
  REPORT_SNAPSHOT_VERSION,
  SNAPSHOT_ERROR_CODE,
  PROFICIENCY_LEVELS,
  ASSESSMENT_LENGTHS,
  SKILL_CATEGORIES,
  SCORING_VERSION,
  DIFFICULTIES,
  FRAMEWORKS,
} from "./constants";
import { scoreAssessmentV1 } from "./scoring";
import { toPublicQuestion } from "./types";

type SnapshotErrorCode =
  (typeof SNAPSHOT_ERROR_CODE)[keyof typeof SNAPSHOT_ERROR_CODE];

/** Internal failure only; services translate this without exposing stored data. */
export class SnapshotError extends Error {
  constructor(readonly code: SnapshotErrorCode) {
    super(code);
    this.name = "SnapshotError";
  }
}

const publicQuestionSchema = z.object({
  id: z.string().min(1),
  skillCategory: z.enum(SKILL_CATEGORIES),
  title: z.string(),
  prompt: z.string(),
  codeBlock: z.string().nullable(),
  options: z.array(z.string()).min(2),
});

const snapshotQuestionSchema = publicQuestionSchema
  .extend({
    framework: z.enum(FRAMEWORKS),
    difficulty: z.enum(DIFFICULTIES),
    correctAnswer: z.number().int().nonnegative(),
    explanation: z.string(),
    difficultyWeight: z.number().positive(),
    // Sources are extensible strings in the bank, not a closed enum.
    source: z.string().min(1),
  })
  .refine((q) => q.correctAnswer < q.options.length);

const pillarSchema = z.object({
  skillCategory: z.enum(SKILL_CATEGORIES),
  displayName: z.string().min(1),
  description: z.string().nullable(),
  order: z.number().int(),
});

/** Required provenance without widening the existing Question consumer type. */
export interface SnapshotQuestion extends Question {
  source: string;
}

/** Saved assessment guidance/labels; never look these up again for a report. */
export type SnapshotPillar = z.infer<typeof pillarSchema>;

const questionSnapshotV1Schema = z.object({
  version: z.literal(QUESTION_SNAPSHOT_VERSION),
  scoringVersion: z.literal(SCORING_VERSION.V1),
  questions: z.array(snapshotQuestionSchema),
  pillars: z.array(pillarSchema),
});

/** PRIVATE server storage. Never use this as a response payload. */
export type QuestionSnapshotV1 = z.infer<typeof questionSnapshotV1Schema>;
export type QuestionSnapshot = QuestionSnapshotV1;

const categoryScoreSchema = z.object({
  skillCategory: z.enum(SKILL_CATEGORIES),
  correctWeight: z.number().nonnegative(),
  totalWeight: z.number().nonnegative(),
  scorePct: z.number().min(0).max(100),
  proficiency: z.enum(PROFICIENCY_LEVELS),
});

const assessmentResultSchema = z.object({
  sessionId: z.string().min(1),
  framework: z.enum(FRAMEWORKS),
  targetLevel: z.enum(DIFFICULTIES),
  totalScore: z.number().min(0).max(100),
  maxScore: z.literal(100),
  proficiencyLevel: z.enum(PROFICIENCY_LEVELS),
  categoryScores: z.array(categoryScoreSchema),
  skillGaps: z.array(z.enum(SKILL_CATEGORIES)),
  questionResults: z.array(
    z.object({
      questionId: z.string().min(1),
      isCorrect: z.boolean(),
      explanation: z.string(),
    }),
  ),
});

const reportSnapshotV1Schema = z.object({
  version: z.literal(REPORT_SNAPSHOT_VERSION),
  scoringVersion: z.literal(SCORING_VERSION.V1),
  completedAt: z.iso.datetime(),
  result: assessmentResultSchema,
  questions: z.array(publicQuestionSchema),
  pillars: z.array(pillarSchema),
});

/** Safe, self-contained awarded report. Survey state and credentials are separate. */
export type ReportSnapshotV1 = z.infer<typeof reportSnapshotV1Schema>;
export type ReportSnapshot = ReportSnapshotV1;

type SnapshotConfiguration = Pick<
  AssessmentConfiguration,
  "framework" | "targetLevel"
>;

function sameIds(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index])
  );
}

function validSelectedIds(ids: readonly string[]) {
  return (
    ASSESSMENT_LENGTHS.some((length) => length === ids.length) &&
    new Set(ids).size === ids.length
  );
}

function validPillars(
  questions: readonly { skillCategory: string }[],
  pillars: readonly SnapshotPillar[],
) {
  const categories = new Set(questions.map((q) => q.skillCategory));
  const names = pillars.map((pillar) => pillar.skillCategory);
  return (
    names.length === categories.size &&
    new Set(names).size === names.length &&
    names.every((name) => categories.has(name))
  );
}

/**
 * Validate persisted JSON, including its version and exact authoritative order.
 * Null is legacy/unrestorable, never a request to reconstruct from today's bank.
 */
export function parseQuestionSnapshot(
  value: unknown,
  selectedQuestionIds: readonly string[],
  configuration: SnapshotConfiguration,
): QuestionSnapshot {
  const parsed = questionSnapshotV1Schema.safeParse(value);
  if (
    !parsed.success ||
    !validSelectedIds(selectedQuestionIds) ||
    !sameIds(
      parsed.data.questions.map((q) => q.id),
      selectedQuestionIds,
    ) ||
    !validPillars(parsed.data.questions, parsed.data.pillars) ||
    !parsed.data.questions.every(
      (q) =>
        q.framework === configuration.framework &&
        q.difficulty === configuration.targetLevel,
    )
  ) {
    throw new SnapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS);
  }
  return parsed.data;
}

/** Copies only the contract's fields, detaching nested arrays from live objects. */
export function createQuestionSnapshot(
  selectedQuestionIds: readonly string[],
  questions: readonly SnapshotQuestion[],
  pillars: readonly SnapshotPillar[],
  configuration: SnapshotConfiguration,
): QuestionSnapshot {
  return parseQuestionSnapshot(
    {
      version: QUESTION_SNAPSHOT_VERSION,
      scoringVersion: SCORING_VERSION.V1,
      questions,
      pillars,
    },
    selectedQuestionIds,
    configuration,
  );
}

/** Read without rescoring or consulting the private snapshot/current bank. */
export function parseReportSnapshot(value: unknown): ReportSnapshot {
  const parsed = reportSnapshotV1Schema.safeParse(value);
  if (!parsed.success) {
    throw new SnapshotError(SNAPSHOT_ERROR_CODE.INVALID_REPORT);
  }
  const report = parsed.data;
  const ids = report.questions.map((q) => q.id);
  const categories = report.result.categoryScores.map((c) => c.skillCategory);
  if (
    !validSelectedIds(ids) ||
    !sameIds(
      report.result.questionResults.map((q) => q.questionId),
      ids,
    ) ||
    !validPillars(report.questions, report.pillars) ||
    new Set(categories).size !== categories.length ||
    categories.length !== report.pillars.length ||
    !report.pillars.every((pillar) =>
      categories.includes(pillar.skillCategory),
    ) ||
    !report.result.skillGaps.every((category) => categories.includes(category))
  ) {
    throw new SnapshotError(SNAPSHOT_ERROR_CODE.INVALID_REPORT);
  }
  // Zod's explicit allowlist strips unknown fields, even from nested objects.
  return report;
}

/**
 * Compute an award from saved grading inputs. The service persists normalized
 * columns and JSON from this single result; retrieval uses parseReportSnapshot.
 * Dispatch new scoring versions here rather than changing the v1 implementation.
 */
export function createReportSnapshot(
  input: SnapshotConfiguration & {
    sessionId: string;
    selectedQuestionIds: readonly string[];
    questionSnapshot: unknown;
    answers: readonly { questionId: string; selectedAnswer: number }[];
    completedAt: Date;
  },
): ReportSnapshot {
  const snapshot = parseQuestionSnapshot(
    input.questionSnapshot,
    input.selectedQuestionIds,
    input,
  );
  const answers = new Map(
    input.answers.map((answer) => [answer.questionId, answer]),
  );
  if (
    input.answers.length !== input.selectedQuestionIds.length ||
    answers.size !== input.answers.length ||
    !snapshot.questions.every((q) => {
      const answer = answers.get(q.id);
      return (
        answer !== undefined &&
        Number.isInteger(answer.selectedAnswer) &&
        answer.selectedAnswer >= 0 &&
        answer.selectedAnswer < q.options.length
      );
    })
  ) {
    throw new SnapshotError(SNAPSHOT_ERROR_CODE.INVALID_ANSWERS);
  }

  const result = scoreAssessmentV1(
    input.sessionId,
    input.framework,
    input.targetLevel,
    snapshot.questions.map((question) => ({
      question,
      selectedAnswer: answers.get(question.id)!.selectedAnswer,
    })),
  );
  return parseReportSnapshot({
    version: REPORT_SNAPSHOT_VERSION,
    scoringVersion: snapshot.scoringVersion,
    completedAt: input.completedAt.toISOString(),
    result,
    questions: snapshot.questions.map(toPublicQuestion),
    pillars: snapshot.pillars,
  });
}
