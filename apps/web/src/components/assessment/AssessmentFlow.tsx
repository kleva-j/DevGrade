import { useMachine } from "@xstate/react";
import { useEffect, useRef, useState } from "react";

import type { AssessmentConfiguration } from "@/domain/types";
import type { DeleteSessionInput } from "@/domain/sessionContracts";
import type { AssessmentContext } from "@/machines/assessmentMachine";
import type { StorageIssue } from "@/machines/sessionStorage";
import { DELETE_EXPECTATION, SESSION_VIEW } from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import {
  assessmentMachine,
  firstUnanswered,
  deletionExpectation,
} from "@/machines/assessmentMachine";
import { createBrowserRecovery } from "@/machines/assessmentServices";
import {
  STORAGE_ISSUE,
  SESSION_STORAGE_PREFIX,
} from "@/machines/sessionStorage";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Spinner } from "@workspace/ui/components/spinner";
import { DeleteConfirmation } from "./DeleteConfirmation";
import {
  SessionDeadlinesDisplay,
  SessionHistory,
  sessionLabel,
} from "./SessionHistory";
import { SatisfactionSurvey } from "./SatisfactionSurvey";
import { QuestionRunner } from "./QuestionRunner";
import { LegacySummary } from "./LegacySummary";
import { Intake } from "./Intake";
import { Report } from "./Report";
import { UI } from "./copy";

interface LoadingPanelProps {
  message: string;
}
function LoadingPanel({ message }: LoadingPanelProps) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 text-muted-foreground"
    >
      <Spinner />
      <p>{message}</p>
    </div>
  );
}
interface ErrorPanelProps {
  message: string;
  onRetry?: () => void;
  onCancel: () => void;
}
function ErrorPanel({ message, onRetry, onCancel }: ErrorPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="font-heading">{UI.status.errorTitle}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          {UI.recovery.cancel}
        </Button>
        {onRetry ? <Button onClick={onRetry}>{UI.status.retry}</Button> : null}
      </CardFooter>
    </Card>
  );
}
const storageCopy: Record<StorageIssue, string> = {
  [STORAGE_ISSUE.UNAVAILABLE]: UI.recovery.storageUnavailable,
  [STORAGE_ISSUE.CORRUPT]: UI.recovery.storageCorrupt,
  [STORAGE_ISSUE.FULL]: UI.recovery.storageFull,
  [STORAGE_ISSUE.LIMIT]: UI.recovery.credentialLimit,
};
const errorMessages: Partial<
  Record<NonNullable<AssessmentContext["error"]>, string>
> = {
  [ERROR_CODE.SNAPSHOT_UNAVAILABLE]: UI.recovery.snapshotUnavailable,
  [ERROR_CODE.ATTEMPT_EXPIRED]: UI.recovery.expiredDescription,
  [ERROR_CODE.NOT_FOUND]: UI.recovery.unavailable,
  [ERROR_CODE.ACCESS_EXPIRED]: UI.recovery.unavailable,
};
function errorCopy(error: AssessmentContext["error"]) {
  return (error && errorMessages[error]) || UI.recovery.requestFailed;
}
const loadingMessages: Record<string, string> = {
  bootstrap: UI.recovery.checking,
  checking: UI.recovery.checking,
  creating: UI.recovery.checking,
  restoring: UI.recovery.restoring,
  resuming: UI.recovery.resuming,
  deleting: UI.recovery.deleting,
  reconciling: UI.recovery.reconciling,
  completing: UI.status.scoring,
};
const errorPhases = new Set([
  "checkFailed",
  "createFailed",
  "deleteFailed",
  "readFailed",
  "resumeFailed",
  "completeFailed",
]);

export function AssessmentFlow() {
  const [recovery] = useState(createBrowserRecovery);
  const [state, send] = useMachine(assessmentMachine, { input: { recovery } });
  const screen = useRef<HTMLDivElement>(null);
  const context = state.context;
  const view = context.view;
  const phase =
    typeof state.value === "string"
      ? state.value
      : state.matches("completed")
        ? "completed"
        : Object.values(state.value)[0];
  const question =
    view?.kind === SESSION_VIEW.ASSESSMENT ? firstUnanswered(view) : null;
  const choosing = state.matches({ creation: "ready" });
  const home = () => send({ type: "HISTORY" });
  const cancel = () => send({ type: "CANCEL" });
  const refreshHistory = () => send({ type: "REFRESH" });
  const resume = (sessionId: string) => send({ type: "RESUME", sessionId });
  const remove = (
    sessionId: string,
    expectedState: DeleteSessionInput["expectedState"],
  ) => send({ type: "DELETE", sessionId, expectedState });

  useEffect(() => {
    send({ type: "BOOTSTRAP" });
  }, [send]);
  useEffect(() => {
    function visibility() {
      if (document.visibilityState === "hidden") send({ type: "FOCUS_LOSS" });
      else if (navigator.onLine) refresh();
    }
    function storage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(SESSION_STORAGE_PREFIX))
        send({ type: "REFRESH" });
    }
    function refresh() {
      send({ type: "FOCUS_RETURN" });
      send({ type: "REFRESH" });
    }
    function offline() {
      send({ type: "OFFLINE" });
    }
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("storage", storage);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", visibility);
    window.addEventListener("offline", offline);
    if (
      phase === "answering" &&
      (!navigator.onLine || document.visibilityState === "hidden")
    )
      offline();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("storage", storage);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", visibility);
      window.removeEventListener("offline", offline);
    };
  }, [send, phase, question?.id]);

  // Advisory wakeup only. The server decides expiry, including when browser clocks differ.
  useEffect(() => {
    if (!view && !choosing) return;
    if (!["ready", "answering", "completed"].includes(phase ?? "")) return;
    const deadlines = view
      ? view.kind === SESSION_VIEW.REPORT ||
        view.kind === SESSION_VIEW.LEGACY_SUMMARY
        ? [view.accessExpiresAt]
        : [view.attemptExpiresAt, view.accessExpiresAt]
      : context.history.flatMap((entry) => [
          entry.attemptExpiresAt,
          entry.accessExpiresAt,
        ]);
    const times = deadlines.map(Date.parse);
    // Poll only a gate prompt. Do not repeatedly unmount an active question or
    // reset intake controls just to refresh unchanged metadata.
    const ceiling = choosing ? 30_000 : 2_147_483_647;
    if (times.length === 0 && !choosing) return;
    const remaining = Math.min(...times) - Date.now();
    const wait = remaining > 0 ? Math.min(ceiling, remaining) : 30_000;
    const id = window.setTimeout(() => send({ type: "REFRESH" }), wait);
    return () => window.clearTimeout(id);
  }, [view, context.history, phase, choosing, send]);

  useEffect(() => {
    if (phase === "confirmDelete") return;
    const heading = screen.current?.querySelector<HTMLElement>("h1, h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [phase, question?.id, choosing]);

  const history = (
    <SessionHistory
      sessions={context.history}
      onOpen={(sessionId) => send({ type: "OPEN", sessionId })}
      onResume={resume}
      onDelete={remove}
    />
  );
  function onStart(configuration: AssessmentConfiguration) {
    send({ type: "CONFIGURE", configuration });
    send({ type: "START" });
  }
  function renderScreen() {
    if (phase && loadingMessages[phase])
      return (
        <>
          <LoadingPanel message={loadingMessages[phase]} />
          {state.matches("creation") ? (
            <Button variant="outline" onClick={cancel}>
              {UI.recovery.cancel}
            </Button>
          ) : null}
        </>
      );
    if (state.matches({ history: "ready" }))
      return (
        <>
          <Intake
            initialConfiguration={context.requestedConfiguration}
            onStart={onStart}
          />
          {history}
          <Button variant="outline" onClick={refreshHistory}>
            {UI.recovery.refresh}
          </Button>
        </>
      );
    if (state.matches({ creation: "ready" }))
      return (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h1 className="font-heading text-xl">
                  {UI.recovery.gateHeading}
                </h1>
              </CardTitle>
              <CardDescription>
                {context.history.some((entry) => entry.blocksCreation)
                  ? UI.recovery.gateDescription
                  : UI.recovery.gateClear}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={cancel}>
                {UI.recovery.cancel}
              </Button>
              <Button variant="outline" onClick={refreshHistory}>
                {UI.recovery.refresh}
              </Button>
              {!context.history.some((entry) => entry.blocksCreation) ? (
                <Button
                  disabled={context.storageIssue !== null}
                  onClick={() => send({ type: "START" })}
                >
                  {UI.recovery.continue}
                </Button>
              ) : null}
            </CardFooter>
          </Card>
          {history}
        </>
      );
    if (phase === "confirmDelete")
      return (
        <DeleteConfirmation
          metadata={
            context.history.find(
              (entry) => entry.sessionId === context.sessionId,
            ) ?? (view && "configuration" in view ? view : undefined)
          }
          expectedState={context.expectedDeleteState}
          onConfirm={() => send({ type: "CONFIRM_DELETE" })}
          onCancel={cancel}
        />
      );
    if (phase && errorPhases.has(phase))
      return (
        <>
          <ErrorPanel
            message={
              phase === "createFailed"
                ? UI.recovery.createFailed
                : errorCopy(context.error)
            }
            onRetry={() => send({ type: "RETRY" })}
            onCancel={cancel}
          />
          {state.matches("history") || state.matches("creation")
            ? history
            : null}
        </>
      );
    if (phase === "unavailable")
      return (
        <>
          <Alert>
            <AlertDescription>{UI.recovery.unavailable}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={home}>
            {UI.recovery.history}
          </Button>
        </>
      );
    if (state.matches({ viewing: "ready" }) && view && "configuration" in view)
      return (
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="font-heading text-xl">{sessionLabel(view)}</h1>
            </CardTitle>
            <CardDescription>
              {UI.recovery.progress(view.answeredCount, view.totalQuestions)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                {view.kind === SESSION_VIEW.ATTEMPT_EXPIRED
                  ? UI.recovery.expiredDescription
                  : view.kind === SESSION_VIEW.LEGACY_UNRESTORABLE
                    ? UI.recovery.legacy
                    : !question
                      ? UI.recovery.finishDescription
                      : UI.recovery.resumeDescription}
              </AlertDescription>
            </Alert>
            <SessionDeadlinesDisplay deadlines={view} />
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={home}>
              {UI.recovery.history}
            </Button>
            <Button
              variant="outline"
              onClick={() => remove(view.sessionId, deletionExpectation(view))}
            >
              {UI.recovery.remove}
            </Button>
            {view.canResume ? (
              <Button onClick={() => resume(view.sessionId)}>
                {UI.recovery.resume}
              </Button>
            ) : null}
          </CardFooter>
        </Card>
      );
    if (
      (phase === "answering" ||
        phase === "submittingAnswer" ||
        phase === "answerFailed") &&
      view?.kind === SESSION_VIEW.ASSESSMENT &&
      question
    )
      return (
        <>
          <p className="text-sm font-medium">{sessionLabel(view)}</p>
          <QuestionRunner
            question={question}
            index={view.questions.findIndex((q) => q.id === question.id)}
            total={view.totalQuestions}
            answeredCount={view.answeredCount}
            questionStartedAt={context.questionStartedAt}
            timerPausedAt={context.timerPausedAt}
            selectedOption={context.selectedOption}
            submitting={phase === "submittingAnswer"}
            isLast={view.answeredCount === view.totalQuestions - 1}
            error={phase === "answerFailed" ? errorCopy(context.error) : null}
            onSelect={(option) => send({ type: "SELECT_OPTION", option })}
            onSubmit={() => send({ type: "SUBMIT_ANSWER" })}
            onRetry={() => send({ type: "RETRY" })}
          />
          <SessionDeadlinesDisplay deadlines={view} />
          <Button
            variant="outline"
            disabled={phase === "submittingAnswer"}
            onClick={home}
          >
            {UI.recovery.history}
          </Button>
        </>
      );
    if (
      state.matches("completed") &&
      view &&
      (view.kind === SESSION_VIEW.REPORT ||
        view.kind === SESSION_VIEW.LEGACY_SUMMARY)
    ) {
      const survey = {
        phase: state.matches({ completed: "submittingSurvey" })
          ? ("submitting" as const)
          : view.surveyRating !== null
            ? ("thanks" as const)
            : ("prompt" as const),
        savedRating: view.surveyRating,
        error: context.error ? UI.survey.error : null,
        onSubmit: (rating: number) => send({ type: "SUBMIT_SURVEY", rating }),
      };
      return (
        <>
          <SessionDeadlinesDisplay deadlines={view} />
          {view.kind === SESSION_VIEW.REPORT ? (
            <Report
              snapshot={view.reportSnapshot}
              survey={survey}
              onRestart={home}
            />
          ) : (
            <>
              <LegacySummary view={view} />
              <SatisfactionSurvey {...survey} />
              <Button variant="outline" onClick={home}>
                {UI.recovery.history}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => remove(view.sessionId, DELETE_EXPECTATION.COMPLETED)}
          >
            {UI.recovery.remove}
          </Button>
        </>
      );
    }
    return null;
  }
  return (
    <main className="flex min-h-svh justify-center bg-background p-4 text-foreground sm:p-6">
      <div ref={screen} className="flex w-full max-w-2xl flex-col gap-6 py-6">
        {context.storageIssue ? (
          <Alert>
            <AlertTitle>{UI.recovery.warningTitle}</AlertTitle>
            <AlertDescription>
              {storageCopy[context.storageIssue]}
              {context.sessionId ? <p>{UI.recovery.memoryWarning}</p> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {context.notice === "changed_state" ? (
          <Alert>
            <AlertDescription>{UI.recovery.changedState}</AlertDescription>
          </Alert>
        ) : null}
        {renderScreen()}
        <footer className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{UI.recovery.accessNote}</p>
          <p>{UI.recovery.privacy}</p>
          <p>{UI.recovery.coordination}</p>
        </footer>
      </div>
    </main>
  );
}
