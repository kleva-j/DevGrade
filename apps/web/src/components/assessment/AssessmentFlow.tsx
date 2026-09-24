import type { AssessmentConfiguration } from "@/domain/types";

import { useMachine } from "@xstate/react";
import { useEffect } from "react";

import { Card, CardContent, CardFooter } from "@workspace/ui/components/card";
import { assessmentServices } from "@/machines/assessmentServices";
import { assessmentMachine } from "@/machines/assessmentMachine";
import { Spinner } from "@workspace/ui/components/spinner";
import { Button } from "@workspace/ui/components/button";
import {
  AlertDescription,
  AlertTitle,
  Alert,
} from "@workspace/ui/components/alert";

import { QuestionRunner } from "./QuestionRunner";
import { Intake } from "./Intake";
import { Report } from "./Report";
import { UI } from "./copy";

interface LoadingPanelProps {
  message: string;
}

interface ErrorPanelProps {
  message: string;
  onRetry?: () => void;
  onRestart?: () => void;
}

/** Centered loading state with a spinner. */
function LoadingPanel({ message }: LoadingPanelProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-muted-foreground">
      <Spinner className="size-8" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** Error state with retry/restart affordances. */
function ErrorPanel({ message, onRetry, onRestart }: ErrorPanelProps) {
  return (
    <Card className="w-full max-w-md [--card-spacing:--spacing(6)]">
      <CardContent>
        <Alert variant="destructive">
          <AlertTitle>{UI.status.errorTitle}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </CardContent>
      {onRetry || onRestart ? (
        <CardFooter className="justify-end gap-3">
          {onRetry ? (
            <Button onClick={onRetry}>{UI.status.retry}</Button>
          ) : null}
          {onRestart ? (
            <Button variant="outline" onClick={onRestart}>
              {UI.status.restart}
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function AssessmentFlow() {
  const [state, send] = useMachine(assessmentMachine, {
    input: { services: assessmentServices },
  });

  // Integrity signal: count tab/window blur while answering (decision #8).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") send({ type: "FOCUS_LOSS" });
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [send]);

  const { context } = state;

  function onStart(configuration: AssessmentConfiguration) {
    send({ type: "CONFIGURE", configuration });
    send({ type: "START" });
  }

  function renderScreen() {
    if (state.matches("configuring")) {
      return (
        <Intake
          initialConfiguration={context.configuration}
          onStart={onStart}
        />
      );
    }

    if (state.matches("creatingSession")) {
      return <LoadingPanel message={UI.status.creating} />;
    }

    if (state.matches("setupFailed")) {
      return (
        <ErrorPanel
          message={context.error ?? UI.status.retry}
          onRetry={() => send({ type: "RETRY" })}
          onRestart={() => send({ type: "RESTART" })}
        />
      );
    }

    if (
      state.matches("answering") ||
      state.matches("submittingAnswer") ||
      state.matches("answerFailed")
    ) {
      const question = context.questions[context.currentIndex];
      if (!question) return null;
      return (
        <QuestionRunner
          question={question}
          index={context.currentIndex}
          total={context.questions.length}
          selectedOption={context.selectedOption}
          submitting={state.matches("submittingAnswer")}
          isLast={context.currentIndex >= context.questions.length - 1}
          error={state.matches("answerFailed") ? context.error : null}
          onSelect={(option) => send({ type: "SELECT_OPTION", option })}
          onSubmit={() => send({ type: "SUBMIT_ANSWER" })}
          onRetry={() => send({ type: "RETRY" })}
        />
      );
    }

    if (state.matches("completing")) {
      return <LoadingPanel message={UI.status.scoring} />;
    }

    if (state.matches("completeFailed")) {
      return (
        <ErrorPanel
          message={context.error ?? UI.status.retry}
          onRetry={() => send({ type: "RETRY" })}
        />
      );
    }

    if (state.matches("completed") && context.result) {
      const questionsById = new Map(context.questions.map((q) => [q.id, q]));
      const surveyPhase = state.matches({ completed: "submittingSurvey" })
        ? "submitting"
        : state.matches({ completed: "surveyThanks" })
          ? "thanks"
          : "prompt";
      return (
        <Report
          result={context.result}
          questionsById={questionsById}
          survey={{
            phase: surveyPhase,
            error: context.surveyError,
            onSubmit: (rating) => send({ type: "SUBMIT_SURVEY", rating }),
          }}
          onRestart={() => send({ type: "RESTART" })}
        />
      );
    }

    return null;
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      {renderScreen()}
    </main>
  );
}
