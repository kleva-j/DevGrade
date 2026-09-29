import assert from "node:assert/strict";
import { test } from "node:test";

import { z } from "zod";

import { QUESTION_OPTION_COUNT } from "@/domain/constants";
import { normalizeQuestionOptions } from "@/domain/questionOptions";

function options() {
  return [
    { id: 30, text: "First" },
    { id: 7, text: "Second" },
    { id: 90, text: "Third" },
    { id: 0, text: "  Fourth  " },
  ];
}

test("bank bridge gives legacy strings authored-position IDs and detaches the array", () => {
  const legacy = ["First", "Second", "Third", "  Fourth  "];
  const normalized = normalizeQuestionOptions(legacy);
  assert.equal(normalized.length, QUESTION_OPTION_COUNT);
  assert.deepEqual(
    normalized,
    legacy.map((text, id) => ({ id, text })),
  );
  normalized[0]!.text = "changed";
  assert.equal(legacy[0], "First");
});

test("bank bridge preserves explicit IDs, order, and text while deeply detaching and allowlisting", () => {
  const source = options().map((option) => ({ ...option, correctAnswer: 0 }));
  const normalized = normalizeQuestionOptions(source);
  assert.deepEqual(normalized, options());
  normalized[0]!.id = 999;
  normalized[0]!.text = "changed";
  normalized.reverse();
  assert.equal(source[0]!.id, 30);
  assert.equal(source[0]!.text, "First");
});

test("bank bridge enforces PostgreSQL integer bounds on every option ID", () => {
  for (const index of [0, 1, 2, 3]) {
    const source = options();
    source[index]!.id = 2_147_483_647;
    assert.deepEqual(normalizeQuestionOptions(source), source);
    source[index]!.id = 2_147_483_648;
    assert.throws(() => normalizeQuestionOptions(source), z.ZodError);
  }
});

test("bank bridge rejects malformed, mixed, and invalid four-option content", () => {
  const invalid = [
    null,
    undefined,
    {},
    [],
    ["First", "Second", "Third"],
    ["First", "Second", "Third", "Fourth", "Fifth"],
    ["First", "Second", "Third", "\t\n"],
    ["First", "Second", "Third", 4],
    ["First", ...options().slice(1)],
    options().slice(1),
    [...options(), { id: 100, text: "Fifth" }],
    options().map((option) => ({ ...option, id: 0 })),
    ...[-1, 0.5, NaN, Infinity, "30", null, undefined].map((id) =>
      options().map((option, i) => (i ? option : { ...option, id })),
    ),
    ...["", " \t\n ", null, 7, undefined].map((text) =>
      options().map((option, i) => (i ? option : { ...option, text })),
    ),
  ];
  for (const value of invalid) {
    assert.throws(() => normalizeQuestionOptions(value), z.ZodError);
  }
});
