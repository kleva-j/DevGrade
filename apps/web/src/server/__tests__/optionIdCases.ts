import { randomUUID } from "node:crypto";

import type { QuestionRow, TestSessionRow } from "@/db/schema";
import type { QuestionSnapshotV2 } from "@/domain/sessionSnapshots";

import {
  CONTENT_SOURCE,
  DIFFICULTY,
  FRAMEWORK,
  QUESTION_SNAPSHOT_FORMAT,
  SCORING_VERSION,
  SESSION_STATUS,
  SKILL_CATEGORIES,
  WEIGHT_ADVANCED,
  WEIGHT_CORE,
} from "@/domain/constants";
import { createQuestionSnapshot } from "@/domain/sessionSnapshots";
import { rowToQuestion } from "../assessmentService";

export const configuration = {
  framework: FRAMEWORK.REACT,
  targetLevel: DIFFICULTY.MID,
};
export const optionIds = [42, 7, 100, 9];
export const bankOptions = optionIds.map((id) => ({
  id,
  text: `Option ${id}`,
}));
export function bankRows(): QuestionRow[] {
  return SKILL_CATEGORIES.flatMap((skillCategory) =>
    [WEIGHT_CORE, WEIGHT_ADVANCED].map((difficultyWeight) => ({
      id: `${skillCategory}-${difficultyWeight}`,
      framework: configuration.framework,
      difficulty: configuration.targetLevel,
      skillCategory,
      title: "Saved title",
      prompt: "Saved prompt",
      codeBlock: null,
      options: bankOptions.map((option) => option.text),
      correctAnswer: 2,
      explanation: "Private explanation",
      difficultyWeight,
      source: CONTENT_SOURCE.ORIGINAL,
      isActive: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })),
  );
}
export const pillars = SKILL_CATEGORIES.map((skillCategory, order) => ({
  skillCategory,
  displayName: skillCategory,
  description: null,
  order,
}));
export function snapshotV2(): QuestionSnapshotV2 {
  return {
    version: QUESTION_SNAPSHOT_FORMAT.V2,
    scoringVersion: SCORING_VERSION.V1,
    questions: bankRows().map((row) => ({
      ...rowToQuestion({ ...row, options: bankOptions, correctAnswer: 100 }),
      source: row.source,
    })),
    pillars,
  };
}
export function snapshotV1() {
  const snapshot = snapshotV2();
  return createQuestionSnapshot(
    snapshot.questions.map((q) => q.id),
    snapshot.questions,
    snapshot.pillars,
    configuration,
  );
}
export function sessionRow(
  questionSnapshot: TestSessionRow["questionSnapshot"] = snapshotV2(),
): TestSessionRow {
  const createdAt = new Date();
  return {
    id: randomUUID(),
    sessionToken: "a".repeat(64),
    clientId: "hashed-client",
    ...configuration,
    status: SESSION_STATUS.ABANDONED,
    selectedQuestionIds: bankRows().map((q) => q.id),
    questionSnapshot,
    focusLossCount: 0,
    startedAt: createdAt,
    completedAt: null,
    lastActivityAt: createdAt,
    createdAt,
  };
}
