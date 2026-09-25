# Session lifecycle completion plan

**Status:** daily-cleanup policy approved for the plan; implementation not started. Resume within 24 hours, report access for up to seven days, then deletion by the next successful daily cleanup run.
**Revised:** 2026-09-25.
**Baseline:** free Quick 8 / Standard 16 / Deep 32 assessments, PostgreSQL, TanStack Start/Nitro, and XState. See [current behavior](sessions-and-evaluation.md) and the [PRD](../prd.md).

## 1. Revised requirements

This revision supersedes the earlier 90-day proposal, weekly cleanup, and strict seven-day physical-retention maximum. The user approved the simpler policy: a fixed seven-day access cutoff and deletion-eligibility threshold, followed by daily cleanup. This is not an exact seven-day physical-erasure guarantee.

> **30 minutes: inactive. 24 hours from creation: unfinished attempt expires. Seven days from creation: access ends and the session becomes eligible for deletion. Daily cleanup removes eligible records.**

| Concern | Revised decision |
| --- | --- |
| Abandonment | At 30 minutes without qualifying server activity, an unfinished attempt is effectively `abandoned`. It is inactive, not deleted; it remains resumable only within the 24-hour attempt window. |
| Resume window | `attemptExpiresAt = createdAt + 24 hours`. Reject resume at or after the deadline. Activity never resets this deadline. |
| Active attempts | Recommended consistent enforcement: also reject **new answers and first completion** at/after the 24-hour deadline. Leaving a tab open must not bypass the attempt lifetime. |
| Access and deletion eligibility | `accessExpiresAt = createdAt + 7 × 24 hours`, for every status. At this point normal reads/writes are denied and the record becomes eligible for daily deletion. No extension on activity, completion, survey, or report views. |
| Saved reports | Reports completed within the attempt window are available for **up to seven days from creation**, never seven days from completion. Use `accessExpiresAt` for the displayed report deadline; no automatic early purge is planned. Explicit candidate deletion can remove a report sooner. |
| Starting a new attempt | When a stored, authenticated unfinished attempt younger than 24 hours is found, inform the candidate and require **Resume** or **Delete**. Canceling the prompt cancels creation; there is no “Start another anyway” bypass. |
| Delete | Explicitly confirmed, authenticated **server-side cascading deletion**. Merely forgetting the browser bookmark does not satisfy this choice. |
| Daily cleanup | Daily at 03:00 UTC, `0 3 * * *`: delete sessions of every status with `createdAt <= now − 7 days`, cascading to their answers, results, snapshots, and surveys. Run independently of browser traffic. |
| Ownership/discovery | Discover attempts using credentials stored in the same browser and validate them on the server. The anonymous rate-limit ID is not permission to retrieve or delete another session. |

**Precise boundaries:** “within 24 hours” means `now < attemptExpiresAt`; exactly 24 hours is expired. At `now >= accessExpiresAt`, refuse ordinary access and include the record in cleanup eligibility. Use elapsed UTC durations and server time, not calendar days or client clocks.

### What happens over time

| Age/state | Allowed behavior |
| --- | --- |
| Unfinished, younger than 24 hours | Resume, submit new answers, complete, or delete. If found during creation, show the Resume/Delete gate. |
| Unfinished, 24 hours to less than seven days | No resume, new answers, or first completion. Show minimal expired-attempt metadata and allow deletion; it does not block a new assessment. No partial score is automatically awarded. |
| Completed before 24 hours, younger than seven days | Read the saved report, submit/update its survey, or delete. It does not block a new assessment. |
| Any status, seven days or older | Refuse normal access. Delete during the daily cleanup; authenticated erasure may remove it sooner if still present. |

A completion retry after 24 hours may return a report **already committed before the cutoff**. That is retrieval, not late first completion or rescoring. Neither deadline slides forward.

## 2. Approved access and daily-deletion policy

> Assessments can be resumed within 24 hours of creation. Saved reports are accessible for up to seven days. Session records aged seven days or older are deleted by the next daily cleanup run.

This explicitly replaces the strict seven-day physical-retention maximum. Access ends at seven days even if the scheduled deletion has not happened yet. No early-purge safety margin, additional high-frequency scheduler, or weekly reconciliation job is needed.

### Expected deletion timing

A session created Monday at 10:00 becomes eligible the following Monday at 10:00. With a daily 03:00 UTC job, it is normally deleted on Tuesday at 03:00—seven days and 17 hours after creation.

Normal record age at deletion is approximately **7–8 days**. Vercel Hobby's hour-level scheduling precision can add variation: under healthy operation and no backlog, the gap between eligibility and invocation can approach 25 hours. Missed delivery, failed jobs, locked rows, and batch limits can delay deletion further. These are not promises of a strict maximum or an extra access window.

Every run queries all eligible records, not only those that became eligible since a previous run. Repeated invocations are safe. Log failures and capped runs, and provide an authorized rerun/catch-up procedure so a missed or incomplete run can be retried without waiting for a new daily schedule. The scheduler's own retry limitations are covered in §8.

### Data scope and backups

Deleting a session cascades to its answers, overall/pillar results, surveys, and private/public snapshots. Eligibility for all these child records is anchored to the **parent's original creation time**, not their own insertion time. Question-bank content is not removed.

A PostgreSQL `DELETE` removes live rows; it is not an immediate physical-media erasure guarantee for MVCC tuples, WAL/PITR data, replicas, or backups. Document provider-managed backup/replica retention separately, do not log payloads or credentials, and enforce expiry/purge expired records before reopening a restored database. Do not advertise that this daily job erases all backup copies at seven days.

The remaining deployment checks are ordinary scheduler registration, protected access, database capacity, backlog handling, and backup-policy documentation. No separate exact-deadline deletion infrastructure is required by this revision. This document approves a plan, not implementation, deployment changes, or destructive activation.

## 3. Foundations to preserve

Keep existing tables, the three database statuses, weighted scoring, all length presets, server functions, and the XState-driven flow. No accounts, billing tiers, Redis, queue, or general question-versioning subsystem is needed for the agreed parts.

| Current implementation | Required change |
| --- | --- |
| `markAbandonedSessions` is an unbounded helper without a repository scheduler. | Bounded sweeping, request-derived idle state, and reactivation only within 24 hours. |
| Token checks have no age restriction. | Operation-specific attempt and retention checks. |
| Only the anonymous client ID survives browser refresh. | Minimal credential bookmarks and server-authoritative restoration/discovery. |
| Creation does not consider an earlier unfinished attempt. | Pre-creation discovery, Resume/Delete UX, and a final server recheck of supplied known credentials. |
| Selected IDs point to mutable question rows. | Private immutable question content at creation. |
| Aggregate results persist, but report text is rebuilt from live content. | Immutable report snapshot and authenticated retrieval. |
| Answer/completion retries can fail after a persisted operation loses its response. | Idempotent acknowledgements/completion and server reconciliation. |
| Token-based erasure exists only as a DB helper. | Expose an authenticated deletion operation for the requested flow. |

Sources: [DB helpers](../apps/web/src/db/queries.ts), [schema](../apps/web/src/db/schema.ts), [assessment service](../apps/web/src/server/assessmentService.ts), [machine](../apps/web/src/machines/assessmentMachine.ts), [report UI](../apps/web/src/components/assessment/Report.tsx).

## 4. Central policy and durable data

### 4.1 Two deadlines, not one ambiguous expiry

In `domain/constants.ts`, define `SESSION_RESUME_WINDOW_HOURS = 24` and `SESSION_RETENTION_DAYS = 7`, alongside `ABANDON_AFTER_MINUTES = 30`. Here `SESSION_RETENTION_DAYS` sets the normal-access cutoff and cleanup-eligibility age, not a guaranteed physical storage maximum. Centralize repeated status, error, storage, and UI strings; keep batch/time budgets in validated maintenance configuration.

Add a pure `domain/sessionLifecycle.ts` module taking session timestamps/state and a supplied time. It derives:

- `attemptExpiresAt = createdAt + 24 hours` and `accessExpiresAt = createdAt + 7 days`; the latter also determines cleanup eligibility.
- Effective inactive state for unfinished attempts after 30 minutes.
- Whether resume, new answer, first completion, report read, survey, or deletion is allowed.
- Whether the session blocks creation: unfinished and strictly younger than 24 hours. An inactive/abandoned session still blocks while it is inside this window.

No new stored count, current-question index, or `expired` DB status is needed. Derive the two policy deadlines instead of adding duplicate expiry columns. Return `attemptExpiresAt` and `accessExpiresAt` explicitly; neither is a promised physical-deletion timestamp. Future policy changes must define their effect on existing records deliberately.

Creation, explicit resume, newly accepted answers, and successful first completion refresh activity. Reads, automatic page restoration, invalid requests, duplicate acknowledgements, and report/survey reads do not. **Activity never extends either deadline.** No heartbeat is required.

Use fresh PostgreSQL time after obtaining mutation locks; transaction-start `now()` can be stale after waiting. The current sweep's strict `<` comparison changes to inclusive `<=` intentionally. Boundary tests must cover it.

### 4.2 Immutable question and report snapshots

Add nullable, versioned JSONB fields using generated/reviewed Drizzle migrations:

| Proposed field | Purpose |
| --- | --- |
| `test_sessions.questionSnapshot` | Ordered selected questions, public presentation, private answer keys, weights, explanations, provenance, and assessment-relevant pillar metadata. Capture from the same objects used for creation. **Never serialize the private snapshot to the browser.** |
| `session_results.reportSnapshot` | Safe, self-contained awarded report: result, public question presentation in selected order, saved pillar labels/guidance, completion timestamp, and format/scoring identifiers. No token or private answer-key field. |

The first protects the 24-hour unfinished assessment; the second preserves its report during the seven-day window. At 8–32 questions per session, this is simpler than introducing question revisions.

- Snapshot IDs must match `selectedQuestionIds` exactly; selected IDs remain authoritative for membership, order, and total.
- New attempts use saved grading inputs for both answer checks and completion. Bank edits/reseeding cannot change them.
- Write normalized result columns, pillar rows, and report JSON from one computed result in one transaction.
- Retrieval never rescores. Render saved assessment findings and pillar metadata, not current bank metadata. Generic UI styling/copy may evolve.
- Keep mutable survey state separate. Validate snapshot format versions; keep v1 scoring behavior for any unfinished v1 attempt if rules change later.
- Preserve question/category identities required by existing foreign keys; retire bank content instead of deleting referenced rows.

### 4.3 Indexes

Add `(created_at, id)` for retention and `(status, last_activity_at, id)` for idle sweeping; review whether the latter replaces the current status-only index. Retain the client/time rate-limit index. Existing child indexes support cascades—do not duplicate them.

## 5. Service contracts, deletion, and concurrency

Extend the existing `createAssessmentService(db)` and TanStack Start server functions, not a second assessment REST API.

### 5.1 Authentication and operation checks

- Require valid session ID/token credentials for discovery details, resume, report reads, and deletion. Validate their shapes before DB access.
- `rawClientId` stays rate-limit metadata. Do not retrieve, list, or delete sessions merely because their client-ID hash matches.
- Authenticate before returning expiry details; wrong token and unknown ID remain indistinguishable.
- Before `accessExpiresAt`, branch by completed state: completed attempts support report access; unfinished attempts require age below 24 hours for resume/new answers/first completion.
- At/after `accessExpiresAt`, refuse normal access even while a row waits for daily cleanup. Explicit authenticated deletion can still remove that row. Apply fresh-time checks after lock acquisition so waiting requests do not bypass the access cutoff.
- Return safe typed result/error envelopes through server-function adapters, including an actionable existing-attempt outcome. Do not parse message strings in XState or expose DB errors.
- Use `Cache-Control: no-store`; no credentials in URLs, shared caches, logs, or analytics.

### 5.2 Transaction discipline

Answer, resume, completion, survey, and deletion transactions lock the authenticated parent row first (`FOR UPDATE`), then check fresh time and lifecycle rules, then read/write children and status, then commit before acknowledging success.

Cleanup locks the same parent rows before mutation. Operations touching multiple known parents acquire locks in deterministic ID order. Use proper Drizzle transaction-aware helper types, not casts to the root `Db`.

Use a short read-only `REPEATABLE READ` transaction for multi-query session/report views. Default `READ COMMITTED` alone does not give one coherent snapshot. An already-running read cannot be recalled after a later deletion; document request-time authorization semantics rather than promising that.

### 5.3 Restoration and report retrieval

`getSession(credential)` returns one of:

| Result | Data |
| --- | --- |
| `assessment` | Saved configuration, effective status, both deadlines, safe ordered questions, accepted selections/durations without correctness, first unanswered ID or `null`. Available only within the attempt window. |
| `attempt_expired` | Minimal authenticated metadata/deadlines and delete/start-new options. No resume payload or automatically generated partial report. |
| `report` | Saved full report, `accessExpiresAt`, and survey rating. |
| `legacy_summary` | Persisted aggregate/pillar scores and deadlines, clearly without historical question review. |
| `legacy_unrestorable` | Unfinished legacy metadata indicating resume is unavailable. If younger than 24 hours, it still requires deletion before another known attempt is created. |

Find the first unanswered ID by set membership, not answer count. Do not resample or substitute missing content.

`resumeSession(credential)` reactivates an eligible unfinished session and returns authoritative progress. If already completed, return the report without touching activity. If all answers are saved but no report exists, first completion is permitted **only before 24 hours**. At/after 24 hours it is an expired unfinished attempt, not a late-completion loophole.

One completed branch of `getSession` is sufficient for saved-report retrieval; a separate report endpoint is unnecessary initially.

### 5.4 Actual deletion

Add `deleteSession(credential)` and a POST server-function wrapper around parent-locked deletion. Delete the parent and let existing foreign keys cascade to answers, results, pillar scores, surveys, and snapshot fields. Do not delete bank content.

- Require a confirmation explaining that the attempt and accepted answers will be permanently removed.
- Close races with completion/resume: if the attempt completed meanwhile, return a changed-state outcome and show the saved report rather than silently deleting it under an unfinished-attempt confirmation.
- Only remove the browser handle and continue creation after confirmed deletion/unavailability.
- If deletion's response is lost, retry/recheck. An already-missing row may return a generic unavailable result; no token tombstones are needed. A remaining row with invalid credentials must never be deleted.
- On transient deletion failure, retain the handle and prompt; do not create another attempt.

### 5.5 Safe retries

- Same accepted option: acknowledge the original answer without changing timing, status, or activity. For an unfinished attempt, normal attempt expiry still applies. A completed report can instead be retrieved during retention without further answer processing.
- Different option already accepted: conflict; reconcile from `getSession` rather than overwrite.
- Completion: under the parent lock, return an existing saved report if present and retained. Otherwise enforce the 24-hour deadline, verify the accepted-ID set equals the selected set, and save exactly once in presentation order.
- Keep uniqueness constraints as backstops; do not continue querying after catching an aborted-transaction uniqueness error.
- Return authoritative next-question/progress information so simultaneous tabs cannot blindly advance using `index + 1`.

A lost **creation** response before receiving credentials remains a separate gap. Request-key idempotency is deferred. Local storage failure after receiving credentials must not be mistaken for server failure or trigger automatic duplicate creation.

## 6. Resume-or-delete gate before creation

This gate replaces the earlier “Continue / Start another” recommendation.

### Required flow

1. Candidate requests a new assessment with the desired configuration.
2. Read all known per-session credentials from browser storage, not just the active pointer and not just the chosen framework/level/length.
3. Resolve their server statuses/deadlines through bounded credential-authenticated metadata checks. Local flags/clock values are hints, not authority. Complete discovery before deciding there is no blocking session.
4. If a stored unfinished attempt with age **less than 24 hours** is found, **do not create a new row**. Show its original level/length, accepted progress, and resume deadline.
5. Offer **Resume assessment** or **Delete assessment**. Closing/canceling the prompt cancels the new-session request; it does not bypass the gate.
6. Resume loads the original assessment/configuration, not the newly selected settings. An all-answered unfinished attempt proceeds to completion only if still within 24 hours.
7. Delete requires confirmation, then a successful server deletion. Recheck other stored attempts; create the new assessment with the requested settings only when none still blocks.

Additional cases:

- `abandoned` within 24 hours is unfinished and blocks creation.
- Completed attempts and unfinished attempts aged 24 hours or more do not block. Preserve completed-report access until `accessExpiresAt`.
- Multiple historical blockers are handled one at a time or in a list; no silent deletion or automatic resume.
- An unexpired legacy attempt without restorable content gets a clear **delete-only** explanation, not a false Resume option or a silently cleared handle.
- A network/server error during discovery does not mean “no attempt found.” Keep the creation request pending and offer Retry/Cancel.
- If a blocker expires while the prompt is open, recheck server state and allow creation without forcing deletion. If it completes in another tab, update its report state and recheck the gate.

### Scope and races

At final creation, the server revalidates supplied known session credentials and refuses insertion if any authenticated unfinished session is still within 24 hours. Return a typed existing-attempt outcome, not a new session or an automatic destructive replacement. Validate credential-list limits; if checks require chunks, do not authorize creation from only a partial discovery result.

Where supported, coordinate same-browser creation with a **Web Lock** covering the final storage rescan, server check/create, and credential persistence. Release it while waiting for user decisions; reacquire and rediscover afterward. Coordinate gate-related storage changes through the same mechanism.

This is a guarantee to prompt for **found, stored, authenticated attempts**, not global one-attempt-per-person enforcement. Cleared/blocked storage, another browser profile, omitted credentials, missing Web Locks, or a lost creation response limit discovery. Do not promote the client ID into an ownership credential to conceal those limits. If strict cross-device/server-wide single-attempt enforcement is desired later, it needs an authenticated browser/account identity design.

## 7. Browser storage, XState, and UI

### Credential storage

Add a versioned `machines/savedSessions.ts` adapter with injectable storage. Persist independent per-ID handles containing ID, token, both deadlines, and minimal display hints. Keep report handles when a new attempt starts.

Do not persist questions, grading data, reports, or serialized machine state as authoritative data. Guard SSR and handle blocked, full, or corrupt storage. A successful creation can continue in memory if storage fails, but explicitly warn that later recovery/discovery may not work.

Tokens in localStorage are readable by same-origin scripts and people using that browser profile; this is an explicit same-browser security trade-off. No token-bearing routes or share links.

- At 24 hours, disable resume and show expired-attempt metadata; do not automatically discard completed-report credentials.
- At the seven-day access cutoff, server confirmation determines unavailable status before clearing the affected handle. An unopened browser cannot be remotely cleared; do not claim backend deletion erases user-controlled bookmark storage or copies of a downloaded/viewed report.
- Transient failures/conflicts preserve handles. Confirmed deleted/missing/invalid access clears only the affected handle.
- Do not offer **Forget on this device** as a substitute for Delete on the unexpired unfinished gate. It would remove discoverability without fulfilling the requested deletion.
- Report-history reads may be lazy/paged; pre-creation blocker discovery must complete before permitting creation.

### XState transitions

Add bootstrap/restoring, checking-existing-attempts, resume-or-delete-choice, deleting-attempt, and unavailable/retry states around the current flow. Keep server-approved configuration and accepted answers authoritative.

- Unfinished below 24 hours → explicit Resume → first unanswered question.
- All answered, unfinished below 24 hours → idempotent completion.
- Unfinished at/after 24 hours → attempt-expired screen; no new answers/first completion.
- Completed before `accessExpiresAt` → saved report with restored survey state.
- New-session request → discovery → Resume/Delete decision if needed → final recheck → creation.
- Fresh restoration clears unsubmitted selections/pending answers. In-process retries retain the pending request.
- Expiry during an open tab/submission is handled with a typed server outcome, not an endless Retry loop.
- Reset the unanswered-question timer on resume; exclude offline time. Keep client time within 0–3600 seconds and strict server validation. Timing does not affect grading.

Reuse existing shadcn components (including a suitable confirmation/dialog primitive if needed), semantic tokens, keyboard behavior, and colocated component prop interfaces. Show distinct “Resume until” and “Report available until” deadlines. The same `/` flow is sufficient; all lengths stay free.

## 8. Daily maintenance design

### Bounded work

Add `server/sessionMaintenance.ts` with `runSessionMaintenance(db, options)`. Use one maintenance operation with server-controlled policy, not separate primary/reconciliation modes:

1. Capture database-time cutoffs for the invocation; callers cannot supply arbitrary retention durations.
2. Delete all-status sessions with `createdAt <= now − 7 × 24 hours`, oldest first. Never automatically delete a younger session under the retention policy; explicit authenticated user deletion is separate.
3. Mark retained, idle `in_progress` rows `abandoned` where `lastActivityAt <= now − 30 minutes`. This never grants resumption beyond 24 hours.
4. Return affected counts, duration, cap/failure signals, and a best-effort oldest eligible record/cleanup-lag indicator without session IDs/tokens/content.

Use short per-batch transactions with ordered candidate CTEs, `LIMIT`, and `FOR UPDATE SKIP LOCKED`. Mutate the same locked rows, retaining eligibility predicates. Return scalar counts, not unbounded ID arrays.

Initial tunables: 200 sessions per batch and at most five batches per operation, plus a wall-clock budget below the deployment limit and statement/lock timeouts. Measure capacity against daily arrivals and the initial backlog; these bounds may need tuning. Commit each batch separately and give deletion priority while reserving time for the inactivity sweep.

No distributed mutex is needed. Overlapping/repeated runs are safe; skipped locked rows can be retried on a rerun. A short/zero batch does not prove all eligible work is done. Log cap/backlog signals and perform authorized catch-up reruns when needed rather than allow a growing backlog. Test cascade/lock timeouts and partial failure: committed batches remain deleted, an interrupted batch rolls back, and the next invocation safely reprocesses remaining eligible records. Cascades include all session-specific data, not bank content.

### Schedule and secure entry point

Propose `src/routes/api/internal/session-maintenance.ts` for `/api/internal/session-maintenance`:

- Authenticate `Authorization: Bearer <CRON_SECRET>` before DB access; fail closed if missing/wrong, using safe secret comparison.
- Vercel invocation uses GET. Set `Cache-Control: no-store`; do not redirect or include secrets in URLs.
- Await bounded work and sanitize errors. Do not launch detached work after responding.
- Let generated routing update normally; never edit `routeTree.gen.ts` by hand.

At the verified Vercel project root, configure **one daily job at 03:00 UTC: `0 3 * * *`**. This fits Hobby's daily frequency limit. Its invocation may occur within the selected hour; do not promise an exact 03:00 execution time. Confirm registration and actual production invocation after deployment.

Verify the project root before choosing the `vercel.json` location and supply a strong `CRON_SECRET` through hosting configuration. There is no additional weekly, early-purge, or high-frequency job in this plan.

Other deployments must register an actual daily external scheduler calling the same protected operation. The endpoint alone is not scheduling. Keep environment/secret isolation, avoid session-level locks tied to a connection pool, and do not use an application `setInterval` or one timer per session. No paid service or Docker/Compose change is activated by updating the plan.

### Guarantees, failure recovery, and release gates

- Request-time idle classification works at 30 minutes. The daily sweep materializes idle status for unvisited attempts; raw stored status is not precise live presence.
- Resume/new-answer/first-completion eligibility ends at 24 hours, irrespective of cleanup.
- Normal report/session access ends at seven days, irrespective of cleanup. Access must not reappear when a job fails.
- Records aged seven days or more are expected cleanup candidates, not automatically retention breaches. Delayed deletion from failed, missed, locked, or capped runs is an operational backlog to detect and clear; it is not extra report availability.
- Vercel documents best-effort delivery, possible duplicate invocations, and no automatic retry of a failed cron invocation. Do not assume provider retries. Supply an authorized manual rerun/catch-up procedure; recurring runs always query all remaining eligible rows.
- Review initial eligible-row counts and cascade scope before destructive activation. Size batches to avoid an increasing backlog, log failed/capped runs and last success, and verify recovery from an incomplete run. No new telemetry dashboard is required.
- Document provider-managed backup/replica/WAL retention separately and purge expired data before reopening a restored DB. The daily job deletes live session records; it does not certify physical-media erasure at seven days.

## 9. Migration and incremental delivery

**Implementation status (2026-09-25):** stage 1 is implemented in the `session-lifecycle/snapshots` PR layer and validated with 256 passing tests against disposable PostgreSQL. Stages 2–4 remain pending. No production migration or cleanup activation has occurred.

### Legacy/cutover rules

- Generate additive nullable snapshot/index migrations; new writers must always provide snapshots.
- Drain old writer deployments before enforcing the new invariants; stale clients must still hit current deadline and creation-gate service rules.
- Both deadlines use original `createdAt`. No fresh 24 hours or seven days is granted at migration.
- Do not manufacture historical snapshots from current bank content. An unfinished legacy attempt younger than 24 hours offers deletion, not unsafe restoration; after 24 hours it no longer blocks creation.
- Legacy completed rows expose persisted summaries only until `accessExpiresAt`, seven days from original creation. No rescoring or invented question review.
- Review all-status cascade scope and existing rows aged seven days or more before activating daily deletion. Clear the initial eligible backlog through authorized bounded catch-up; verify scheduler registration, failure recovery, and backup-policy documentation.
- Migration cannot rediscover ownership for browsers that never saved a token; only known authenticated credentials participate in recovery and the creation gate.

### Four coherent implementation groups

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **1 — Policy and durable content** | Central 30-minute/24-hour/seven-day rules, safe contracts, snapshot/index migrations, snapshot-backed grading, legacy policy. | Exact boundaries tested; new assessment content survives bank edits; no invented legacy history or extended deadlines. |
| **2 — Server lifecycle and creation gate** | Parent-row transactions, operation-specific expiry, typed errors, idempotent answer/completion, report/resume/metadata reads, authenticated deletion, known-attempt recheck before creation. | No new row when a known unexpired unfinished blocker exists; deleted attempts cascade safely; all race/retry/report paths have defined outcomes. |
| **3 — Browser recovery and Resume/Delete UX** | Credential storage, complete discovery, same-browser coordination, XState restore/delete/create paths, saved reports, deadlines, timing, storage-error handling. | Resume or confirmed Delete is required when a blocker is found; cancel/failure does not bypass; expired/completed attempts do not block; 8/16/32 work on refresh and by keyboard. |
| **4 — Daily cleanup and rollout** | Bounded cleanup/inactivity helpers, protected route, daily schedule, secret provisioning, initial backlog catch-up, failure logging/rerun procedure, and documentation. | Real daily invocation verified; exactly age `>= 7 days` is eligible for all-status deletion; cascades, overlap, retry, partial failure, and capacity checks pass; access ends at seven days even if cleanup is delayed. |

Implement source changes only after confirmation; scheduler/secret configuration and destructive cutover need deployment authorization. Verify deployment root and backup documentation without introducing a separate exact-deadline deletion system. Group later commits by these implementation areas. The existing unrelated chart and Docker/package-script edits remain separate.

### File map for implementation

Existing files:

- `apps/web/src/domain/{constants,types,scoring}.ts` — policy/contracts; no scoring-formula change intended.
- `apps/web/src/db/{schema,queries}.ts` and generated `apps/web/drizzle/` migrations.
- `apps/web/src/server/{assessmentService,assessmentFns,assessmentValidation,errors,messages}.ts`.
- `apps/web/src/machines/{assessmentMachine,assessmentServices,createSessionAdapter}.ts` and tests.
- Assessment UI: `AssessmentFlow.tsx`, `Intake.tsx`, `Report.tsx`, `SkillRadar.tsx`, and `copy.ts`.
- `apps/web/src/server/__tests__/postgresFixture.ts` for truly independent test connections.
- `prd.md`, `docs/sessions-and-evaluation.md`, and README/runbook when behavior actually lands.

Proposed new modules:

- `apps/web/src/domain/sessionLifecycle.ts` and policy tests.
- `apps/web/src/machines/savedSessions.ts` and storage tests.
- `apps/web/src/server/sessionMaintenance.ts` and lifecycle/maintenance PostgreSQL tests.
- `apps/web/src/routes/api/internal/session-maintenance.ts` and handler tests.
- `vercel.json` at the verified deployment root for the daily job, plus a maintenance runbook.

## 10. Verification

### Policy and authenticated operations

- Exactly before/at/after 30 minutes, 24 hours, and seven days; elapsed UTC semantics across DST.
- No operation extends either deadline; active tabs cannot submit new answers or first-complete after 24 hours.
- First completion after 24 hours fails even if all answers were previously stored; retrieval of an already-awarded report still works before seven days.
- Wrong tokens/malformed credentials disclose no session details and authorize no deletion.
- Both new and old caller paths enforce `attemptExpiresAt` and `accessExpiresAt`; retained rows awaiting cleanup cannot serve expired content.
- Report copy distinguishes the seven-day access deadline from daily deletion. Retention cleanup never removes records younger than seven days; explicit candidate deletion may do so.

### Resume/Delete creation gate

- Matching and different framework/level/length settings; zero-answer, partial, all-answered unfinished, inactive, expired, completed, and unrestorable legacy attempts.
- Multiple saved blockers, stale local metadata, missing active pointer, and bounded multi-page/chunk discovery.
- No creation while discovery is unresolved or a blocker remains; dismiss/cancel/forget do not bypass.
- Resume uses original configuration. Delete confirms and cascades before final recheck/creation.
- Discovery/resume/deletion response loss, token mismatch, and a blocker completing/expiring in another tab.
- Two tabs starting simultaneously, Web Lock support/fallback, and final server rechecks. Test the documented same-browser scope without claiming global uniqueness.

### Database correctness and content fidelity

Use the isolated `TEST_DATABASE_URL` fixture with real migrations. Extend its current single connection (`max: 1`) to independent scoped connections; `Promise.all` over one connection is not a concurrency test.

- Same-answer replay preserves first accepted timing; different answers conflict; concurrent completion saves once.
- Bank changes after creation/completion do not alter saved assessment/report content.
- No private snapshot, keys, correctness, or explanations leak before completion.
- Lock waits crossing deadlines; resume/answer versus idle sweep; completion versus purge; delete versus completion; both race orderings established with barriers, not sleeps.
- Daily cleanup selects exactly age `>= 7 days` for every status, including the exact boundary, and leaves younger records unchanged. Eligibility is based on session creation, not recent activity or completion.
- Test batch limits, capacity, lock contention, skipped-row retry, duplicate/concurrent invocations, partial rollback, and catch-up after missed days. Simulate a failed job: normal access stays denied after seven days and a rerun deletes remaining eligible records.
- Cascades remove answers, results, pillar rows, and surveys while preserving bank content.
- Legacy records keep original age and have no fabricated historical data.

### Browser and deployment

- Refresh/reopen during the 24-hour window, saved reports before the seven-day access cutoff, transient failure preservation, terminal per-handle cleanup, corrupt/blocked/full storage, and long-open timer bounds.
- Keyboard/mobile light/dark/RTL verification of prompts, confirmation, recovery, and reports with existing design tokens.
- Unauthorized maintenance calls do zero DB work; valid requests are not cached/redirected. Verify the daily schedule/action, secret isolation, backlog/cap handling, failure logs, and authorized manual retries.
- Verify documented backup/replica/WAL policy and restore cleanup. Do not represent live-row deletion tests as proof of physical-media erasure.
- Do not use production credentials/data for preview or integration testing.

Run `pnpm --filter web typecheck`, `pnpm --filter web test` with a dedicated `TEST_DATABASE_URL`, `pnpm lint`, and `pnpm build`. Report unrelated existing blockers separately.

## 11. Explicitly deferred

- Accounts, email recovery, cross-device synchronization, and shareable reports.
- Strict globally unique unfinished-attempt ownership without an authenticated identity design.
- Recovery from a lost creation response before receiving credentials.
- Real-time presence/heartbeats, new telemetry dashboards, billing tiers, and a general content revision system.

**Required, not deferred:** authenticated deletion for the Resume/Delete choice, request-time 24-hour/seven-day access checks, and daily cleanup of eligible session records with failure recovery.

**Removed from this plan:** strict seven-day physical-erasure guarantees, early-purge margins, a separate high-frequency deletion system, and weekly reconciliation.

## References and planning limits

- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby maximum frequency of once per day; hour-level precision.
- [Managing Vercel cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — bearer-secret authentication, best-effort and duplicate delivery, no automatic failure retries, and concurrency concerns.

Provider cron facts were checked 2026-09-25. Deployment root/plan and backup policy remain to be verified during implementation. This revision changes only the plan; the current-behavior document and PRD must not be presented as if these features are implemented. **The approved policy is 24-hour resumability, seven-day report access, and daily deletion of session records aged seven days or older.**
