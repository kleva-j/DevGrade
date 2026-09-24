import type {
  ProficiencyLevel,
  AssessmentLength,
  SkillCategory,
  Difficulty,
  Framework,
} from "./constants";

/** Candidate choices fixed when the session is created. */
export interface AssessmentConfiguration {
  framework: Framework;
  targetLevel: Difficulty;
  questionCount: AssessmentLength;
}

/**
 * Full question record, including the answer key. This shape lives server-side
 * only and must never be serialized to the client (open decision #5 keeps the
 * answer key off the wire until the session is completed).
 */
export interface Question {
  id: string;
  framework: Framework;
  difficulty: Difficulty;
  skillCategory: SkillCategory;
  title: string;
  prompt: string;
  codeBlock: string | null;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficultyWeight: number;
}

/**
 * Client-safe projection of a question: no `correctAnswer`, no `explanation`.
 * Session creation returns the entire selected set up front.
 */
export interface PublicQuestion {
  id: string;
  skillCategory: SkillCategory;
  title: string;
  prompt: string;
  codeBlock: string | null;
  options: string[];
}

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    skillCategory: q.skillCategory,
    title: q.title,
    prompt: q.prompt,
    codeBlock: q.codeBlock,
    options: q.options,
  };
}

export interface AnswerInput {
  questionId: string;
  selectedAnswer: number;
  timeSpentSeconds: number;
}

/** One pillar's weighted result. Persisted in `session_category_scores` (#4). */
export interface CategoryScore {
  skillCategory: SkillCategory;
  correctWeight: number;
  totalWeight: number;
  scorePct: number;
  proficiency: ProficiencyLevel;
}

export interface QuestionResult {
  questionId: string;
  isCorrect: boolean;
  explanation: string;
}

/** Final report returned by `POST /api/sessions/:id/complete`. */
export interface AssessmentResult {
  sessionId: string;
  framework: Framework;
  targetLevel: Difficulty;
  /** Weighted overall percentage, 0..100. */
  totalScore: number;
  maxScore: 100;
  proficiencyLevel: ProficiencyLevel;
  categoryScores: CategoryScore[];
  skillGaps: SkillCategory[];
  questionResults: QuestionResult[];
}
