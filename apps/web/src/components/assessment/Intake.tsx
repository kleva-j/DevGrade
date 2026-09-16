import { useState } from "react";

import type { Difficulty, Framework } from "@/domain/constants";

import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Button } from "@workspace/ui/components/button";
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
  MVP_FRAMEWORKS,
  DIFFICULTIES,
  DIFFICULTY,
  FRAMEWORKS,
  FRAMEWORK,
} from "@/domain/constants";

import { DIFFICULTY_LABELS, FRAMEWORK_LABELS, UI } from "./copy";

export interface IntakeProps {
  onStart: (framework: Framework, targetLevel: Difficulty) => void;
}

/**
 * Selected-item emphasis for the intake toggles. design.md §12 requires the
 * active choice to read obviously; §4 makes primary the only accent, so the
 * chosen tile turns primary-tinted (overriding the toggle's default muted
 * pressed state for both `data-[state=on]` and `aria-pressed`).
 */
const SELECTED_ITEM_CLASS =
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary";

export function Intake({ onStart }: IntakeProps) {
  const [framework, setFramework] = useState<Framework>(FRAMEWORK.REACT);
  const [level, setLevel] = useState<Difficulty>(DIFFICULTY.MID);

  return (
    <Card className="w-full max-w-lg [--card-spacing:--spacing(8)]">
      <CardHeader>
        <p className="text-sm font-semibold text-primary">{UI.appName}</p>
        <CardTitle className="text-2xl font-bold text-balance">
          {UI.intake.heading}
        </CardTitle>
        <CardDescription className="leading-relaxed">
          {UI.intake.subheading}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <Field>
          <FieldLabel>{UI.intake.frameworkLabel}</FieldLabel>
          <ToggleGroup
            variant="outline"
            value={[framework]}
            onValueChange={(value) => {
              const next = value[0] as Framework | undefined;
              if (next) setFramework(next);
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
        </Field>

        <Field>
          <FieldLabel>{UI.intake.levelLabel}</FieldLabel>
          <ToggleGroup
            variant="outline"
            value={[level]}
            onValueChange={(value) => {
              const next = value[0] as Difficulty | undefined;
              if (next) setLevel(next);
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
        </Field>
      </CardContent>

      <CardFooter className="justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          {UI.intake.metaNote}
        </span>
        <Button size="lg" onClick={() => onStart(framework, level)}>
          {UI.intake.start}
        </Button>
      </CardFooter>
    </Card>
  );
}
