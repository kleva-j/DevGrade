import { useEffect, useState } from "react";

import type { PublicQuestion } from "@/domain/types";

import { WarningCircleIcon } from "@phosphor-icons/react";

import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field";
import { Progress } from "@workspace/ui/components/progress";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group";

import { SKILL_CATEGORY_META } from "@/domain/constants";

import { UI } from "./copy";

export interface QuestionRunnerProps {
  question: PublicQuestion;
  /** Zero-based index of the current question. */
  index: number;
  total: number;
  selectedOption: number | null;
  submitting: boolean;
  isLast: boolean;
  /** Present only while the machine is in `answerFailed`. */
  error: string | null;
  onSelect: (option: number) => void;
  onSubmit: () => void;
  onRetry: () => void;
}

interface CodeBlockProps {
  code: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Monospace snippet on a muted surface (design.md §5). */
function CodeBlock({ code }: CodeBlockProps) {
  return (
    <pre
      tabIndex={0}
      aria-label="Code example"
      className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-[0.8rem] leading-relaxed"
    >
      {code}
    </pre>
  );
}

export function QuestionRunner({
  question,
  index,
  total,
  selectedOption,
  submitting,
  isLast,
  error,
  onSelect,
  onSubmit,
  onRetry,
}: QuestionRunnerProps) {
  const [elapsed, setElapsed] = useState(0);

  // Reset + run the per-question timer whenever the question changes.
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [question.id]);

  const progressPct = ((index + 1) / total) * 100;

  return (
    <Card className="w-full max-w-2xl [--card-spacing:--spacing(8)]">
      <CardContent>
        {/* Progress + timer */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground">
            {UI.runner.progress(index + 1, total)}
          </span>
          <span className="text-muted-foreground tabular-nums" aria-live="off">
            {formatElapsed(elapsed)}
          </span>
        </div>
        <Progress value={progressPct} className="mt-2" />

        {/* Prompt */}
        <p className="mt-6 text-xs font-semibold tracking-wide text-primary uppercase">
          {SKILL_CATEGORY_META[question.skillCategory].displayName}
        </p>
        <h2 className="mt-1 font-heading text-xl font-bold">
          {question.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">{question.prompt}</p>
        {question.codeBlock ? <CodeBlock code={question.codeBlock} /> : null}

        {/* Options */}
        <FieldSet className="mt-6">
          <FieldLegend variant="label" className="sr-only">
            {UI.runner.selectPrompt}
          </FieldLegend>
          <RadioGroup
            value={selectedOption}
            onValueChange={(value) => onSelect(value as number)}
            disabled={submitting}
          >
            {question.options.map((option, i) => (
              <FieldLabel key={i} htmlFor={`${question.id}-${i}`}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{option}</FieldTitle>
                  </FieldContent>
                  <RadioGroupItem value={i} id={`${question.id}-${i}`} />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <WarningCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-8 flex justify-end">
          <Button
            size="lg"
            disabled={selectedOption === null || submitting}
            onClick={error ? onRetry : onSubmit}
          >
            {error
              ? UI.status.retry
              : isLast
                ? UI.runner.finish
                : UI.runner.submit}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
