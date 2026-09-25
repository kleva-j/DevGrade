import type {
  DeleteSessionInput,
  SessionDeadlines,
  SessionMetadata,
} from "@/domain/sessionContracts";
import { SESSION_STATUS } from "@/domain/constants";
import { deletionExpectation } from "@/machines/assessmentMachine";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { DIFFICULTY_LABELS, FRAMEWORK_LABELS, UI } from "./copy";

interface SessionDeadlinesProps {
  deadlines: SessionDeadlines;
}
export function SessionDeadlinesDisplay({ deadlines }: SessionDeadlinesProps) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">{UI.recovery.resumeUntil}</dt>
        <dd>
          <time dateTime={deadlines.attemptExpiresAt}>
            {new Date(deadlines.attemptExpiresAt).toLocaleString()}
          </time>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{UI.recovery.reportUntil}</dt>
        <dd>
          <time dateTime={deadlines.accessExpiresAt}>
            {new Date(deadlines.accessExpiresAt).toLocaleString()}
          </time>
        </dd>
      </div>
    </dl>
  );
}
export function sessionLabel(metadata: SessionMetadata) {
  return UI.recovery.configuration(
    FRAMEWORK_LABELS[metadata.configuration.framework],
    DIFFICULTY_LABELS[metadata.configuration.targetLevel],
    metadata.totalQuestions,
  );
}
interface SessionHistoryProps {
  sessions: SessionMetadata[];
  onOpen: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onDelete: (
    sessionId: string,
    expectedState: DeleteSessionInput["expectedState"],
  ) => void;
}
export function SessionHistory({
  sessions,
  onOpen,
  onResume,
  onDelete,
}: SessionHistoryProps) {
  return (
    <section
      aria-label={UI.recovery.heading}
      className="flex w-full flex-col gap-4"
    >
      <h2 className="font-heading text-xl font-semibold">
        {UI.recovery.heading}
      </h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{UI.recovery.empty}</p>
      ) : null}
      <ul className="flex flex-col gap-4">
        {sessions.map((session) => {
          const completed =
            session.effectiveStatus === SESSION_STATUS.COMPLETED;
          const status = completed
            ? UI.recovery.savedReport
            : !session.blocksCreation
              ? UI.recovery.expired
              : session.effectiveStatus === SESSION_STATUS.ABANDONED
                ? UI.recovery.inactive
                : UI.recovery.unfinished;
          return (
            <li key={session.sessionId}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3 className="font-heading">{sessionLabel(session)}</h3>
                  </CardTitle>
                  <CardDescription>
                    {UI.recovery.progress(
                      session.answeredCount,
                      session.totalQuestions,
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <Badge variant="secondary">{status}</Badge>
                  </div>
                  <SessionDeadlinesDisplay deadlines={session} />
                  {!completed &&
                  session.blocksCreation &&
                  !session.canResume ? (
                    <p className="text-sm text-muted-foreground">
                      {UI.recovery.legacy}
                    </p>
                  ) : null}
                </CardContent>
                <CardFooter className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onOpen(session.sessionId)}
                  >
                    {completed ? UI.recovery.report : UI.recovery.open}
                  </Button>
                  {session.canResume ? (
                    <Button onClick={() => onResume(session.sessionId)}>
                      {UI.recovery.resume}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={() =>
                      onDelete(session.sessionId, deletionExpectation(session))
                    }
                  >
                    {UI.recovery.remove}
                  </Button>
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
