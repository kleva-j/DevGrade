import type {
  DeleteSessionInput,
  SessionDeadlines,
  SessionMetadata,
} from "@/domain/sessionContracts";

import { deletionExpectation } from "@/machines/assessmentMachine";
import { Button } from "@workspace/ui/components/button";
import { SESSION_STATUS } from "@/domain/constants";

import {
  ClockCountdownIcon,
  PauseCircleIcon,
  ListChecksIcon,
  CircleHalfIcon,
  FileTextIcon,
  ClockIcon,
  TrashIcon,
  PlayIcon,
  EyeIcon,
} from "@phosphor-icons/react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";

import { DIFFICULTY_LABELS, FRAMEWORK_LABELS, UI } from "./copy";

const COMPACT_DEADLINE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

interface SessionDeadlinesProps {
  deadlines: SessionDeadlines;
}
export function SessionDeadlinesDisplay({ deadlines }: SessionDeadlinesProps) {
  const entries = [
    {
      label: UI.recovery.resumeUntil,
      shortLabel: UI.recovery.resume,
      expiresAt: deadlines.attemptExpiresAt,
      Icon: ClockCountdownIcon,
    },
    {
      label: UI.recovery.reportUntil,
      shortLabel: UI.recovery.report,
      expiresAt: deadlines.accessExpiresAt,
      Icon: FileTextIcon,
    },
  ];
  return (
    <TooltipProvider>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {entries.map(({ label, shortLabel, expiresAt, Icon }) => {
          const date = new Date(expiresAt);
          const fullLabel = `${label}: ${date.toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "long",
          })}`;
          return (
            <div
              key={label}
              className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
            >
              <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span aria-hidden="true">{shortLabel}</span>
                <span className="sr-only">{label}</span>
              </dt>
              <dd>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <time dateTime={expiresAt} dir="auto" tabIndex={0} />
                    }
                    aria-label={fullLabel}
                    className="cursor-default rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {date.toLocaleString(undefined, COMPACT_DEADLINE_FORMAT)}
                  </TooltipTrigger>
                  <TooltipContent>{fullLabel}</TooltipContent>
                </Tooltip>
              </dd>
            </div>
          );
        })}
      </dl>
    </TooltipProvider>
  );
}
export function sessionLabel(metadata: SessionMetadata) {
  return UI.recovery.configuration(
    FRAMEWORK_LABELS[metadata.configuration.framework],
    DIFFICULTY_LABELS[metadata.configuration.targetLevel],
    metadata.totalQuestions,
  );
}
export function isUnfinishedSession(session: SessionMetadata) {
  return session.effectiveStatus !== SESSION_STATUS.COMPLETED;
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
  const unfinished = sessions.filter(isUnfinishedSession);
  if (unfinished.length === 0) return null;
  return (
    <TooltipProvider>
      <section
        aria-label={UI.recovery.heading}
        className="flex w-full flex-col gap-3"
      >
        <h2 className="font-heading text-xl font-semibold">
          {UI.recovery.heading}
        </h2>

        <ul className="flex flex-col gap-2">
          {unfinished.map((session) => {
            const { label: status, Icon: StatusIcon } = !session.blocksCreation
              ? { label: UI.recovery.expired, Icon: ClockCountdownIcon }
              : session.effectiveStatus === SESSION_STATUS.ABANDONED
                ? { label: UI.recovery.inactive, Icon: PauseCircleIcon }
                : { label: UI.recovery.unfinished, Icon: CircleHalfIcon };
            const progress = UI.recovery.progress(
              session.answeredCount,
              session.totalQuestions,
            );
            return (
              <li key={session.sessionId}>
                <Card size="sm">
                  <CardHeader className="gap-x-3 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
                    <CardTitle className="min-w-0 self-center">
                      <div className="flex items-center gap-2">
                        <span
                          role="img"
                          aria-label={status}
                          title={status}
                          className="shrink-0 text-muted-foreground"
                        >
                          <StatusIcon aria-hidden="true" className="size-4" />
                        </span>
                        <h3 className="font-heading">
                          {sessionLabel(session)}
                        </h3>
                      </div>
                    </CardTitle>
                    <CardDescription className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-1 sm:col-start-1">
                      <span
                        title={progress}
                        className="inline-flex items-center gap-1.5"
                      >
                        <ListChecksIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        <span className="sr-only">{progress}</span>
                        <span
                          aria-hidden="true"
                          dir="ltr"
                          className="tabular-nums"
                        >
                          {UI.recovery.compactProgress(
                            session.answeredCount,
                            session.totalQuestions,
                          )}
                        </span>
                      </span>
                      <span
                        title={`${UI.recovery.attemptDeadline}: ${new Date(session.attemptExpiresAt).toLocaleString()}`}
                        className="inline-flex items-center gap-1.5"
                      >
                        <ClockIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        <span className="sr-only">
                          {UI.recovery.attemptDeadline}:{" "}
                        </span>
                        <time dateTime={session.attemptExpiresAt} dir="auto">
                          {new Date(session.attemptExpiresAt).toLocaleString(
                            undefined,
                            COMPACT_DEADLINE_FORMAT,
                          )}
                        </time>
                      </span>
                    </CardDescription>
                    <CardAction className="row-span-1 row-start-1 flex items-center gap-1 self-center sm:row-span-2 sm:row-start-1">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={UI.recovery.open}
                              onClick={() => onOpen(session.sessionId)}
                            />
                          }
                        >
                          <EyeIcon aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent>{UI.recovery.open}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={UI.recovery.remove}
                              onClick={() =>
                                onDelete(
                                  session.sessionId,
                                  deletionExpectation(session),
                                )
                              }
                            />
                          }
                        >
                          <TrashIcon aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent>{UI.recovery.remove}</TooltipContent>
                      </Tooltip>
                      {session.canResume ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon"
                                className="sm:w-auto sm:gap-1.5 sm:px-2.5"
                                aria-label={UI.recovery.resume}
                                onClick={() => onResume(session.sessionId)}
                              />
                            }
                          >
                            <PlayIcon
                              aria-hidden="true"
                              weight="fill"
                              data-icon="inline-start"
                            />
                            <span className="hidden sm:inline">
                              {UI.recovery.resume}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{UI.recovery.resume}</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  {session.blocksCreation && !session.canResume ? (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {UI.recovery.legacy}
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </TooltipProvider>
  );
}
