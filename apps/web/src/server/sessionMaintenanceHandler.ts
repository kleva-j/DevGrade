import "@tanstack/react-start/server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { SessionMaintenanceResult } from "./sessionMaintenance";

function projectOperation(result: SessionMaintenanceResult["deletion"]) {
  return {
    count: result.count,
    batches: result.batches,
    cap: result.cap,
    failure: result.failure,
    backlog: result.backlog,
    backlogFailure: result.backlogFailure,
  };
}

type LogEvent =
  | { event: "session_maintenance_disabled" }
  | { event: "session_maintenance_failed" }
  | {
      event: "session_maintenance_finished";
      summary: SessionMaintenanceResult;
    };
interface HandlerDependencies {
  /** Must initialize the database only when called, never while constructing the handler. */
  run: () => Promise<SessionMaintenanceResult>;
  environment?: () => {
    CRON_SECRET?: string;
    SESSION_MAINTENANCE_ENABLED?: string;
  };
  log?: (level: "info" | "warn" | "error", event: LogEvent) => void;
}

function authorized(request: Request, secret: string | undefined): boolean {
  const header = request.headers.get("authorization") ?? "";
  const supplied =
    header.length <= 512
      ? /^Bearer ([A-Za-z0-9+/_-]+={0,2})$/i.exec(header)?.[1]
      : undefined;
  // Operators provision a random, high-entropy bearer-safe secret before activation.
  const configured =
    typeof secret === "string" &&
    secret.length >= 32 &&
    secret.length <= 256 &&
    /^[A-Za-z0-9+/_-]+={0,2}$/.test(secret);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const matches = timingSafeEqual(
    digest(supplied ?? ""),
    digest(configured ? secret : ""),
  );
  return configured && supplied !== undefined && matches;
}

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function createSessionMaintenanceHandler({
  run,
  environment = () => process.env,
  log = (level, event) => console[level](event),
}: HandlerDependencies) {
  function record(level: "info" | "warn" | "error", event: LogEvent) {
    // Logging failure cannot change the outcome of already-committed DB work.
    try {
      log(level, event);
    } catch {
      /* No raw logger exception may escape. */
    }
  }
  return async (request: Request): Promise<Response> => {
    try {
      const env = environment();
      if (!authorized(request, env.CRON_SECRET)) {
        return respond(401, { ok: false, error: "unauthorized" });
      }
      // TanStack falls back from HEAD to GET; never let HEAD execute maintenance.
      if (request.method !== "GET") {
        return respond(
          405,
          { ok: false, error: "method_not_allowed" },
          { Allow: "GET" },
        );
      }
      if (env.SESSION_MAINTENANCE_ENABLED !== "true") {
        record("info", { event: "session_maintenance_disabled" });
        return respond(200, { ok: true, enabled: false });
      }
      // No URL/body options: only the trusted server runner chooses work budgets.
      const result = await run();
      // Explicit wire/log projection: accidental extra runner fields stay private.
      const summary: SessionMaintenanceResult = {
        ok: result.ok,
        durationMs: result.durationMs,
        clockFailure: result.clockFailure,
        deletion: projectOperation(result.deletion),
        abandonment: projectOperation(result.abandonment),
      };
      const needsAttention = [summary.deletion, summary.abandonment].some(
        (operation) => operation.cap !== null || operation.backlog !== false,
      );
      record(!summary.ok ? "error" : needsAttention ? "warn" : "info", {
        event: "session_maintenance_finished",
        summary,
      });
      return respond(summary.ok ? 200 : 503, { ...summary, enabled: true });
    } catch {
      record("error", { event: "session_maintenance_failed" });
      return respond(503, { ok: false, error: "maintenance_failed" });
    }
  };
}

export const sessionMaintenanceHandler = createSessionMaintenanceHandler({
  run: async () => {
    const [{ getDb }, { runSessionMaintenance }] = await Promise.all([
      import("@/db/client"),
      import("./sessionMaintenance"),
    ]);
    return runSessionMaintenance(getDb());
  },
});
