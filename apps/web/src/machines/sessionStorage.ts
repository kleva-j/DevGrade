import { z } from "zod";

import type {
  SessionCredential,
  SessionDeadlines,
  SessionMetadata,
} from "@/domain/sessionContracts";
import { DIFFICULTIES, FRAMEWORKS } from "@/domain/constants";

export const SESSION_STORAGE_PREFIX = "devgrade.session.";
export const SESSION_STORAGE_VERSION = 1;
export const SESSION_LOCK_NAME = "devgrade.session-lifecycle";
export const STORAGE_ISSUE = {
  UNAVAILABLE: "storage_unavailable",
  CORRUPT: "storage_corrupt",
  FULL: "storage_full",
  LIMIT: "credential_limit",
} as const;
export type StorageIssue = (typeof STORAGE_ISSUE)[keyof typeof STORAGE_ISSUE];

/** Hints are presentation only. Every eligibility decision comes from the server. */
export interface SavedSessionHandle
  extends SessionCredential, Partial<SessionDeadlines> {
  hint?: SessionMetadata["configuration"];
}
export interface StorageScan {
  handles: SavedSessionHandle[];
  issue: StorageIssue | null;
}
export interface SessionStorage {
  scan: () => StorageScan;
  preflight: () => StorageIssue | null;
  save: (handle: SavedSessionHandle) => StorageIssue | null;
  remove: (credential: SessionCredential) => StorageIssue | null;
}
export type StoragePort = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>;

const credentialSchema = z.object({
  sessionId: z
    .uuid()
    .length(36)
    .transform((id) => id.toLowerCase()),
  sessionToken: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
const handleSchema = credentialSchema
  .extend({
    version: z.literal(SESSION_STORAGE_VERSION),
    attemptExpiresAt: z.iso.datetime().optional(),
    accessExpiresAt: z.iso.datetime().optional(),
    hint: z
      .object({
        framework: z.enum(FRAMEWORKS),
        targetLevel: z.enum(DIFFICULTIES),
        questionCount: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function sameCredential(a: SessionCredential, b: SessionCredential) {
  return a.sessionId === b.sessionId && a.sessionToken === b.sessionToken;
}

/** No browser globals are accessed until an operation runs (including SSR). */
export function createSessionStorage(
  getStorage: () => StoragePort | undefined = () =>
    typeof window === "undefined" ? undefined : window.localStorage,
): SessionStorage {
  function port() {
    const storage = getStorage();
    if (!storage) throw new Error(STORAGE_ISSUE.UNAVAILABLE);
    return storage;
  }
  function encode(handle: SavedSessionHandle) {
    // Explicit projection: never persist a caller's questions, answers, report or actor.
    return JSON.stringify({
      version: SESSION_STORAGE_VERSION,
      sessionId: handle.sessionId,
      sessionToken: handle.sessionToken,
      attemptExpiresAt: handle.attemptExpiresAt,
      accessExpiresAt: handle.accessExpiresAt,
      hint: handle.hint && {
        framework: handle.hint.framework,
        targetLevel: handle.hint.targetLevel,
        questionCount: handle.hint.questionCount,
      },
    });
  }
  return {
    scan() {
      const handles: SavedSessionHandle[] = [];
      let issue: StorageIssue | null = null;
      try {
        const storage = port();
        // Snapshot keys before any eventual removals; never rely on an active pointer.
        const keys = Array.from({ length: storage.length }, (_, i) =>
          storage.key(i),
        );
        for (const key of keys) {
          if (!key?.startsWith(SESSION_STORAGE_PREFIX)) continue;
          try {
            const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
            const credential = credentialSchema.safeParse(value);
            if (
              !credential.success ||
              key !== SESSION_STORAGE_PREFIX + credential.data.sessionId
            ) {
              issue = STORAGE_ISSUE.CORRUPT;
              continue;
            }
            const parsed = handleSchema.safeParse(value);
            if (parsed.success) {
              const { version: _version, ...handle } = parsed.data;
              handles.push(handle);
            } else {
              // A damaged hint/version must not hide a recoverable blocker.
              handles.push(credential.data);
              issue = STORAGE_ISSUE.CORRUPT;
            }
          } catch {
            issue = STORAGE_ISSUE.CORRUPT;
          }
        }
      } catch {
        issue = STORAGE_ISSUE.UNAVAILABLE;
      }
      return { handles, issue };
    },
    preflight() {
      try {
        const storage = port();
        // Separate random key, large enough for a normal handle. Never overwrite data.
        const key = `devgrade.storage-probe.${crypto.randomUUID()}`;
        try {
          storage.setItem(key, " ".repeat(1024));
          if (storage.getItem(key)?.length !== 1024) return STORAGE_ISSUE.FULL;
        } finally {
          storage.removeItem(key);
        }
        return null;
      } catch {
        return STORAGE_ISSUE.FULL;
      }
    },
    save(handle) {
      try {
        const storage = port();
        const key = SESSION_STORAGE_PREFIX + handle.sessionId;
        const existing = storage.getItem(key);
        if (existing !== null) {
          const parsed = handleSchema.safeParse(JSON.parse(existing));
          if (!parsed.success || !sameCredential(parsed.data, handle))
            return STORAGE_ISSUE.CORRUPT;
        }
        const encoded = encode(handle);
        storage.setItem(key, encoded);
        return storage.getItem(key) === encoded ? null : STORAGE_ISSUE.FULL;
      } catch {
        return STORAGE_ISSUE.FULL;
      }
    },
    remove(credential) {
      try {
        const storage = port();
        const key = SESSION_STORAGE_PREFIX + credential.sessionId;
        const raw = storage.getItem(key);
        if (raw === null) return null;
        const parsed = credentialSchema.safeParse(JSON.parse(raw));
        if (!parsed.success || !sameCredential(parsed.data, credential))
          return STORAGE_ISSUE.CORRUPT;
        storage.removeItem(key);
        return storage.getItem(key) === null ? null : STORAGE_ISSUE.UNAVAILABLE;
      } catch {
        return STORAGE_ISSUE.UNAVAILABLE;
      }
    },
  };
}

export type SessionLock = <T>(operation: () => Promise<T>) => Promise<T>;

/** Browser-wide when supported; still serialize operations in this tab otherwise. */
export function createSessionLock(
  getLocks: () => Pick<LockManager, "request"> | undefined = () =>
    typeof navigator === "undefined" ? undefined : navigator.locks,
): SessionLock {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>) => {
    const run = async () => {
      const locks = getLocks();
      return locks ? locks.request(SESSION_LOCK_NAME, operation) : operation();
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}
