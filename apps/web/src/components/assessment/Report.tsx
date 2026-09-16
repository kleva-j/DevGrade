import type { ProficiencyLevel } from "@/domain/constants";
import type { AssessmentResult, PublicQuestion } from "@/domain/types";

import { WarningCircleIcon } from "@phosphor-icons/react";

import { Separator } from "@workspace/ui/components/separator";
import { Progress } from "@workspace/ui/components/progress";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";

import {
  AlertDescription,
  AlertTitle,
  Alert,
} from "@workspace/ui/components/alert";
import {
  CardContent,
  CardHeader,
  CardTitle,
  Card,
} from "@workspace/ui/components/card";

import { SKILL_CATEGORY_META } from "@/domain/constants";

import { PILLAR_INDICATOR_CLASS, PROFICIENCY_UI, UI } from "./copy";
import { SkillRadar } from "./SkillRadar";

export interface ReportProps {
  result: AssessmentResult;
  questionsById: Map<string, PublicQuestion>;
  onRestart: () => void;
}

interface TierBadgeProps {
  proficiency: ProficiencyLevel;
}

function TierBadge({ proficiency }: TierBadgeProps) {
  const tier = PROFICIENCY_UI[proficiency];
  return <Badge className={tier.badgeClassName}>{tier.label}</Badge>;
}

export function Report({ result, questionsById, onRestart }: ReportProps) {
  return (
    <section className="w-full max-w-2xl">
      <header className="text-center">
        <p className="text-sm font-semibold text-primary">{UI.appName}</p>
        <h1 className="mt-1 font-heading text-2xl font-bold">
          {UI.report.heading}
        </h1>
      </header>

      {/* Overall + radar */}
      <Card className="mt-6 [--card-spacing:--spacing(8)]">
        <CardContent className="grid gap-6 sm:grid-cols-2 sm:items-center">
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {UI.report.overallLabel}
            </span>
            <span className="font-heading text-6xl font-bold tabular-nums">
              {Math.round(result.totalScore)}
              <span className="text-2xl text-muted-foreground">%</span>
            </span>
            <TierBadge proficiency={result.proficiencyLevel} />
          </div>
          <div className="flex justify-center">
            <SkillRadar scores={result.categoryScores} />
          </div>
        </CardContent>
      </Card>

      {/* Pillar breakdown */}
      <Card className="mt-6 [--card-spacing:--spacing(8)]">
        <CardHeader>
          <CardTitle className="text-lg font-bold">
            {UI.report.pillarsHeading}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-4">
            {result.categoryScores.map((c) => (
              <li key={c.skillCategory}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {SKILL_CATEGORY_META[c.skillCategory].displayName}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">
                      {Math.round(c.scorePct)}%
                    </span>
                    <TierBadge proficiency={c.proficiency} />
                  </span>
                </div>
                <Progress
                  value={c.scorePct}
                  className={cn(
                    "mt-2 [&_[data-slot=progress-track]]:h-1.5",
                    PILLAR_INDICATOR_CLASS[c.skillCategory],
                  )}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Focus areas */}
      <Card className="mt-6 [--card-spacing:--spacing(8)]">
        <CardHeader>
          <CardTitle className="text-lg font-bold">
            {UI.report.gapsHeading}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.skillGaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{UI.report.noGaps}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {result.skillGaps.map((gap) => (
                <Alert key={gap} variant="destructive">
                  <WarningCircleIcon />
                  <AlertTitle>
                    {SKILL_CATEGORY_META[gap].displayName}
                  </AlertTitle>
                  <AlertDescription>
                    {SKILL_CATEGORY_META[gap].description}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Question review */}
      <Card className="mt-6 [--card-spacing:--spacing(8)]">
        <CardHeader>
          <CardTitle className="text-lg font-bold">
            {UI.report.reviewHeading}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {result.questionResults.map((q, i) => {
              const question = questionsById.get(q.questionId);
              return (
                <div key={q.questionId}>
                  {i > 0 ? <Separator className="my-4" /> : null}
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">
                      {question?.title ?? q.questionId}
                    </span>
                    <Badge
                      variant={q.isCorrect ? "default" : "destructive"}
                      className="shrink-0"
                    >
                      {q.isCorrect ? UI.report.correct : UI.report.incorrect}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {q.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 flex justify-center">
        <Button size="lg" variant="outline" onClick={onRestart}>
          {UI.report.restart}
        </Button>
      </div>
    </section>
  );
}
