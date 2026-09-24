import type { Difficulty, Framework } from "@/domain/constants";
import type { AssessmentConfiguration } from "@/domain/types";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useId, useState } from "react";

import {
  FieldDescription,
  FieldLegend,
  FieldGroup,
  FieldSet,
} from "@workspace/ui/components/field";
import {
  CardDescription,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Card,
} from "@workspace/ui/components/card";
import {
  ToggleGroupItem,
  ToggleGroup,
} from "@workspace/ui/components/toggle-group";

import {
  DEFAULT_ASSESSMENT_LENGTH,
  ASSESSMENT_LENGTHS,
  isAssessmentLength,
  MVP_FRAMEWORKS,
  DIFFICULTIES,
  DIFFICULTY,
  FRAMEWORKS,
  FRAMEWORK,
} from "@/domain/constants";

import {
  ASSESSMENT_LENGTH_LABELS,
  DIFFICULTY_LABELS,
  FRAMEWORK_LABELS,
  UI,
} from "./copy";

export interface IntakeProps {
  initialConfiguration: AssessmentConfiguration | null;
  onStart: (configuration: AssessmentConfiguration) => void;
}

/**
 * Selected-item emphasis for the intake toggles. design.md §12 requires the
 * active choice to read obviously; §4 makes primary the only accent, so the
 * chosen tile turns primary-tinted (overriding the toggle's default muted
 * pressed state for both `data-[state=on]` and `aria-pressed`).
 */
const SELECTED_ITEM_CLASS =
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary";

export function Intake({ initialConfiguration, onStart }: IntakeProps) {
  const id = useId();
  const [configuration, setConfiguration] = useState<AssessmentConfiguration>(
    () =>
      initialConfiguration ?? {
        framework: FRAMEWORK.REACT,
        targetLevel: DIFFICULTY.MID,
        questionCount: DEFAULT_ASSESSMENT_LENGTH,
      },
  );
  const { framework, targetLevel, questionCount } = configuration;

  return (
    <Card className="w-full max-w-lg [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(8)]">
      <CardHeader>
        <p className="text-sm font-semibold text-primary">{UI.appName}</p>
        <CardTitle className="text-2xl font-bold text-balance">
          {UI.intake.heading}
        </CardTitle>
        <CardDescription className="leading-relaxed">
          {UI.intake.subheading(questionCount)}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <FieldGroup className="gap-6">
          <FieldSet>
            <FieldLegend id={`${id}-framework`} variant="label">
              {UI.intake.frameworkLabel}
            </FieldLegend>
            <ToggleGroup
              variant="outline"
              aria-labelledby={`${id}-framework`}
              multiple={false}
              value={[framework]}
              onValueChange={(value) => {
                const next = value[0] as Framework | undefined;
                if (next)
                  setConfiguration((current) => ({
                    ...current,
                    framework: next,
                  }));
              }}
            >
              {FRAMEWORKS.map((f) => (
                <ToggleGroupItem
                  key={f}
                  value={f}
                  disabled={!MVP_FRAMEWORKS.includes(f)}
                  className={SELECTED_ITEM_CLASS}
                >
                  {FRAMEWORK_LABELS[f]}
                  {MVP_FRAMEWORKS.includes(f) ? null : (
                    <span className="ms-1.5 text-xs text-muted-foreground">
                      soon
                    </span>
                  )}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend id={`${id}-level`} variant="label">
              {UI.intake.levelLabel}
            </FieldLegend>
            <ToggleGroup
              variant="outline"
              aria-labelledby={`${id}-level`}
              multiple={false}
              value={[targetLevel]}
              onValueChange={(value) => {
                const next = value[0] as Difficulty | undefined;
                if (next)
                  setConfiguration((current) => ({
                    ...current,
                    targetLevel: next,
                  }));
              }}
            >
              {DIFFICULTIES.map((d) => (
                <ToggleGroupItem
                  key={d}
                  value={d}
                  className={SELECTED_ITEM_CLASS}
                >
                  {DIFFICULTY_LABELS[d]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend id={`${id}-length`} variant="label">
              {UI.intake.lengthLabel}
            </FieldLegend>
            <ToggleGroup
              variant="outline"
              multiple={false}
              aria-labelledby={`${id}-length`}
              aria-describedby={`${id}-length-hint`}
              className="grid w-full grid-cols-3"
              value={[String(questionCount)]}
              onValueChange={(value) => {
                const next = Number(value[0]);
                if (isAssessmentLength(next)) {
                  setConfiguration((current) => ({
                    ...current,
                    questionCount: next,
                  }));
                }
              }}
            >
              {ASSESSMENT_LENGTHS.map((count) => (
                <ToggleGroupItem
                  key={count}
                  value={String(count)}
                  className={cn(
                    "h-auto min-w-0 flex-col gap-1 px-1 py-3 whitespace-normal sm:px-3",
                    SELECTED_ITEM_CLASS,
                  )}
                >
                  <span>{ASSESSMENT_LENGTH_LABELS[count]}</span>
                  <span className="text-xs">
                    {UI.intake.questionCount(count)}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription id={`${id}-length-hint`}>
              {UI.intake.lengthHint}
            </FieldDescription>
          </FieldSet>
        </FieldGroup>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {UI.intake.metaNote(questionCount)}
        </span>
        <Button size="lg" onClick={() => onStart(configuration)}>
          {UI.intake.start}
        </Button>
      </CardFooter>
    </Card>
  );
}
