import { useState } from "react";

import { CheckCircleIcon } from "@phosphor-icons/react";

import { Button } from "@workspace/ui/components/button";
import {
  CardContent,
  CardHeader,
  CardTitle,
  Card,
} from "@workspace/ui/components/card";
import {
  ToggleGroupItem,
  ToggleGroup,
} from "@workspace/ui/components/toggle-group";

import { SURVEY_RATING_MIN, SURVEY_RATING_MAX } from "@/domain/constants";

import { UI } from "./copy";

/** Lifecycle of the survey card, mirrored from the machine's `completed` substates. */
export type SurveyPhase = "prompt" | "submitting" | "thanks";

export interface SatisfactionSurveyProps {
  phase: SurveyPhase;
  error: string | null;
  onSubmit: (rating: number) => void;
}

/** 1..5 rating scale, derived from the survey bounds so the scale has one source. */
const RATINGS = Array.from(
  { length: SURVEY_RATING_MAX - SURVEY_RATING_MIN + 1 },
  (_, i) => SURVEY_RATING_MIN + i,
);

/**
 * Selected-item emphasis for the rating toggles. Matches the intake control
 * (design.md §4/§12): primary is the only accent, so the chosen rating turns
 * primary-tinted for both `data-[state=on]` and `aria-pressed`.
 */
const SELECTED_ITEM_CLASS =
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary";

export function SatisfactionSurvey({
  phase,
  error,
  onSubmit,
}: SatisfactionSurveyProps) {
  const [rating, setRating] = useState<number | null>(null);
  const submitting = phase === "submitting";

  if (phase === "thanks") {
    return (
      <Card className="mt-6 [--card-spacing:--spacing(8)]">
        <CardContent className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
          <CheckCircleIcon weight="fill" className="size-5" />
          {UI.survey.thanks}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6 [--card-spacing:--spacing(8)]">
      <CardHeader>
        <CardTitle className="text-lg font-bold">{UI.survey.heading}</CardTitle>
        <p className="text-sm text-muted-foreground">{UI.survey.hint}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleGroup
          variant="outline"
          value={rating !== null ? [String(rating)] : []}
          onValueChange={(value) => {
            const next = value[0];
            if (next) setRating(Number(next));
          }}
        >
          {RATINGS.map((r) => (
            <ToggleGroupItem
              key={r}
              value={String(r)}
              disabled={submitting}
              aria-label={String(r)}
              className={SELECTED_ITEM_CLASS}
            >
              {r}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{UI.survey.low}</span>
          <span>{UI.survey.high}</span>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end">
          <Button
            disabled={rating === null || submitting}
            onClick={() => {
              if (rating !== null) onSubmit(rating);
            }}
          >
            {submitting ? UI.survey.submitting : UI.survey.submit}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
