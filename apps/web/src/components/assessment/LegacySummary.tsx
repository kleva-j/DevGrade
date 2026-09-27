import type { LegacySummaryView } from "@/domain/sessionContracts";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { UI, PROFICIENCY_UI } from "./copy";

interface LegacySummaryProps {
  view: LegacySummaryView;
}
export function LegacySummary({ view }: LegacySummaryProps) {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold">{UI.report.heading}</h1>
      <Alert>
        <AlertTitle>{UI.recovery.savedReport}</AlertTitle>
        <AlertDescription>{UI.recovery.legacySummary}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>{UI.report.overallLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-heading text-4xl font-bold">
            {Math.round(view.summary.totalScore)}%
          </p>
          <p>{PROFICIENCY_UI[view.summary.proficiencyLevel].label}</p>
          <ul className="flex flex-col gap-2">
            {view.summary.categoryScores.map((score) => (
              <li
                key={score.skillCategory}
                className="flex flex-wrap justify-between gap-3"
              >
                <span>{score.skillCategory}</span>
                <span>
                  {Math.round(score.scorePct)}% ·{" "}
                  {PROFICIENCY_UI[score.proficiency].label}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
