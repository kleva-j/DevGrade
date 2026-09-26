import type {
  DeleteSessionInput,
  SessionMetadata,
} from "@/domain/sessionContracts";
import { useEffect, useRef } from "react";

import { Button } from "@workspace/ui/components/button";
import { DELETE_EXPECTATION } from "@/domain/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { SessionDeadlinesDisplay, sessionLabel } from "./SessionHistory";
import { UI } from "./copy";

interface DeleteConfirmationProps {
  metadata?: SessionMetadata;
  expectedState: DeleteSessionInput["expectedState"];
  onConfirm: () => void;
  onCancel: () => void;
}
/** Inline confirmation replaces the flow, not a modal with a custom focus trap. */
export function DeleteConfirmation({
  metadata,
  expectedState,
  onConfirm,
  onCancel,
}: DeleteConfirmationProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  return (
    <Card
      role="region"
      aria-labelledby="delete-heading"
      aria-describedby="delete-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <CardHeader>
        <CardTitle>
          <h1 id="delete-heading" className="font-heading text-xl">
            {UI.recovery.deleteHeading}
          </h1>
        </CardTitle>
        <CardDescription id="delete-description">
          {UI.recovery.deleteDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p>
          {expectedState === DELETE_EXPECTATION.COMPLETED
            ? UI.recovery.deleteCompleted
            : UI.recovery.deleteUnfinished}
        </p>
        {metadata ? (
          <>
            <p className="font-medium">{sessionLabel(metadata)}</p>
            <SessionDeadlinesDisplay deadlines={metadata} />
          </>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-3">
        <Button ref={cancel} variant="outline" onClick={onCancel}>
          {UI.recovery.cancel}
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {UI.recovery.confirmDelete}
        </Button>
      </CardFooter>
    </Card>
  );
}
