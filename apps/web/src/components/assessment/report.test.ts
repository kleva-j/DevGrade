import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROFICIENCY,
  SKILL_CATEGORY_META,
  SESSION_VIEW,
} from "@/domain/constants";
import { makeSession } from "@/machines/sessionTestFixtures";
import { Report } from "./Report";
import { LegacySummary } from "./LegacySummary";
import { SessionDeadlinesDisplay } from "./SessionHistory";
import { UI } from "./copy";

// tsx uses classic JSX for the shared package's preserved JSX. Vite supplies its
// automatic runtime in the app; provide the classic runtime only in this test process.
const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React");
before(() =>
  Object.defineProperty(globalThis, "React", {
    value: React,
    configurable: true,
  }),
);
after(() => {
  if (previousReact) Object.defineProperty(globalThis, "React", previousReact);
  else Reflect.deleteProperty(globalThis, "React");
});

test("report renders saved public questions, pillar labels/guidance and restored survey rating", () => {
  const session = makeSession();
  const snapshot = session.report.reportSnapshot;
  snapshot.result.skillGaps = [snapshot.pillars[0]!.skillCategory];
  snapshot.result.categoryScores[0]!.proficiency = PROFICIENCY.SKILL_GAP;
  const html = renderToStaticMarkup(
    createElement(Report, {
      snapshot,
      survey: {
        phase: "thanks",
        savedRating: 4,
        error: null,
        onSubmit: () => {},
      },
      onRestart: () => {},
    }),
  );
  for (const saved of [
    "Saved question 0",
    "Saved prompt",
    "savedCode()",
    "Saved pillar name",
    "Saved guidance",
    "Saved explanation",
    UI.survey.savedRating(4),
  ])
    assert.ok(html.includes(saved), saved);
  assert.ok(
    !html.includes(
      SKILL_CATEGORY_META[snapshot.pillars[0]!.skillCategory].displayName,
    ),
  );
  assert.ok(!html.includes(session.credential.sessionToken));
});
test("legacy summary explicitly omits reconstructed question review and current pillar guidance", () => {
  const session = makeSession();
  const result = session.report.reportSnapshot.result;
  const html = renderToStaticMarkup(
    createElement(LegacySummary, {
      view: {
        kind: SESSION_VIEW.LEGACY_SUMMARY,
        sessionId: session.credential.sessionId,
        attemptExpiresAt: session.report.attemptExpiresAt,
        accessExpiresAt: session.report.accessExpiresAt,
        surveyRating: null,
        summary: {
          framework: result.framework,
          targetLevel: result.targetLevel,
          totalScore: result.totalScore,
          maxScore: result.maxScore,
          proficiencyLevel: result.proficiencyLevel,
          completedAt: session.report.reportSnapshot.completedAt,
          categoryScores: result.categoryScores,
        },
      },
    }),
  );
  assert.ok(html.includes(UI.recovery.legacySummary));
  assert.ok(!html.includes(UI.report.reviewHeading));
  assert.ok(!html.includes("Saved prompt"));
  assert.ok(!html.includes("Saved guidance"));
});
test("attempt and report-access deadlines have distinct semantic labels", () => {
  const html = renderToStaticMarkup(
    createElement(SessionDeadlinesDisplay, { deadlines: makeSession().report }),
  );
  assert.ok(html.includes(UI.recovery.resumeUntil));
  assert.ok(html.includes(UI.recovery.reportUntil));
  assert.equal((html.match(/<time /g) ?? []).length, 2);
});
