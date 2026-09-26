import type { AnswerInput, AssessmentConfiguration } from "@/domain/types";
import type {
  AssessmentView,
  DeleteSessionInput,
  SessionCredential,
  SessionMetadata,
  SessionView,
} from "@/domain/sessionContracts";
import type { AssessmentApi } from "./createSessionAdapter";
import type {
  SavedSessionHandle,
  SessionLock,
  SessionStorage,
  StorageIssue,
  StorageScan,
} from "./sessionStorage";

import {
  DELETE_OUTCOME,
  MAX_KNOWN_SESSION_CREDENTIALS,
  SESSION_DISCOVERY,
} from "@/domain/constants";
import { ERROR_CODE } from "@/server/errors";
import { AssessmentClientError } from "./createSessionAdapter";
import { STORAGE_ISSUE, sameCredential } from "./sessionStorage";

export interface DiscoveryCheck {
  history: SessionMetadata[];
  storageIssue: StorageIssue | null;
  created: AssessmentView | null;
}
export class RecoveryUnavailableError extends Error {}
export class DiscoveryIncompleteError extends Error {}

export function isUnavailableError(error: unknown) {
  return (
    error instanceof RecoveryUnavailableError ||
    (error instanceof AssessmentClientError &&
      (error.code === ERROR_CODE.NOT_FOUND ||
        error.code === ERROR_CODE.ACCESS_EXPIRED))
  );
}
export function needsReconciliation(error: unknown) {
  return (
    error instanceof AssessmentClientError &&
    [
      ERROR_CODE.CONFLICT,
      ERROR_CODE.SESSION_COMPLETED,
      ERROR_CODE.ATTEMPT_EXPIRED,
      ERROR_CODE.LEGACY_UNRESTORABLE,
      ERROR_CODE.LEGACY_SUMMARY_AVAILABLE,
    ].some((code) => code === error.code)
  );
}

/** Owns credentials, not assessment state. UI/machine callers refer only to IDs. */
export function createSessionRecovery(
  api: AssessmentApi,
  storage: SessionStorage,
  lock: SessionLock,
) {
  const memory = new Map<string, SavedSessionHandle>();
  let warning: StorageIssue | null = null;

  function scan() {
    let result: StorageScan;
    try {
      result = storage.scan();
    } catch {
      result = { handles: [], issue: STORAGE_ISSUE.UNAVAILABLE };
    }
    let issue = result.issue;
    for (const handle of result.handles) {
      const previous = memory.get(handle.sessionId);
      if (previous && !sameCredential(previous, handle)) {
        issue = STORAGE_ISSUE.CORRUPT;
      } else {
        memory.set(handle.sessionId, { ...previous, ...handle });
      }
    }
    // Missing/inaccessible disk state must never erase an in-memory credential.
    const handles = [...memory.values()];
    if (handles.length > MAX_KNOWN_SESSION_CREDENTIALS)
      issue = STORAGE_ISSUE.LIMIT;
    return { handles, issue };
  }
  function credential(sessionId: string): SessionCredential {
    const handle = memory.get(sessionId);
    if (!handle) throw new RecoveryUnavailableError();
    return { sessionId: handle.sessionId, sessionToken: handle.sessionToken };
  }
  function remove(known: SessionCredential) {
    const current = memory.get(known.sessionId);
    if (current && sameCredential(current, known))
      memory.delete(known.sessionId);
    try {
      warning = storage.remove(known) ?? warning;
    } catch {
      warning = STORAGE_ISSUE.UNAVAILABLE;
    }
  }
  function remember(handle: SavedSessionHandle) {
    memory.set(handle.sessionId, handle);
    try {
      warning = storage.save(handle) ?? warning;
    } catch {
      warning = STORAGE_ISSUE.FULL;
    }
  }
  async function authenticated<T>(
    sessionId: string,
    operation: (known: SessionCredential) => Promise<T>,
  ) {
    const known = credential(sessionId);
    try {
      return await operation(known);
    } catch (error) {
      if (isUnavailableError(error)) await lock(async () => remove(known));
      throw error;
    }
  }
  async function read(
    sessionId: string,
    resume: boolean,
  ): Promise<SessionView> {
    const view = await authenticated(sessionId, (known) =>
      resume ? api.resumeSession(known) : api.getSession(known),
    );
    await lock(async () => {
      const handle = memory.get(sessionId);
      if (handle)
        remember({
          ...handle,
          attemptExpiresAt: view.attemptExpiresAt,
          accessExpiresAt: view.accessExpiresAt,
          hint: "configuration" in view ? view.configuration : handle.hint,
        });
    });
    return view;
  }
  return {
    get warning() {
      return warning;
    },
    /** The complete gate transaction; never hold this lock across a human choice. */
    check(
      configuration: AssessmentConfiguration | null,
      signal?: AbortSignal,
    ): Promise<DiscoveryCheck> {
      return lock(async () => {
        signal?.throwIfAborted();
        const { handles, issue } = scan();
        warning = issue;
        if (issue === STORAGE_ISSUE.LIMIT)
          return { history: [], storageIssue: issue, created: null };
        const credentials = handles.map(({ sessionId, sessionToken }) => ({
          sessionId,
          sessionToken,
        }));
        const discovered = await api.discoverSessions(credentials);
        signal?.throwIfAborted();
        // Fail closed if the transport ever omits/duplicates an entry.
        const ids = discovered.sessions.map((entry) =>
          entry.kind === SESSION_DISCOVERY.AVAILABLE
            ? entry.metadata.sessionId
            : entry.sessionId,
        );
        if (
          ids.length !== credentials.length ||
          new Set(ids).size !== ids.length ||
          credentials.some((c) => !ids.includes(c.sessionId))
        ) {
          throw new DiscoveryIncompleteError();
        }
        const history: SessionMetadata[] = [];
        for (const entry of discovered.sessions) {
          if (entry.kind === SESSION_DISCOVERY.AVAILABLE) {
            history.push(entry.metadata);
            const handle = memory.get(entry.metadata.sessionId)!;
            remember({
              ...handle,
              attemptExpiresAt: entry.metadata.attemptExpiresAt,
              accessExpiresAt: entry.metadata.accessExpiresAt,
              hint: entry.metadata.configuration,
            });
          } else {
            remove(credentials.find((c) => c.sessionId === entry.sessionId)!);
          }
        }
        history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (!configuration || history.some((entry) => entry.blocksCreation)) {
          return { history, storageIssue: warning, created: null };
        }
        // Re-probe on every creation attempt; blocked/corrupt/full storage is not permission to bypass.
        try {
          warning = warning ?? storage.preflight();
        } catch {
          warning = STORAGE_ISSUE.UNAVAILABLE;
        }
        if (warning) return { history, storageIssue: warning, created: null };
        signal?.throwIfAborted();
        try {
          // Supply the FULL checked list again. The server rechecks under parent locks.
          const { sessionToken, ...created } = await api.createSession(
            configuration,
            credentials,
          );
          // Keep credentials even if cancellation raced an already-sent creation.
          remember({
            sessionId: created.sessionId,
            sessionToken,
            attemptExpiresAt: created.attemptExpiresAt,
            accessExpiresAt: created.accessExpiresAt,
            hint: created.configuration,
          });
          return { history, storageIssue: warning, created };
        } catch (error) {
          if (
            error instanceof AssessmentClientError &&
            error.failure.code === ERROR_CODE.EXISTING_ATTEMPT
          ) {
            const byId = new Map(
              history.map((entry) => [entry.sessionId, entry]),
            );
            for (const blocker of error.failure.blockers)
              byId.set(blocker.sessionId, blocker);
            return {
              history: [...byId.values()],
              storageIssue: warning,
              created: null,
            };
          }
          throw error;
        }
      });
    },
    get: (sessionId: string) => read(sessionId, false),
    resume: (sessionId: string) => read(sessionId, true),
    answer: (sessionId: string, answer: AnswerInput) =>
      authenticated(sessionId, (known) =>
        api.submitAnswer({ ...known, answer }),
      ),
    complete: (sessionId: string) =>
      authenticated(sessionId, (known) => api.completeSession(known)),
    survey: (sessionId: string, rating: number) =>
      authenticated(sessionId, (known) =>
        api.submitSurvey({ ...known, rating }),
      ),
    delete: (
      sessionId: string,
      expectedState: DeleteSessionInput["expectedState"],
    ) =>
      lock(async () => {
        const known = credential(sessionId);
        try {
          const result = await api.deleteSession({ ...known, expectedState });
          if (result.kind === DELETE_OUTCOME.DELETED) remove(known);
          return result;
        } catch (error) {
          if (isUnavailableError(error)) remove(known);
          throw error;
        }
      }),
  };
}
export type SessionRecovery = ReturnType<typeof createSessionRecovery>;
