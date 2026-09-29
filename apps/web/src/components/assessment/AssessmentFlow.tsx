import type { AssessmentContext } from "@/machines/assessmentMachine";
import type { DeleteSessionInput } from "@/domain/sessionContracts";
import type { AssessmentConfiguration } from "@/domain/types";
import type { StorageIssue } from "@/machines/sessionStorage";

import { useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";

import { createBrowserRecovery } from "@/machines/assessmentServices";
import { isClientUpdateRequired } from "@/machines/createSessionAdapter";
import { CLIENT_ERROR_CODE, ERROR_CODE } from "@/server/errors";
import { Spinner } from "@workspace/ui/components/spinner";
import { STORAGE_ISSUE } from "@/machines/sessionStorage";
import { Button } from "@workspace/ui/components/button";

import {
  DELETE_EXPECTATION,
  DELETE_OUTCOME,
  SESSION_VIEW,
} from "@/domain/constants";
import {
  attachAssessmentBrowserEvents,
  advisoryRefreshDelay,
  deletionExpectation,
  assessmentMachine,
  firstUnanswered,
} from "@/machines/assessmentMachine";
import {
  AlertDescription,
  AlertTitle,
  Alert,
} from "@workspace/ui/components/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";

import {
  SessionDeadlinesDisplay,
  isUnfinishedSession,
  SessionHistory,
  sessionLabel,
} from "./SessionHistory";

import { DeleteConfirmation } from "./DeleteConfirmation";
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
  title?: string;
  retryLabel?: string;
  onRetry?: () => void;
  onCancel: () => void;
}
function ErrorPanel({
  message,
  title = UI.status.errorTitle,
  retryLabel = UI.status.retry,
  onRetry,
  onCancel,
}: ErrorPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="font-heading">{title}</h1>
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
        {onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null}
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
  [CLIENT_ERROR_CODE.REQUEST_FAILED]: UI.recovery.requestFailed,
  [ERROR_CODE.SNAPSHOT_UNAVAILABLE]: UI.recovery.snapshotUnavailable,
  [ERROR_CODE.ATTEMPT_EXPIRED]: UI.recovery.expiredDescription,
  [ERROR_CODE.NOT_FOUND]: UI.recovery.unavailable,
  [ERROR_CODE.ACCESS_EXPIRED]: UI.recovery.unavailable,
};
function errorCopy(error: AssessmentContext["error"]) {
  return (error && errorMessages[error]) || UI.recovery.requestFailed;
}
const loadingMessages: Record<string, string> = {
  creating: UI.status.creating,
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
  const showingIntake = state.matches("bootstrap") || state.matches("history");
  const showingGate = choosing || state.matches({ creation: "checking" });
  const focusPhase = showingIntake ? "intake" : showingGate ? "gate" : phase;
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
  useEffect(
    () =>
      attachAssessmentBrowserEvents(send, phase === "answering", {
        window,
        document,
        navigator,
      }),
    [send, phase, question?.id],
  );

  // Advisory wakeup only. The server decides expiry, including when browser clocks differ.
  useEffect(() => {
    if (!["ready", "answering", "completed"].includes(phase ?? "")) return;
    const wait = advisoryRefreshDelay(
      view,
      context.history,
      choosing,
      Date.now(),
    );
    if (wait === null) return;
    const id = window.setTimeout(() => send({ type: "REFRESH" }), wait);
    return () => window.clearTimeout(id);
  }, [view, context.history, phase, choosing, send]);

  useEffect(() => {
    // Background discovery must not move focus away from intake or gate controls.
    if (focusPhase === "confirmDelete") return;
    const heading = screen.current?.querySelector<HTMLElement>("h1, h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [focusPhase, question?.id]);

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
    if (isClientUpdateRequired(context.error))
      return (
        <ErrorPanel
          title={UI.status.updateTitle}
          message={
            context.storageIssue
              ? UI.recovery.clientUpdateStorageRequired
              : UI.recovery.clientUpdateRequired
          }
          retryLabel={UI.status.reload}
          onRetry={
            context.storageIssue ? undefined : () => window.location.reload()
          }
          onCancel={cancel}
        />
      );
    if (showingIntake)
      return (
        <>
          <Intake
            initialConfiguration={context.requestedConfiguration}
            onStart={onStart}
          />
          {state.matches({ history: "checkFailed" }) ? (
            <Alert>
              <AlertDescription>{UI.recovery.discoveryFailed}</AlertDescription>
            </Alert>
          ) : null}
          {history}
          {context.history.some(isUnfinishedSession) ||
          context.storageIssue ||
          context.error ? (
            <Button variant="outline" onClick={refreshHistory}>
              {UI.recovery.refresh}
            </Button>
          ) : null}
        </>
      );
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
    if (showingGate)
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
                  disabled={!choosing || context.storageIssue !== null}
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
            selectedOptionId={context.selectedOptionId}
            submitting={phase === "submittingAnswer"}
            isLast={view.answeredCount === view.totalQuestions - 1}
            error={phase === "answerFailed" ? errorCopy(context.error) : null}
            onSelect={(optionId) => send({ type: "SELECT_OPTION", optionId })}
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
      <div ref={screen} className="flex w-full max-w-lg flex-col gap-6 py-6">
        {context.storageIssue ? (
          <Alert>
            <AlertTitle>{UI.recovery.warningTitle}</AlertTitle>
            <AlertDescription>
              {storageCopy[context.storageIssue]}
              {context.sessionId ? <p>{UI.recovery.memoryWarning}</p> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {context.notice === DELETE_OUTCOME.CHANGED_STATE ? (
          <Alert>
            <AlertDescription>{UI.recovery.changedState}</AlertDescription>
          </Alert>
        ) : null}
        {renderScreen()}
      </div>
    </main>
  );
}
