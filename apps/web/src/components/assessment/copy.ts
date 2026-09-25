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
  recovery: {
    heading: "Saved in this browser",
    checking: "Checking saved assessments…",
    restoring: "Opening your saved assessment…",
    resuming: "Resuming your assessment…",
    deleting: "Deleting this assessment…",
    reconciling: "Checking accepted answers and session status…",
    empty: "No accessible saved assessments in this browser.",
    privacy:
      "Recovery keys are saved in this browser, not an account. Anyone using this browser profile, and scripts on this site, can access them. Clearing browser data loses recovery; other browsers cannot recover these assessments.",
    coordination:
      "Same-browser coordination uses Web Locks when supported. Other profiles, missing keys, and browsers without Web Locks can still create overlapping attempts.",
    gateHeading: "Resume or delete your unfinished assessment",
    gateDescription:
      "An unfinished assessment blocks a new one, even with different settings. Resume its original configuration, or confirm deletion. Cancel keeps your saved assessments.",
    gateClear:
      "No unfinished assessment is blocking creation. Check again and start when you are ready.",
    resume: "Resume",
    open: "View details",
    report: "Open saved report",
    remove: "Delete",
    cancel: "Cancel",
    history: "Back to saved assessments",
    refresh: "Check again",
    continue: "Check again and start",
    resumeUntil: "Resume until",
    reportUntil: "Report available until",
    accessNote:
      "Both deadlines run from original creation. A report is available only after completion; access ending does not promise immediate physical erasure.",
    configuration: (framework: string, level: string, count: number) =>
      `${framework} · ${level} · ${count} questions`,
    progress: (answered: number, total: number) =>
      `${answered} of ${total} answers saved`,
    unfinished: "Unfinished",
    inactive: "Inactive — can resume",
    savedReport: "Completed",
    expired: "Attempt expired",
    expiredDescription:
      "The 24-hour attempt window has ended. This unfinished assessment cannot be resumed or awarded a report. You can delete it or start a new assessment.",
    legacy:
      "This older assessment has no saved question content. It cannot be resumed. Delete it to start another assessment while it is still within the attempt window.",
    resumeDescription:
      "Your original settings and accepted answers have been restored. Select Resume to continue. Unsaved choices are not restored.",
    finishDescription:
      "All answers are saved. Select Resume to finish before the attempt deadline; opening this page alone does not complete the assessment.",
    deleteHeading: "Delete this assessment?",
    deleteDescription:
      "This permanently deletes this assessment, its answers, report and feedback from the active service. You cannot undo this. Other already-open copies are not remotely erased.",
    deleteCompleted:
      "You are deleting a completed assessment and its saved report.",
    deleteUnfinished:
      "You are deleting an unfinished assessment. If it completes in another tab before deletion, its report will be kept and shown instead.",
    confirmDelete: "Delete assessment",
    changedState:
      "This assessment changed while you were deciding. Nothing was deleted. Its current saved view is shown below.",
    unavailable:
      "This assessment is no longer accessible. Its key has been removed where browser storage permits. Other saved assessments are unchanged.",
    warningTitle: "Browser recovery needs attention",
    memoryWarning:
      "Keep this tab open. A recovery key or its update could not be saved. You can continue here, but reopening may lose access. No replacement assessment was created.",
    storageUnavailable:
      "Saved keys cannot be read in this browser. Restore storage access and check again. Starting a new assessment is blocked until all known keys can be checked.",
    storageCorrupt:
      "Some saved data is unreadable or uses an unsupported format. It has been preserved. Recoverable assessments can still be opened, but starting another is blocked; do not clear keys to bypass an unfinished assessment.",
    storageFull:
      "Browser storage cannot save a recovery key. Restore storage access or free unrelated browser storage, then check again. No new assessment will be started while this problem remains.",
    credentialLimit:
      "This browser has more than 1,000 known recovery keys. None were dropped or partially checked. New creation is blocked; resolve this with support without discarding unchecked keys.",
    requestFailed:
      "The request could not be confirmed. Saved keys and any pending answer have been kept. Check your connection and try again.",
    createFailed:
      "Creation could not be confirmed. Check again before retrying. If the response was lost after creation, that assessment cannot be recovered without its key; a later explicit retry may create another.",
    snapshotUnavailable:
      "The saved content cannot be opened safely. Its key has been kept. Return to history to retry later or explicitly delete this assessment.",
    legacySummary:
      "Legacy summary — historical question content and guidance were not saved. Only the persisted scores are shown; no question review has been reconstructed.",
  },
  report: {
    heading: "Your skill report",
    scoreLabel: "Score",
    codeLabel: "Saved code example",
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
    savedRating: (rating: number) => `Saved rating: ${rating} of 5`,
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
