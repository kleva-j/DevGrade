import type {
  ProficiencyLevel,
  AssessmentLength,
  SkillCategory,
  Difficulty,
  Framework,
} from "@/domain/constants";

import {
  ASSESSMENT_LENGTH,
  SKILL_CATEGORY,
  PROFICIENCY,
  DIFFICULTY,
  FRAMEWORK,
} from "@/domain/constants";

/**
 * All user-facing copy for the candidate assessment UI, kept in one place.
 *
 * Mirrors the server-side `MESSAGES` seam: components never inline literal copy,
 * so wording stays consistent and there is a single place to review or localize.
 */
export const UI = {
  appName: "DevGrade",
  tagline: "Anonymous React skill assessment",
  intake: {
    heading: "Assess your React skills",
    subheading: (count: AssessmentLength) =>
      `${count} multiple-choice questions across four competency pillars. No sign-up, no personal data — just an instant, rule-based skill report.`,
    frameworkLabel: "Framework",
    levelLabel: "Target level",
    lengthLabel: "Assessment length",
    lengthHint: "All lengths are free. Choose how many questions to answer.",
    questionCount: (count: AssessmentLength) => `${count} questions`,
    start: "Start assessment",
    metaNote: (count: AssessmentLength) =>
      `${count} questions · no account needed`,
  },
  runner: {
    progress: (current: number, total: number) =>
      `Question ${current} of ${total}`,
    selectPrompt: "Select the best answer",
    submit: "Submit answer",
    finish: "See results",
  },
  report: {
    heading: "Your skill report",
    overallLabel: "Overall score",
    attemptedQuestions: (count: number) =>
      `${count} ${count === 1 ? "question" : "questions"} attempted`,
    pillarsHeading: "Competency pillars",
    gapsHeading: "Focus areas",
    noGaps: "No skill gaps detected — solid across all pillars.",
    reviewHeading: "Question review",
    correct: "Correct",
    incorrect: "Incorrect",
    restart: "Take it again",
  },
  survey: {
    heading: "How helpful was this assessment?",
    hint: "One quick tap — it helps us improve DevGrade.",
    low: "Not helpful",
    high: "Very helpful",
    submit: "Submit feedback",
    submitting: "Submitting…",
    thanks: "Thanks for the feedback!",
    error: "Could not save your feedback. Please try again.",
  },
  status: {
    creating: "Building your assessment…",
    scoring: "Scoring your answers…",
    errorTitle: "Something went wrong",
    retry: "Try again",
    restart: "Back to setup",
  },
} as const;

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  [FRAMEWORK.REACT]: "React",
  [FRAMEWORK.VUE]: "Vue",
  [FRAMEWORK.ANGULAR]: "Angular",
};

export const ASSESSMENT_LENGTH_LABELS: Record<AssessmentLength, string> = {
  [ASSESSMENT_LENGTH.QUICK]: "Quick",
  [ASSESSMENT_LENGTH.STANDARD]: "Standard",
  [ASSESSMENT_LENGTH.DEEP]: "Deep",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  [DIFFICULTY.JUNIOR]: "Junior",
  [DIFFICULTY.MID]: "Mid",
  [DIFFICULTY.SENIOR]: "Senior",
};

/**
 * Presentation metadata per proficiency tier. Tier badges use the calm *tinted*
 * treatment from the mockup (design.md §2/§4): proficient → tinted primary,
 * developing → tinted muted-foreground, skill gap → tinted destructive. The tint
 * is applied at the usage layer so the shared `Badge` variants stay generic.
 */
export const PROFICIENCY_UI: Record<
  ProficiencyLevel,
  { label: string; badgeClassName: string }
> = {
  [PROFICIENCY.PROFICIENT]: {
    label: "Proficient",
    badgeClassName: "bg-primary/15 text-primary",
  },
  [PROFICIENCY.DEVELOPING]: {
    label: "Developing",
    badgeClassName: "bg-muted-foreground/15 text-muted-foreground",
  },
  [PROFICIENCY.SKILL_GAP]: {
    label: "Skill gap",
    badgeClassName: "bg-destructive/10 text-destructive",
  },
};

/**
 * Per-pillar bar color as a full Progress-indicator override class, using the
 * categorical `--chart-*` tokens in `SKILL_CATEGORIES` order (design.md §4). The
 * complete utility string is stored literally so Tailwind's scanner emits it
 * (a composed `[&_...]:bg-chart-${n}` would not be detected).
 */
export const PILLAR_INDICATOR_CLASS: Record<SkillCategory, string> = {
  [SKILL_CATEGORY.REACTIVITY]: "[&_[data-slot=progress-indicator]]:bg-chart-1",
  [SKILL_CATEGORY.LIFECYCLE]: "[&_[data-slot=progress-indicator]]:bg-chart-2",
  [SKILL_CATEGORY.PERFORMANCE]: "[&_[data-slot=progress-indicator]]:bg-chart-3",
  [SKILL_CATEGORY.ASYNC]: "[&_[data-slot=progress-indicator]]:bg-chart-4",
};
