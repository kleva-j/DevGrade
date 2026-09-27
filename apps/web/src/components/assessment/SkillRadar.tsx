import type { ChartConfig } from "@workspace/ui/components/chart";
import type { CategoryScore } from "@/domain/types";

import {
  ChartContainer,
  PolarAngleAxis,
  RadarChart,
  PolarGrid,
  Radar,
} from "@workspace/ui/components/chart";

import type { SnapshotPillar } from "@/domain/sessionSnapshots";
import { UI } from "./copy";

export interface SkillRadarProps {
  scores: readonly CategoryScore[];
  pillars: readonly SnapshotPillar[];
}

/**
 * Radar of the per-pillar weighted scores, built on the shadcn `chart` wrapper
 * (Recharts). A single series reads as the brand `primary` (design.md §4); the
 * categorical `--chart-*` pillar colors live in the Report pillar bars, not here.
 * Order follows the `categoryScores` array as given.
 */
const chartConfig = {
  score: { label: UI.report.scoreLabel, color: "var(--primary)" },
} satisfies ChartConfig;

export function SkillRadar({ scores, pillars }: SkillRadarProps) {
  if (scores.length < 3) return null;

  const data = scores.map((s) => ({
    pillar:
      pillars.find((pillar) => pillar.skillCategory === s.skillCategory)
        ?.displayName ?? "",
    score: s.scorePct,
  }));

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-64 w-full [&_.recharts-polar-angle-axis-tick-value]:text-xs"
    >
      <RadarChart
        data={data}
        margin={{ top: 16, bottom: 16, left: 24, right: 24 }}
        outerRadius="70%"
      >
        <PolarGrid />
        <PolarAngleAxis
          dataKey="pillar"
          tick={{ fill: "var(--muted-foreground)" }}
        />
        <Radar
          dataKey="score"
          fill="var(--color-score)"
          fillOpacity={0.15}
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={{ r: 3, fillOpacity: 1 }}
        />
      </RadarChart>
    </ChartContainer>
  );
}
