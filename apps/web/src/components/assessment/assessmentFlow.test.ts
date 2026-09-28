import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionMetadata } from "@/domain/sessionContracts";
import { ASSESSMENT_LENGTH, SESSION_STATUS } from "@/domain/constants";
import { configuration, makeSession } from "@/machines/sessionTestFixtures";
import { AssessmentFlow } from "./AssessmentFlow";
import { SessionHistory } from "./SessionHistory";
import { UI } from "./copy";

// Shared UI preserves JSX; tsx needs the classic runtime where Vite supplies it.
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

test("initial render shows usable intake without announcing saved-assessment discovery", () => {
  const html = renderToStaticMarkup(createElement(AssessmentFlow));
  assert.ok(html.includes(UI.intake.heading));
  assert.ok(html.includes(UI.intake.start));
  assert.ok(!html.includes(UI.recovery.heading));
  assert.ok(!html.includes(UI.recovery.refresh));
  assert.ok(!html.includes('role="status"'));
  assert.ok(!html.includes('data-slot="spinner"'));
  assert.ok(!html.includes('role="alert"'));
});

test("empty saved history renders nothing", () => {
  const html = renderToStaticMarkup(
    createElement(SessionHistory, {
      sessions: [],
      onOpen: () => {},
      onResume: () => {},
      onDelete: () => {},
    }),
  );
  assert.equal(html, "");
});

test("completed-only history renders nothing without removing stored metadata", () => {
  const completed: SessionMetadata = {
    ...makeSession().assessment,
    effectiveStatus: SESSION_STATUS.COMPLETED,
    answeredCount: ASSESSMENT_LENGTH.QUICK,
    blocksCreation: false,
    canResume: false,
  };
  const sessions = [completed];
  const html = renderToStaticMarkup(
    createElement(SessionHistory, {
      sessions,
      onOpen: () => {},
      onResume: () => {},
      onDelete: () => {},
    }),
  );
  assert.equal(html, "");
  assert.deepEqual(sessions, [completed]);
});

test("mixed history keeps every unfinished state but hides completed assessments", () => {
  const active = makeSession().assessment;
  const awaitingCompletion: SessionMetadata = {
    ...makeSession().assessment,
    answeredCount: ASSESSMENT_LENGTH.QUICK,
  };
  const inactive: SessionMetadata = {
    ...makeSession().assessment,
    effectiveStatus: SESSION_STATUS.ABANDONED,
    answeredCount: 3,
  };
  const expired: SessionMetadata = {
    ...makeSession().assessment,
    effectiveStatus: SESSION_STATUS.ABANDONED,
    answeredCount: 4,
    blocksCreation: false,
    canResume: false,
  };
  const completed: SessionMetadata = {
    ...makeSession({ ...configuration, questionCount: ASSESSMENT_LENGTH.DEEP })
      .assessment,
    effectiveStatus: SESSION_STATUS.COMPLETED,
    answeredCount: ASSESSMENT_LENGTH.DEEP,
    blocksCreation: false,
    canResume: false,
  };
  const html = renderToStaticMarkup(
    createElement(SessionHistory, {
      sessions: [completed, active, awaitingCompletion, inactive, expired],
      onOpen: () => {},
      onResume: () => {},
      onDelete: () => {},
    }),
  );
  assert.equal((html.match(/<li>/g) ?? []).length, 4);
  for (const session of [active, awaitingCompletion, inactive, expired])
    assert.ok(
      html.includes(
        UI.recovery.progress(session.answeredCount, session.totalQuestions),
      ),
    );
  assert.ok(
    !html.includes(
      UI.recovery.progress(completed.answeredCount, completed.totalQuestions),
    ),
  );
  assert.ok(!html.includes(UI.recovery.savedReport));
  assert.ok(html.includes(UI.recovery.inactive));
  assert.ok(html.includes(UI.recovery.expired));
});

test("discovered assessments render their saved progress and recovery actions", () => {
  const session = makeSession();
  const html = renderToStaticMarkup(
    createElement(SessionHistory, {
      sessions: [session.assessment],
      onOpen: () => {},
      onResume: () => {},
      onDelete: () => {},
    }),
  );
  assert.ok(html.includes(UI.recovery.heading));
  assert.ok(
    html.includes(UI.recovery.progress(0, session.assessment.totalQuestions)),
  );
  assert.ok(html.includes(UI.recovery.open));
  assert.ok(html.includes(UI.recovery.resume));
  assert.ok(html.includes(UI.recovery.remove));
  assert.ok(!html.includes(session.credential.sessionToken));
  assert.ok(html.includes(UI.recovery.attemptDeadline));
  assert.ok(html.includes(`dateTime="${session.assessment.attemptExpiresAt}"`));
  assert.equal((html.match(/<time /g) ?? []).length, 1);
  assert.ok(!html.includes(UI.recovery.reportUntil));
});

test("compact history retains accessible names for icon actions and metadata", () => {
  const session = { ...makeSession().assessment, answeredCount: 3 };
  const html = renderToStaticMarkup(
    createElement(SessionHistory, {
      sessions: [session],
      onOpen: () => {},
      onResume: () => {},
      onDelete: () => {},
    }),
  );
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  assert.equal(buttons.length, 3);
  for (const label of [
    UI.recovery.open,
    UI.recovery.remove,
    UI.recovery.resume,
  ]) {
    const button: string | undefined = buttons.find((markup) =>
      markup.includes(`aria-label="${label}"`),
    );
    assert.ok(button, `Missing accessible action: ${label}`);
    assert.ok(button.includes("<svg"));
    assert.ok(button.includes('aria-hidden="true"'));
    assert.equal((button.match(/<button\b/g) ?? []).length, 1);
  }
  assert.ok(
    html.includes(UI.recovery.compactProgress(3, session.totalQuestions)),
  );
  assert.ok(html.includes(UI.recovery.progress(3, session.totalQuestions)));
  assert.ok(html.includes(`aria-label="${UI.recovery.unfinished}"`));
  assert.ok(html.includes(UI.recovery.attemptDeadline));
});

for (const state of ["expired", "legacy"] as const) {
  test(`${state} history keeps details and deletion without offering resume`, () => {
    const session: SessionMetadata = {
      ...makeSession().assessment,
      blocksCreation: state === "legacy",
      canResume: false,
    };
    const html = renderToStaticMarkup(
      createElement(SessionHistory, {
        sessions: [session],
        onOpen: () => {},
        onResume: () => {},
        onDelete: () => {},
      }),
    );
    assert.ok(html.includes(UI.recovery.open));
    assert.ok(html.includes(UI.recovery.remove));
    assert.ok(!html.includes(`aria-label="${UI.recovery.resume}"`));
    assert.ok(html.includes(UI.recovery.attemptDeadline));
    assert.ok(html.includes(`dateTime="${session.attemptExpiresAt}"`));
    assert.equal(html.includes(UI.recovery.legacy), state === "legacy");
    assert.equal(html.includes(UI.recovery.expired), state === "expired");
  });
}
