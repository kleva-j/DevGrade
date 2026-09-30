import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  QuestionSnapshot,
  QuestionSnapshotV1,
  QuestionSnapshotV2,
  SnapshotQuestion,
} from "@/domain/sessionSnapshots";
import type { AnswerInput } from "@/domain/types";

import {
  ASSESSMENT_LENGTHS,
  CONTENT_SOURCE,
  DIFFICULTY,
  FRAMEWORK,
  PROFICIENCY,
  QUESTION_SNAPSHOT_FORMAT,
  SCORING_VERSION,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_META,
  SNAPSHOT_ERROR_CODE,
} from "@/domain/constants";
import {
  buildReport,
  createQuestionSnapshot,
  createReportSnapshot,
  parseQuestionSnapshot,
  parseReportSnapshot,
  SnapshotError,
} from "@/domain/sessionSnapshots";
import { toPublicQuestion, toReportQuestion } from "@/domain/types";

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
      options: [
        { id: 30, text: "First" },
        { id: 7, text: "Second" },
        { id: 90, text: "Third" },
        { id: 0, text: "Fourth" },
      ],
      correctOptionId: [30, 7, 90, 0][i % 4]!,
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
  const answers = snapshot.questions.map((q, i) => ({
    questionId: q.id,
    timeSpentSeconds: 5,
    selectedOptionId:
      i < count / 2
        ? q.correctOptionId
        : q.options.find(({ id }) => id !== q.correctOptionId)!.id,
  }));
  return { questions, pillars, ids, snapshot, answers };
}

function v2Fixture() {
  const f = fixture();
  const questions = f.questions.map((q, i) => ({
    ...q,
    options: [q.options[2]!, q.options[0]!, q.options[3]!, q.options[1]!].map(
      ({ id, text }) => ({ id: id + i * 100, text }),
    ),
    correctOptionId: q.correctOptionId + i * 100,
  }));
  const snapshot: QuestionSnapshotV2 = {
    version: QUESTION_SNAPSHOT_FORMAT.V2,
    scoringVersion: SCORING_VERSION.V1,
    questions,
    pillars: f.pillars,
  };
  const answers = questions.map((q, i) => ({
    questionId: q.id,
    selectedOptionId:
      i < questions.length / 2
        ? q.correctOptionId
        : q.options.find(({ id }) => id !== q.correctOptionId)!.id,
    timeSpentSeconds: 5,
  }));
  return { ...f, questions, snapshot, answers };
}

function reportFrom(
  f: {
    ids: string[];
    snapshot: QuestionSnapshot;
    answers: AnswerInput[];
  } = fixture(),
) {
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
    assert.equal(f.snapshot.version, QUESTION_SNAPSHOT_FORMAT.V2);
    assert.equal(f.snapshot.scoringVersion, SCORING_VERSION.V1);
    assert.equal(report.version, 1);
    assert.equal(report.scoringVersion, SCORING_VERSION.V1);
    assert.equal(report.completedAt, completedAt.toISOString());
    assert.equal(report.result.totalScore, 50);
    assert.equal(report.result.proficiencyLevel, PROFICIENCY.DEVELOPING);
    assert.deepEqual(report.questions, f.questions.map(toReportQuestion));
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
    q.correctOptionId = 999;
    q.options[0]!.text = "edited option";
    q.options[0]!.id = 999;
    q.title = "edited title";
    q.explanation = "edited explanation";
    q.source = CONTENT_SOURCE.ORIGINAL;
    q.difficultyWeight = 10;
  }
  f.pillars[0]!.displayName = "edited pillar";
  f.pillars[0]!.description = "edited guidance";
  assert.deepEqual(f.snapshot, saved);
  assert.deepEqual(reportFrom(f), awarded);
  f.snapshot.questions[0]!.options[0]!.text = "mutated private data";
  f.snapshot.pillars[0]!.displayName = "mutated private metadata";
  assert.deepEqual(report, awarded);
});

test("public creation projection contains neither private key and deeply detaches options", () => {
  const f = fixture();
  const privateQuestions = f.questions.map((q) => ({
    ...q,
    correctAnswer: 0,
    options: q.options.map((option) => ({ ...option, explanation: "private" })),
  }));
  const questions = privateQuestions.map(toPublicQuestion);
  assert.doesNotMatch(
    JSON.stringify(questions),
    /"(?:correctAnswer|correctOptionId|explanation|difficultyWeight|source|scoringVersion)"\s*:/,
  );
  assert.deepEqual(questions[0]!.options, f.questions[0]!.options);
  questions[0]!.options[0]!.text = "client edit";
  questions[0]!.options[0]!.id = 999;
  questions[0]!.options.reverse();
  assert.equal(privateQuestions[0]!.options[0]!.text, "First");
  assert.equal(privateQuestions[0]!.options[0]!.id, 30);
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
        correctOptionId: 90,
      })),
    },
    questions: report.questions.map((q) => ({
      ...q,
      correctAnswer: 2,
      correctOptionId: 90,
      explanation: "private",
      difficultyWeight: 2,
      source: "private",
    })),
    pillars: report.pillars.map((p) => ({ ...p, sessionToken: "secret" })),
  });
  assert.deepEqual(parsed, report);
  assert.doesNotMatch(
    JSON.stringify(parsed),
    /"(?:sessionToken|clientId|correctAnswer|correctOptionId|questionSnapshot|surveyRating|difficultyWeight|source)"\s*:/,
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
    { ...f.snapshot, version: 1 }, // V2 content cannot be relabeled as V1.
    { ...f.snapshot, version: 3 },
    { ...f.snapshot, version: "1" },
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
        correctOptionId: 1, // An array index is not necessarily a saved ID.
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

test("completion requires the exact answer-ID set and valid saved option IDs", () => {
  const f = fixture();
  for (const answers of [
    f.answers.slice(1),
    [...f.answers, f.answers[0]!],
    f.answers.map(() => f.answers[0]!),
    f.answers.map((a, i) => (i ? a : { ...a, questionId: "foreign-question" })),
    ...[-1, 0.5, 1, 4, 999, NaN].map((selectedOptionId) =>
      f.answers.map((a) => ({ ...a, selectedOptionId })),
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

test("frozen V1 uses saved indices, accepts historical options, and awards the unchanged V1 report", () => {
  // Deliberately independent of the current writer/bank and its four-option rules.
  const snapshot: QuestionSnapshotV1 = {
    version: 1,
    scoringVersion: SCORING_VERSION.V1,
    questions: Array.from({ length: 8 }, (_, i) => ({
      id: `saved-${i}`,
      framework: FRAMEWORK.REACT,
      difficulty: DIFFICULTY.MID,
      skillCategory: SKILL_CATEGORIES[i % 4]!,
      title: `Saved title ${i}`,
      prompt: "Saved prompt",
      codeBlock: null,
      options: ["Third in today's bank", "", "  "],
      correctAnswer: i % 3,
      explanation: `Saved explanation ${i}`,
      difficultyWeight: i % 2 ? 2 : 1,
      source: "historical-source",
    })),
    pillars: SKILL_CATEGORIES.map((skillCategory) => ({
      skillCategory,
      ...SKILL_CATEGORY_META[skillCategory],
    })),
  };
  const before = structuredClone(snapshot);
  const ids = snapshot.questions.map((q) => q.id);
  const answers = snapshot.questions.map((q, i) => ({
    questionId: q.id,
    selectedOptionId: i < 4 ? q.correctAnswer : (q.correctAnswer + 1) % 3,
    timeSpentSeconds: 5,
  }));
  const parsed = parseQuestionSnapshot(snapshot, ids, configuration);
  assert.equal(parsed.version, 1);
  assert.deepEqual(
    parsed.questions,
    snapshot.questions.map(({ options, correctAnswer, ...q }) => ({
      ...q,
      options: options.map((text, id) => ({ id, text })),
      correctOptionId: correctAnswer,
    })),
  );
  const expected = {
    version: 1,
    scoringVersion: SCORING_VERSION.V1,
    completedAt: completedAt.toISOString(),
    result: {
      sessionId: "session-1",
      framework: FRAMEWORK.REACT,
      targetLevel: DIFFICULTY.MID,
      totalScore: 50,
      maxScore: 100,
      proficiencyLevel: PROFICIENCY.DEVELOPING,
      categoryScores: SKILL_CATEGORIES.map((skillCategory, i) => ({
        skillCategory,
        correctWeight: i % 2 ? 2 : 1,
        totalWeight: i % 2 ? 4 : 2,
        scorePct: 50,
        proficiency: PROFICIENCY.DEVELOPING,
      })),
      skillGaps: [],
      questionResults: ids.map((questionId, i) => ({
        questionId,
        isCorrect: i < 4,
        explanation: `Saved explanation ${i}`,
      })),
    },
    questions: ids.map((id, i) => ({
      id,
      skillCategory: SKILL_CATEGORIES[i % 4]!,
      title: `Saved title ${i}`,
      prompt: "Saved prompt",
      codeBlock: null,
      options: ["Third in today's bank", "", "  "],
    })),
    pillars: snapshot.pillars,
  };
  assert.deepEqual(reportFrom({ snapshot, ids, answers }), expected);
  assert.deepEqual(parseReportSnapshot(expected), expected);
  for (const invalid of [
    { ...snapshot, version: 2 },
    { ...snapshot, questions: [...snapshot.questions].reverse() },
    ...[-1, 0.5, 3].map((correctAnswer) => ({
      ...snapshot,
      questions: snapshot.questions.map((q) => ({ ...q, correctAnswer })),
    })),
    {
      ...snapshot,
      questions: snapshot.questions.map((q) => ({ ...q, options: [""] })),
    },
  ]) {
    assert.throws(
      () => parseQuestionSnapshot(invalid, ids, configuration),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    );
  }
  assert.deepEqual(snapshot, before);
  parsed.questions[0]!.options[0]!.text = "runtime edit";
  parsed.pillars[0]!.displayName = "runtime edit";
  assert.deepEqual(snapshot, before);

  assert.throws(
    () =>
      createReportSnapshot({
        ...configuration,
        sessionId: "session-1",
        selectedQuestionIds: ids,
        questionSnapshot: parsed,
        answers,
        completedAt,
      }),
    snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    "normalized V1 must not be mistaken for raw persisted V1",
  );
});

test("Stage 2 writer preserves supplied question/option order and stable IDs in detached V2 storage", () => {
  const f = v2Fixture();
  const before = structuredClone(f);
  const snapshot: QuestionSnapshotV2 = createQuestionSnapshot(
    f.ids,
    f.questions,
    f.pillars,
    configuration,
  );
  assert.equal(snapshot.version, QUESTION_SNAPSHOT_FORMAT.V2);
  assert.equal(snapshot.scoringVersion, SCORING_VERSION.V1);
  assert.deepEqual(snapshot, f.snapshot);
  assert.deepEqual(f, before);
  assert.notEqual(snapshot.questions, f.questions);
  assert.notEqual(snapshot.pillars, f.pillars);
  for (const [i, saved] of snapshot.questions.entries()) {
    const supplied = f.questions[i]!;
    assert.notEqual(saved, supplied);
    assert.notEqual(saved.options, supplied.options);
    for (const [index, option] of saved.options.entries()) {
      assert.notEqual(option, supplied.options[index]);
    }
    assert.equal(saved.correctOptionId, supplied.correctOptionId);
    assert.equal(
      saved.options.find(({ id }) => id === saved.correctOptionId)!.text,
      supplied.options.find(({ id }) => id === supplied.correctOptionId)!.text,
    );
    assert.equal("correctAnswer" in saved, false);
  }
  for (const [i, pillar] of snapshot.pillars.entries()) {
    assert.notEqual(pillar, f.pillars[i]);
  }
  assert.deepEqual(
    snapshot.questions.map(({ id }) => id),
    f.ids,
  );
  assert.deepEqual(
    snapshot.questions[0]!.options.map(({ id }) => id),
    [90, 30, 0, 7],
  );
  assert.equal(snapshot.questions[0]!.correctOptionId, 30);
  assert.deepEqual(
    parseQuestionSnapshot(
      JSON.parse(JSON.stringify(snapshot)),
      f.ids,
      configuration,
    ),
    snapshot,
  );
  assert.deepEqual(reportFrom({ ...f, snapshot }), reportFrom(f));

  snapshot.questions[0]!.options[1]!.text = "snapshot edit";
  snapshot.questions[0]!.options[1]!.id = 999;
  snapshot.questions[0]!.options.reverse();
  snapshot.questions[0]!.correctOptionId = 999;
  snapshot.questions.reverse();
  snapshot.pillars[0]!.displayName = "snapshot edit";
  snapshot.pillars.reverse();
  assert.deepEqual(f, before);
});

test("V2 writer strips unknown fields and legacy positional keys recursively", () => {
  const f = v2Fixture();
  const snapshot = createQuestionSnapshot(
    f.ids,
    f.questions.map((q) => ({
      ...q,
      correctAnswer: 1,
      sessionToken: "not snapshot content",
      options: q.options.map((option) => ({ ...option, isCorrect: true })),
    })),
    f.pillars.map((pillar) => ({ ...pillar, sessionToken: "not metadata" })),
    configuration,
  );
  assert.deepEqual(snapshot, f.snapshot);
});

test("V2 writer rejects invalid selections, configuration, content and pillars", () => {
  const f = v2Fixture();
  const before = structuredClone(f);
  const input = { ...f, configuration };
  for (const invalid of [
    { ...input, ids: [...f.ids].reverse() },
    { ...input, questions: [...f.questions].reverse() },
    { ...input, questions: f.questions.slice(1) },
    { ...input, ids: f.ids.slice(1), questions: f.questions.slice(1) },
    {
      ...input,
      ids: f.ids.map(() => f.ids[0]!),
      questions: f.questions.map((q) => ({ ...q, id: f.ids[0]! })),
    },
    {
      ...input,
      configuration: { ...configuration, framework: FRAMEWORK.VUE },
    },
    {
      ...input,
      configuration: { ...configuration, targetLevel: DIFFICULTY.SENIOR },
    },
    {
      ...input,
      questions: f.questions.map((q) => ({ ...q, source: "" })),
    },
    {
      ...input,
      questions: f.questions.map((q) => ({ ...q, difficultyWeight: 0 })),
    },
    { ...input, pillars: [] },
    { ...input, pillars: f.pillars.map(() => f.pillars[0]!) },
    {
      ...input,
      pillars: f.pillars.map((pillar) => ({ ...pillar, displayName: "" })),
    },
  ]) {
    assert.throws(
      () =>
        createQuestionSnapshot(
          invalid.ids,
          invalid.questions,
          invalid.pillars,
          invalid.configuration,
        ),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    );
  }
  assert.deepEqual(f, before);
});

test("V2 reordered noncontiguous IDs grade identically to V1 with ordered string-only reports", () => {
  const f = v2Fixture();
  const parsed = parseQuestionSnapshot(f.snapshot, f.ids, configuration);
  assert.deepEqual(parsed, f.snapshot);
  assert.deepEqual(
    parsed.questions[0]!.options.map(({ id }) => id),
    [90, 30, 0, 7],
  );
  const report = reportFrom(f);
  assert.equal(report.version, 1);
  assert.equal(report.scoringVersion, SCORING_VERSION.V1);
  assert.equal(report.result.totalScore, 50);
  assert.deepEqual(report.questions, f.questions.map(toReportQuestion));
  assert.deepEqual(report.questions[0]!.options, [
    "Third",
    "First",
    "Fourth",
    "Second",
  ]);
  // Frozen positional storage, independent of the evolving writer/V2 fixture.
  const v1: QuestionSnapshotV1 = {
    version: 1,
    scoringVersion: SCORING_VERSION.V1,
    questions: Array.from({ length: 8 }, (_, i) => ({
      id: `question-${8 - i}`,
      framework: FRAMEWORK.REACT,
      difficulty: DIFFICULTY.MID,
      skillCategory: SKILL_CATEGORIES[i % 4]!,
      title: `Title ${i}`,
      prompt: `Prompt ${i}`,
      codeBlock: i % 2 ? null : "const value = 1;",
      options: ["Third", "First", "Fourth", "Second"],
      correctAnswer: [1, 3, 0, 2][i % 4]!,
      explanation: `Explanation ${i}`,
      difficultyWeight: i % 2 ? 2 : 1,
      source: CONTENT_SOURCE.SUDHEERJ_REACT,
    })),
    pillars: SKILL_CATEGORIES.map((skillCategory) => ({
      skillCategory,
      ...SKILL_CATEGORY_META[skillCategory],
    })),
  };
  const positionalAnswers = v1.questions.map((q, i) => ({
    questionId: q.id,
    selectedOptionId:
      i < 4
        ? q.correctAnswer
        : q.options.findIndex((_, index) => index !== q.correctAnswer),
    timeSpentSeconds: 5,
  }));
  assert.deepEqual(
    reportFrom({ ...f, snapshot: v1, answers: positionalAnswers }),
    report,
  );
  assert.equal(buildReport, createReportSnapshot);
  assert.deepEqual(parseReportSnapshot(report), report);
  assert.doesNotMatch(
    JSON.stringify(report),
    /"(?:correctAnswer|correctOptionId)"\s*:/,
  );
});

test("V2 reader and writer accept the PostgreSQL maximum ID for correct options and distractors", () => {
  for (const index of [0, 1, 2, 3]) {
    const f = v2Fixture();
    const question = f.questions[0]!;
    const option = question.options[index]!;
    if (option.id === question.correctOptionId) {
      question.correctOptionId = 2_147_483_647;
    }
    option.id = 2_147_483_647;
    f.answers[0]!.selectedOptionId = 2_147_483_647;

    const parsed = parseQuestionSnapshot(f.snapshot, f.ids, configuration);
    assert.deepEqual(parsed.questions[0], question);
    const snapshot = createQuestionSnapshot(
      f.ids,
      f.questions,
      f.pillars,
      configuration,
    );
    assert.deepEqual(snapshot.questions[0], question);
    assert.equal(
      reportFrom({ ...f, snapshot }).result.questionResults[0]!.isCorrect,
      index === 1,
    );
  }
});

test("V2 parsing and public projections detach option objects and strip both private key names", () => {
  const f = v2Fixture();
  const before = structuredClone(f.snapshot);
  const parsed = parseQuestionSnapshot(f.snapshot, f.ids, configuration);
  const publicQuestions = parsed.questions.map(toPublicQuestion);
  assert.doesNotMatch(
    JSON.stringify(publicQuestions),
    /"(?:correctAnswer|correctOptionId|explanation|source|difficultyWeight)"\s*:/,
  );
  assert.deepEqual(publicQuestions[0]!.options, before.questions[0]!.options);
  publicQuestions[0]!.options[0]!.id = 999;
  publicQuestions[0]!.options[0]!.text = "public edit";
  assert.deepEqual(parsed, before);
  parsed.questions[0]!.options[0]!.id = 888;
  parsed.questions[0]!.options[0]!.text = "runtime edit";
  parsed.questions[0]!.options.reverse();
  parsed.pillars[0]!.displayName = "runtime edit";
  assert.deepEqual(f.snapshot, before);
});

test("V2 reader and writer reject invalid new-content option identities and text", () => {
  const f = v2Fixture();
  const original = f.questions[0]!;
  const invalidQuestions = [
    { ...original, options: original.options.slice(1) },
    { ...original, options: [...original.options, { id: 999, text: "Fifth" }] },
    {
      ...original,
      options: original.options.map((option) => ({ ...option, id: 30 })),
    },
    ...[-1, 0.5, NaN, Infinity].map((id) => ({
      ...original,
      options: original.options.map((option, i) =>
        i ? option : { ...option, id },
      ),
    })),
    ...["", " \t\n"].map((text) => ({
      ...original,
      options: original.options.map((option, i) =>
        i ? option : { ...option, text },
      ),
    })),
    ...[-1, 0.5, NaN, Infinity, 1, 999, 2_147_483_648].map(
      (correctOptionId) => ({
        ...original,
        correctOptionId,
      }),
    ),
    ...original.options.map((option, index) => ({
      ...original,
      options: original.options.map((choice, i) =>
        i === index ? { ...choice, id: 2_147_483_648 } : choice,
      ),
      correctOptionId:
        option.id === original.correctOptionId
          ? 2_147_483_648
          : original.correctOptionId,
    })),
  ];
  for (const question of invalidQuestions) {
    const questions = [question, ...f.questions.slice(1)];
    assert.throws(
      () =>
        parseQuestionSnapshot(
          { ...f.snapshot, questions },
          f.ids,
          configuration,
        ),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    );
    assert.throws(
      () => createQuestionSnapshot(f.ids, questions, f.pillars, configuration),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    );
  }
  for (const version of [0, 3, "2", null]) {
    assert.throws(
      () =>
        parseQuestionSnapshot({ ...f.snapshot, version }, f.ids, configuration),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
    );
  }
  assert.throws(
    () =>
      parseQuestionSnapshot(
        { ...f.snapshot, scoringVersion: "weighted-v2" },
        f.ids,
        configuration,
      ),
    snapshotError(SNAPSHOT_ERROR_CODE.INVALID_QUESTIONS),
  );
});

test("V2 completion validates selected ID membership in each saved question, not array bounds", () => {
  const f = v2Fixture();
  for (const selectedOptionId of [
    -1,
    0.5,
    NaN,
    Infinity,
    1,
    4,
    999,
    2_147_483_648,
    f.questions[1]!.correctOptionId,
  ]) {
    assert.throws(
      () =>
        reportFrom({
          ...f,
          answers: f.answers.map((answer, i) =>
            i ? answer : { ...answer, selectedOptionId },
          ),
        }),
      snapshotError(SNAPSHOT_ERROR_CODE.INVALID_ANSWERS),
    );
  }
  // ID zero is a valid distractor here, despite having moved away from index zero.
  const wrong = reportFrom({
    ...f,
    answers: f.answers.map((answer, i) =>
      i ? answer : { ...answer, selectedOptionId: 0 },
    ),
  });
  assert.equal(wrong.result.questionResults[0]!.isCorrect, false);
});
