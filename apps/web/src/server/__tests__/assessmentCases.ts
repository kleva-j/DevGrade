// Literal expectations from PRD §4.2, independent of the production allowlist.
export const lengthCases = [
  { questionCount: 8, pairsPerPillar: 1, weightPerPillar: 3 },
  { questionCount: 16, pairsPerPillar: 2, weightPerPillar: 6 },
  { questionCount: 32, pairsPerPillar: 4, weightPerPillar: 12 },
] as const;

export const invalidQuestionCounts: ReadonlyArray<{
  label: string;
  value: unknown;
}> = [
  ...[-32, -8, 0, 1, 4, 7, 9, 12, 15, 17, 24, 31, 33, 64].map((value) => ({
    label: String(value),
    value,
  })),
  ...[7.9, 8.1, 15.9, 16.1, 31.9, 32.1].map((value) => ({
    label: `fraction ${value}`,
    value,
  })),
  { label: 'string "8"', value: "8" },
  { label: 'string "16"', value: "16" },
  { label: 'string "32"', value: "32" },
  { label: "empty string", value: "" },
  { label: "null", value: null },
  { label: "true", value: true },
  { label: "false", value: false },
  { label: "NaN", value: Number.NaN },
  { label: "Infinity", value: Number.POSITIVE_INFINITY },
  { label: "-Infinity", value: Number.NEGATIVE_INFINITY },
  { label: "array", value: [8] },
  { label: "object", value: { questionCount: 8 } },
  { label: "bigint", value: 8n },
];
