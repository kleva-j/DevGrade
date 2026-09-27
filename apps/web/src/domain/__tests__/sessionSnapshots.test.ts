import assert from "node:assert/strict";
import { test } from "node:test";

import type { SnapshotQuestion } from "@/domain/sessionSnapshots";

import {
  ASSESSMENT_LENGTHS,
  CONTENT_SOURCE,
  DIFFICULTY,
  FRAMEWORK,
  PROFICIENCY,
  SCORING_VERSION,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_META,
  SNAPSHOT_ERROR_CODE,
} from "@/domain/constants";
import {
  createQuestionSnapshot,
  createReportSnapshot,
  parseQuestionSnapshot,
  parseReportSnapshot,
  SnapshotError,
} from "@/domain/sessionSnapshots";
import { toPublicQuestion } from "@/domain/types";

const configuration = {
  framework: FRAMEWORK.REACT,
  targetLevel: DIFFICULTY.MID,
};
const completedAt = new Date("2026-09-25T12:00:00Z");

function fixture(count = 8) {
  const questions: SnapshotQuestion[] = Array.from(
    { length: count },
    (_, i) => ({
      id: `question-${count - i}`,
      framework: configuration.framework,
      difficulty: configuration.targetLevel,
      skillCategory: SKILL_CATEGORIES[i % 4]!,
      title: `Title ${i}`,
      prompt: `Prompt ${i}`,
      codeBlock: i % 2 ? null : "const value = 1;",
      options: ["First", "Second", "Third"],
      correctAnswer: i % 3,
      explanation: `Explanation ${i}`,
      difficultyWeight: i % 2 ? 2 : 1,
      source: CONTENT_SOURCE.SUDHEERJ_REACT,
    }),
  );
  const pillars = SKILL_CATEGORIES.map((skillCategory) => ({
    skillCategory,
    ...SKILL_CATEGORY_META[skillCategory],
  }));
  const ids = questions.map((q) => q.id);
  const snapshot = createQuestionSnapshot(
    ids,
    questions,
    pillars,
    configuration,
  );
  const answers = questions.map((q, i) => ({
    questionId: q.id,
    selectedAnswer:
      i < count / 2
        ? q.correctAnswer
        : (q.correctAnswer + 1) % q.options.length,
  }));
  return { questions, pillars, ids, snapshot, answers };
}

function reportFrom(f = fixture()) {
  return createReportSnapshot({
    ...configuration,
    sessionId: "session-1",
    selectedQuestionIds: f.ids,
    questionSnapshot: f.snapshot,
    answers: [...f.answers].reverse(),
    completedAt,
  });
}

function snapshotError(code: SnapshotError["code"]) {
  return (error: unknown) => {
    assert.ok(error instanceof SnapshotError);
    assert.equal(error.code, code);
    return true;
  };
}

for (const count of ASSESSMENT_LENGTHS) {
  test(`${count}: grading and report presentation follow selected order, not answer order`, () => {
    const f = fixture(count);
    const report = reportFrom(f);
    assert.equal(f.snapshot.version, 1);
    assert.equal(f.snapshot.scoringVersion, SCORING_VERSION.V1);
    assert.equal(report.version, 1);
    assert.equal(report.scoringVersion, SCORING_VERSION.V1);
    assert.equal(report.completedAt, completedAt.toISOString());
    assert.equal(report.result.totalScore, 50);
    assert.equal(report.result.proficiencyLevel, PROFICIENCY.DEVELOPING);
    assert.deepEqual(report.questions, f.questions.map(toPublicQuestion));
    assert.deepEqual(
      report.result.questionResults.map((q) => q.questionId),
      f.ids,
    );
    assert.deepEqual(
      report.result.questionResults,
      f.questions.map((q, i) => ({
        questionId: q.id,
        isCorrect: i < count / 2,
        explanation: q.explanation,
      })),
    );
    assert.deepEqual(report.pillars, f.pillars);
    assert.deepEqual(
      parseReportSnapshot(JSON.parse(JSON.stringify(report))),
      report,
    );
    assert.deepEqual(
      parseQuestionSnapshot(
        JSON.parse(JSON.stringify(f.snapshot)),
        f.ids,
        configuration,
      ),
      f.snapshot,
    );
  });
}

test("private content and awarded report are detached from bank edits and each other", () => {
  const f = fixture();
  const saved = structuredClone(f.snapshot);
  const report = reportFrom(f);
  const awarded = structuredClone(report);
  for (const q of f.questions) {
    q.correctAnswer = (q.correctAnswer + 1) % q.options.length;
    q.options[0] = "edited option";
    q.title = "edited title";
    q.explanation = "edited explanation";
    q.source = CONTENT_SOURCE.ORIGINAL;
    q.difficultyWeight = 10;
  }
  f.pillars[0]!.displayName = "edited pillar";
  f.pillars[0]!.description = "edited guidance";
  assert.deepEqual(f.snapshot, saved);
  assert.deepEqual(reportFrom(f), awarded);
  f.snapshot.questions[0]!.options[0] = "mutated private data";
  f.snapshot.pillars[0]!.displayName = "mutated private metadata";
  assert.deepEqual(report, awarded);
});

test("public creation projection contains no private data and shares no option arrays", () => {
  const f = fixture();
  const questions = f.snapshot.questions.map(toPublicQuestion);
  assert.doesNotMatch(
    JSON.stringify(questions),
    /"(?:correctAnswer|explanation|difficultyWeight|source|scoringVersion)"\s*:/,
  );
  questions[0]!.options[0] = "client edit";
  assert.equal(f.snapshot.questions[0]!.options[0], "First");
});

test("report allowlist removes credentials, private snapshots/keys and mutable survey state recursively", () => {
  const report = reportFrom();
  const parsed = parseReportSnapshot({
    ...report,
    sessionToken: "secret",
    clientId: "secret-client",
    questionSnapshot: fixture().snapshot,
    surveyRating: 5,
    result: {
      ...report.result,
      sessionToken: "secret",
      questionResults: report.result.questionResults.map((q) => ({
        ...q,
        correctAnswer: 2,
      })),
    },
    questions: report.questions.map((q) => ({
      ...q,
      correctAnswer: 2,
      explanation: "private",
      difficultyWeight: 2,
      source: "private",
    })),
    pillars: report.pillars.map((p) => ({ ...p, sessionToken: "secret" })),
  });
  assert.deepEqual(parsed, report);
  assert.doesNotMatch(
    JSON.stringify(parsed),
    /"(?:sessionToken|clientId|correctAnswer|questionSnapshot|surveyRating|difficultyWeight|source)"\s*:/,
  );
  assert.ok(
    parsed.result.questionResults.every((q) => q.explanation.length > 0),
    "awarded explanations intentionally remain in the completed result",
  );
});

test("missing, malformed and future-version private snapshots fail closed", () => {
  const f = fixture();
  const invalid = [
    null,
    undefined,
    {},
    { ...f.snapshot, version: 2 },
    { ...f.snapshot, scoringVersion: "weighted-v2" },
    { ...f.snapshot, questions: [...f.snapshot.questions].reverse() },
    { ...f.snapshot, questions: f.snapshot.questions.slice(1) },
    {
      ...f.snapshot,
      questions: f.snapshot.questions.map((q) => ({ ...q, source: undefined })),
    },
    {
      ...f.snapshot,
      questions: f.snapshot.questions.map((q) => ({
        ...q,
        correctAnswer: q.options.length,
      })),
    },
    {
      ...f.snapshot,
      questions: f.snapshot.questions.map((q) => ({
        ...q,
        difficultyWeight: NaN,
      })),
    },
    {
      ...f.snapshot,
      questions: f.snapshot.questions.map((q) => ({
        ...q,
        difficulty: DIFFICULTY.SENIOR,
      })),
    },
    { ...f.snapshot, pillars: [] },
    {
      ...f.snapshot,
      pillars: f.snapshot.pillars.map(() => f.snapshot.pillars[0]),
    },
  ];
  for (const value of invalid) {
    assert.throws(
      () => parseQuestionSnapshot(value, f.ids, configuration),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    );
  }
  for (const ids of [
    [...f.ids].reverse(),
    f.ids.slice(1),
    f.ids.map(() => f.ids[0]!),
  ]) {
    assert.throws(
      () => parseQuestionSnapshot(f.snapshot, ids, configuration),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    );
  }
});

test("completion requires the exact answer-ID set and valid saved option indices", () => {
  const f = fixture();
  for (const answers of [
    f.answers.slice(1),
    [...f.answers, f.answers[0]!],
    f.answers.map(() => f.answers[0]!),
    f.answers.map((a, i) => (i ? a : { ...a, questionId: "foreign-question" })),
    ...[-1, 0.5, 3, NaN].map((selectedAnswer) =>
      f.answers.map((a) => ({ ...a, selectedAnswer })),
    ),
  ]) {
    assert.throws(
      () => reportFrom({ ...f, answers }),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_ANSWERS),
    );
  }
});

test("report readers validate version, content order, completion time and pillar identity", () => {
  const report = reportFrom();
  for (const value of [
    null,
    {},
    { ...report, version: 2 },
    { ...report, scoringVersion: "weighted-v2" },
    { ...report, completedAt: "not-a-date" },
    { ...report, questions: [...report.questions].reverse() },
    { ...report, pillars: [] },
    { ...report, result: { ...report.result, categoryScores: [] } },
  ]) {
    assert.throws(
      () => parseReportSnapshot(value),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_REPORT),
    );
  }
  // Parsing an already awarded result never calls a scorer to reinterpret it.
  assert.equal(
    parseReportSnapshot({
      ...report,
      result: { ...report.result, totalScore: 42 },
    }).result.totalScore,
    42,
  );
});
