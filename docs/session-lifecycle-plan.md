# Session lifecycle completion plan

**Status — 2026-09-25:** Stages **1–3 delivered in source**; current layer `session-lifecycle/recovery`. Stage 3 browser recovery has reported independent validation; Stage 4 maintenance/rollout remains **pending**. [PR #1](https://github.com/kleva-j/DevGrade/pull/1) exists for the first lifecycle layer. Source delivery is not a claim of merge, production deployment/migration, or cleanup activation.

**Baseline:** free Quick 8 / Standard 16 / Deep 32 assessments, PostgreSQL, TanStack Start/Nitro, and XState. Product scope, scoring, and visual design remain unchanged. See [current behavior](sessions-and-evaluation.md) and the [PRD](../prd.md).

## 1. Approved policy and implementation boundary

> **30 minutes: effectively inactive. 24 hours from original creation: unfinished attempt expires. Seven days from original creation: normal access ends and cleanup eligibility starts. Daily deletion is planned, not active.**

| Concern                  | Policy and current status                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inactivity               | Implemented: unfinished sessions are effectively `abandoned` at `now >= lastActivityAt + 30 minutes`; reads do not materialize the status. Inactivity does not end an otherwise eligible attempt.                                                     |
| Attempt lifetime         | Implemented: `attemptExpiresAt = createdAt + 24 hours`. No unfinished resume, new answer, answer retry, or first completion at/after the deadline. Leaving a tab open cannot bypass it.                                                               |
| Normal access            | Implemented: `accessExpiresAt = createdAt + 7 × 24 hours` for every status. Reads/completion retries/surveys stop at this boundary, even if data remains stored.                                                                                      |
| Saved reports            | Server retrieval and browser history/recovery are implemented. An already-awarded report remains readable until seven days from **session creation**, not completion. Saved report metadata and separate survey state are restored.                   |
| Starting another attempt | Browser scans/discovers all known handles before creation; server rechecks every supplied credential. An unexpired unfinished blocker requires Resume or confirmed Delete; cancel/failure/storage errors cannot bypass it.                            |
| Explicit deletion        | Implemented confirmation UI and authenticated parent-locked cascades, with `expectedState` of `unfinished` or `completed`. Changed state preserves the row/handle and opens its current view, rather than silently deleting a newly completed report. |
| Daily cleanup            | Stage 4 pending: `0 3 * * *` UTC; bounded all-status deletion where `createdAt <= DB time − 7 days`, independent of browser traffic. No active scheduled cleanup or replacement inactivity worker exists yet.                                         |
| Ownership/discovery      | Supplied ID/token credentials, coordinated across same-browser tabs with Web Locks where supported, not anonymous client-ID ownership. No global single-attempt guarantee.                                                                            |

All boundaries use elapsed UTC durations and authoritative server time. Neither deadline changes with activity, resume, completion, survey, migration, or report views. `SESSION_RETENTION_DAYS = 7` is an access/eligibility policy, not a guaranteed maximum physical retention period.

### Allowed operations by age/state

- **Unfinished, below 24 hours:** resume/answer/complete only with valid saved content; explicit delete is allowed. Effective abandonment still blocks new creation. Null-snapshot legacy attempts are delete-only while unexpired.
- **Unfinished, 24 hours to below seven days:** metadata and delete only; no resume payload, late first completion, or automatic partial award. Does not block creation.
- **Completed, below seven days:** saved report (or persisted legacy summary), survey, completion retry of an existing full award, or delete. Does not block creation.
- **Any status, at/after seven days:** normal access denied; discovery returns generic `unavailable`. Authenticated expected-state erasure remains possible while the row exists. Physical cleanup awaits Stage 4.

`resumeSession` returns the appropriate completed/expired/legacy view without activity changes when resumption is unavailable; it does not revive the attempt. An all-answered unfinished session still must complete before 24 hours. Returning an existing award afterward is retrieval, not late scoring.

## 2. Stage 1 — policy and durable content (implemented)

- Pure `domain/sessionLifecycle.ts` derives deadlines, effective status, operation eligibility, and creation blocking from saved timestamps/state and supplied time.
- `domain/sessionContracts.ts` defines credential, progress, metadata, discovery, view, deletion, and envelope contracts without importing the server runtime.
- Migration `apps/web/drizzle/0002_dazzling_may_parker.sql` adds nullable versioned JSONB snapshots and `(created_at, id)` / `(status, last_activity_at, id)` indexes; the client/time index remains.
- New sessions save ordered private question content, keys, explanations, weights, provenance, and pillar metadata. New grading uses this snapshot, not live bank rows.
- First completion writes normalized overall/pillar scores and an immutable safe report from one pinned-v1 calculation. Reports include public question presentation in selected order, saved pillar metadata, and format/scoring/completion identifiers; no token or private key field.
- Snapshot validation fails closed on unsupported/malformed content and exact selected-ID/configuration mismatches. Null legacy snapshots are not backfilled from today's question bank. Surveys stay separate from the award.

Keep selected IDs authoritative for membership/order/count; no duplicate count/deadline columns, current-question index, or new `expired` DB status is needed. Preserve referenced bank/category identities and retire content rather than deleting it. No general question-versioning subsystem is required.

## 3. Stage 2 — server lifecycle and creation gate (implemented)

### Authentication and safe transport

All existing-session operations require a canonical 36-character UUID (normalized lowercase) plus an exact 64-hex-character token. Validate before DB work; authenticate before disclosing expiry/content. Unknown IDs and wrong tokens remain `not_found`. `rawClientId` is bounded rate-limit metadata only, not retrieval/deletion authority. Token-only helpers have been removed.

All eight TanStack Start server functions are POST with `Cache-Control: no-store`. Validation runs inside the safe handler boundary; failures do not leak Zod issues, credentials, SQL, or raw exceptions. Responses are `{ ok: true, data }` or `{ ok: false, error: { code, message } }`, with `blockers` on `existing_attempt`. These differ from the PRD's logical HTTP status mappings; there is no second REST API or automatic status-code conversion in the active adapter.

### Transactions and retries

- Answer/resume/complete/survey/delete lock the authenticated parent before any child access, then obtain fresh `clock_timestamp()` time and apply operation policy. Status/children are committed before success is returned.
- Creation authenticates/locks supplied known parents in deterministic ID order across all batches before child progress reads. It rechecks blockers under lock, not from a prior discovery response.
- `getSession` and discovery run in short **read-only `REPEATABLE READ`** transactions. They return coherent multi-query snapshots without touching activity. An already-authorized read cannot be recalled after later deletion.
- Same-option answer replay returns the original accepted answer/duration, without timing/status/activity writes; a different option conflicts. Eligibility checks precede replay, so retries cannot bypass attempt/access expiry or completed state.
- Answer responses now return `acceptedAnswer`, `answeredCount`, `totalQuestions`, `nextQuestionId`, and `sessionComplete`. First unanswered ID is derived by selected-ID membership, never answer count as an index. Questions still arrive up front.
- First completion requires the exact selected accepted-ID set and writes the award once. Repeated completion returns the saved result without rescoring or activity writes. A legacy completed session returns `legacy_summary_available` instead of inventing a report.
- Unique constraints remain backstops, not a catch-and-continue strategy inside an aborted transaction. The former unlocked answer/completion races are fixed.

Creation, eligible explicit resume, newly accepted answers, and first completion refresh activity. Read/discovery, duplicate acknowledgements, completion retries, surveys, and invalid requests do not. Daily maintenance must use the same parent-first discipline when implemented.

### Views and deletion

`getSession` has five `kind` variants:

| Kind                  | Contract                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `assessment`          | Original configuration/effective status/deadlines, safe questions, accepted selections/durations without correctness, authoritative progress |
| `attempt_expired`     | Minimal unfinished metadata/deadlines; no questions, resume, or partial award                                                                |
| `report`              | Full immutable saved report, both deadlines, separate survey rating                                                                          |
| `legacy_summary`      | Persisted aggregates/pillar scores and completion time, deadlines/survey rating, no historical question review                               |
| `legacy_unrestorable` | Unfinished null-snapshot metadata; delete-only blocker below 24 hours                                                                        |

Completed views take precedence over attempt expiry; unfinished attempt expiry precedes legacy content. Non-null invalid snapshots fail with `snapshot_unavailable`. `resumeSession` updates activity only for an eligible unfinished attempt; all other retained cases return their view without writes. Read/resume never auto-completes an all-answered attempt.

Deletion compares the caller's confirmed expected state with current state under the lock. A match returns `deleted` after cascading parent deletion. A mismatch returns `changed_state` plus `currentState`, preserving a report that completed after an unfinished confirmation. Stage 3 now supplies inline confirmation and changed-state reconciliation; Cancel/Escape cancels the new-session request as well as deletion. Deletion is allowed after access expiry, but always requires valid credentials. A now-missing row after a lost response returns generic `not_found`, not a fabricated successful deletion.

### Bounded known-credential gate

Discovery accepts `credentials`; creation accepts optional `knownCredentials`. Each list is validated in full with a maximum of **1,000**, never silently truncated. Authenticated parent lookups and answer-ID metadata queries are batched in **100s**. No per-handle full-answer/content fetch is needed for discovery.

Discovery returns `available` metadata or generic `unavailable` for missing/wrong-token/access-expired credentials. Creation rejects with `existing_attempt` if any supplied authenticated unfinished session is below 24 hours, irrespective of requested settings or snapshot restorability. Completed and attempt-expired sessions do not block.

This cannot discover omitted or lost credentials. There is no list-by-client-ID or global single-attempt guarantee. Stage 3 now supplies the full checked stored/in-memory credential list under browser coordination, and rejects blocked/full/corrupt storage rather than treating it as an empty list. Best-effort creation rate limiting (five per hashed client ID per trailing hour) remains separate from ownership and does not serialize new creations server-wide by client ID. Lost creation-response recovery/request-key idempotency is deferred.

## 4. Stage 3 — browser recovery and Resume/Delete UX (source delivered)

Implemented on `session-lifecycle/recovery` in `machines/{sessionStorage,sessionRecovery,assessmentMachine,assessmentServices,createSessionAdapter}.ts` and the assessment UI. The browser is no longer compatibility-only: it discovers history, requires Resume/Delete for known blockers, restores original configuration/progress and saved reports/surveys, and reconciles server state. This is source delivery with reported independent validation (§7), **not production deployment**.

### Delivered creation/recovery flow

1. Bootstrap scans all prefixed storage keys plus in-memory handles and discovers metadata, without creating or automatically resuming. The 1,000-handle bound fails closed; missing/duplicate discovery entries never authorize creation.
2. Start scans/discovers the full list under a lock, independent of the requested framework/level/length. A server-confirmed unfinished attempt younger than 24 hours requires **Resume** or **Delete**; a legacy unrestorable blocker gets a delete-only explanation. Canceling the gate or confirmation cancels creation.
3. Resume loads the **original server configuration** and first unanswered selected ID from accepted-answer membership, not the settings for a new attempt. Opening/reading is distinct from Resume. All-answered unfinished attempts need explicit Resume/active flow before completion; at/after 24 hours the expired view prevents late completion.
4. Inline Delete confirmation focuses Cancel initially and supports Escape. It sends the expected state; `changed_state` preserves the handle, cancels automatic creation, and reads the new state/report. It never silently reconfirms a different destructive expectation.
5. Confirmed deletion/unavailability clears only that matching handle; then the gate rescans before creating with the requested configuration. Discovery/deletion failures retain handles and offer Retry/Cancel; there is no Forget or Start-another-anyway bypass.
6. After answer acknowledgements and typed conflict/completed/attempt-expired/legacy outcomes, the machine rereads `getSession` and reconciles authoritative accepted IDs. Completion success/retry also reads the saved award instead of rendering the transient completion result. Fresh open/resume clears unsubmitted choices; same-question background reconciliation preserves selection/timing, while in-process answer retries retain their exact pending payload.

The **`devgrade.session-lifecycle` Web Lock** covers scan/discovery/preflight/create/persist and related handle updates/deletion where `navigator.locks` is available. A per-instance queue also serializes local operations. No human decision holds the lock; subsequent creation reacquires and rescans. Without Web Locks, only local serialization is guaranteed. Another profile, cleared/omitted credentials, and a lost creation response remain limits, not global ownership enforcement.

### Exact storage and failure semantics

- `sessionStorage.ts` stores JSON **`version: 1`** under **`devgrade.session.<sessionId>`** (prefix `devgrade.session.`). Fields are ID/token, optional ISO `attemptExpiresAt` / `accessExpiresAt`, and optional `hint: { framework, targetLevel, questionCount }`. Normal writes use server deadlines/configuration; hints never authorize access. There is no active pointer.
- Explicit projection excludes questions, answers, private grading data, reports, and serialized actors. Storage is injectable/SSR-safe; the recovery instance is per mounted flow. Same-origin scripts and shared-profile users can read tokens; no token-bearing links or account/cross-device recovery are introduced.
- Invalid key/credential pairs, damaged versions/hints, and credential conflicts flag corruption. A valid credential in a damaged handle is retained for discovery, not discarded to hide a blocker. Missing/inaccessible disk state does not erase credentials already held in memory.
- **Before creation:** blocked/unavailable, full, corrupt, or over-limit storage fails closed. A separate random `devgrade.storage-probe.<uuid>` key tests and verifies a 1,024-character write/removal without overwriting handles. Discovery/preflight failure cannot create a new row.
- **After successful creation:** if handle persistence fails, keep the credential in memory, warn about recovery, and continue by reading that same session. Retrying the read never repeats creation. Refresh/close may lose that unsaved credential. A lost creation response before credentials arrive remains deferred, distinct from post-create storage failure.
- Normal history keeps completed handles across new attempts and beyond the 24-hour cutoff. Server-confirmed `not_found`, `access_expired`, or discovery `unavailable` clears the matching handle; removal failure warns, while transient server/network failures preserve handles. At ≥7 days, normal access is denied and handles are removed after confirmation, but the DB row remains until explicit deletion or Stage 4 cleanup.

### Delivered history, reports, and timing

History is server-metadata-driven, normally newest-created first, with original configuration/count, progress, status, and separate “Resume until” / “Report available until” deadlines. Saved report rendering uses snapshot questions, pillar labels/descriptions/radar metadata, and awarded results; legacy rows display only persisted summaries. Survey rating is restored separately, including the thank-you/saved-rating display. The API permits upserts; the current thanks UI does not offer a change-rating control.

Visibility/online/storage events, manual refresh, and advisory deadline wakeups reconcile eligible screens; the gate refreshes on a bounded interval. The server remains the authority, not local deadlines. Automatic reads never grant Resume permission or refresh server activity. Browser cleanup cannot remotely erase unopened storage or copies of viewed reports.

Display and submission use the same rounded, finite **0–3600-second** bound. Resume/new-question entry resets the timer; offline time between visits is not reconstructed. Hidden-tab and observed offline intervals pause timing; return excludes the paused duration. Same-question reconciliation preserves the timer, and retries reuse the accepted/pending duration rather than add network waiting. Timing/focus loss do not affect grading or extend server deadlines.

The `/` flow reuses existing components/tokens and keyboard/light/dark/RTL design conventions. No product scope, account, or pricing change is implied.

## 5. Stage 4 — daily maintenance and rollout (not implemented)

### Bounded maintenance operation

Add one `runSessionMaintenance(db, options)` operation with server-controlled policy:

1. Capture DB-time cutoffs for the invocation; do not accept arbitrary client retention durations.
2. Delete all-status sessions with `createdAt <= now − 7 × 24 hours`, oldest first. Explicit authenticated candidate erasure is separate and can remove younger sessions.
3. Materialize idle retained `in_progress` rows as `abandoned` at `lastActivityAt <= now − 30 minutes`; never extend the attempt deadline.
4. Return scalar counts, duration, cap/failure signals, and best-effort oldest-eligible/cleanup-lag metadata, without session IDs, tokens, or content.

Use short per-batch transactions, ordered candidate CTEs, `LIMIT`, and parent `FOR UPDATE SKIP LOCKED`; mutate those locked rows while retaining eligibility predicates. Initial tunables: 200 sessions per batch, at most five batches per operation, and a wall-clock budget below the deployment limit with statement/lock timeouts. Measure against arrivals and initial backlog. Commit batches independently, prioritize deletion, and reserve time for inactivity work.

Overlapping/repeated runs must be safe without a distributed mutex. Skipped locked rows remain for later runs; a short/zero batch does not prove no backlog. Committed batches stay deleted on later failure; an interrupted batch rolls back. Log capped/failed runs and support authorized catch-up. Cascades cover answers, normalized results/pillar scores, surveys, and snapshots, not question-bank content.

### Protected entry point and schedule

Proposed modules: `server/sessionMaintenance.ts`, `/api/internal/session-maintenance` route and handler tests, deployment-root `vercel.json`, and a maintenance runbook. Verify deployment root before choosing configuration paths; let routing generate normally.

- Authenticate `Authorization: Bearer <CRON_SECRET>` before DB access; missing/wrong secret fails closed with safe comparison.
- Vercel invokes GET. Set `Cache-Control: no-store`; no redirect or secret in the URL. Await bounded work, sanitize errors, and do not detach work after response.
- Configure one daily **`0 3 * * *` UTC** job. Hobby permits daily frequency with hour-level precision; verify actual registration/invocation rather than promising exact 03:00 execution.
- Other hosts need a real external scheduler. An endpoint alone is not scheduling; no browser trigger, application interval, or per-session timer substitutes for it.
- Vercel delivery is best-effort, may duplicate, and does not automatically retry failed cron invocations. Supply an authorized manual rerun/catch-up procedure; every invocation queries all remaining eligible rows.

### Retention and rollout guarantees

Seven days is a normal-access cutoff and cleanup threshold, not exact physical erasure. Once scheduled, a session created Monday at 10:00 becomes eligible the following Monday at 10:00 and would normally be deleted Tuesday at 03:00. Healthy deletion is approximately age 7–8 days; hour-level scheduling precision, failed/missed runs, locks, or batch caps can delay it further without extending access.

Review initial eligible counts/cascade scope before destructive activation; verify capacity, last-success/failure/cap logging, reruns, and partial-failure recovery. Request-time inactivity already works; materialized status will still not be real-time presence.

Live-row `DELETE` is not immediate media erasure of MVCC tuples, WAL/PITR, replicas, or backups. Document provider retention separately and enforce expiry/purge expired rows before reopening a restored database. No backup-erasure guarantee at seven days, early-purge margin, separate high-frequency scheduler, or weekly reconciliation is required.

## 6. Migration and dependency order

1. Apply the generated nullable snapshot/index migration `0002` before new writers. Stage 1 durable formats precede Stage 2 enforcement, which precedes Stage 3 consumers and Stage 4 maintenance.
2. Drain old writers before enforcing new snapshot invariants. All caller paths must reach current service checks; migration never grants a fresh 24-hour or seven-day window.
3. Keep legacy original `createdAt`. Unfinished null-snapshot rows are unrestorable; completed null-report rows expose only persisted summaries until normal access expires. Never invent historical content or rescore legacy results.
4. Existing browsers that never saved credentials cannot be retroactively recovered by the client-ID hash. Stage 3 persistence is prospective; no ownership backfill.
5. Production migration, scheduler/secret configuration, and destructive cleanup require authorized rollout and environment-specific verification. Implementation/test results alone do not establish deployment.

## 7. Verification and remaining exit criteria

**Stage 3 independent validation, reported by the primary agent on 2026-09-25:** **339 tests passed, 0 skipped**, using disposable **PostgreSQL 18.1**, real migrations, and the **144-question seed**. Independent scoped connections/backend lock barriers remain covered. Direct web/UI lint passed; web build passed **per the implementation agent**. Typecheck remains at **three pre-existing unrelated shared `chart.tsx` errors**.

The root `pnpm lint` / version launcher failed on automatic switching to project-pinned **10.33.4** because of signature verification. Reported validation used pinned **pnpm 10.20** and direct checks instead; do not claim root lint/build success. These results were supplied by the primary/validation agents, not rerun by this documentation task, and do not establish production deployment.

Implemented automated coverage includes exact temporal boundaries, strict credentials/safe envelopes, snapshot fidelity, all lengths, legacy views, accepted-ID progression, replay/reconciliation, once-only completion, expected-state deletion/cascades, bounded credential discovery/gating, storage failures, timer bounds, and parent-locked independent-backend races/coherent reads. Maintenance tests below remain pending exit criteria.

### Stage 3 browser verification — completed in the isolated environment

**Headed Chrome 153: five scenarios and 55 named checks**, per the independent validation agent:

- Quick/Standard/Deep **8/16/32** completed with reload, saved-report, and survey recovery.
- Resume/Delete gate, cancel behavior, and server cascades verified. Two tabs in the **same browser context**, coordinated by Web Locks, produced **only one new row**; this is not a no-Web-Locks or global uniqueness claim.
- Expired all-answered unfinished attempts could not complete late. At **age ≥7 days**, report access was denied and matching handles removed while DB rows remained, consistent with Stage 4 still pending.
- **197 no-store responses** observed; **187 pre-completion responses** had no answer-key markers. Counts apply to exercised responses, not every possible execution.
- Keyboard Delete confirmation and **320px mobile, dark, RTL** checks had no horizontal overflow; no console errors or HTTP 5xx were observed.

These checks establish the reported Stage 3 test scope, not exhaustive browser coverage or production/maintenance readiness.

### Stage 4 exit criteria

- Exact `>= 7 days` all-status selection, younger rows preserved, eligibility based on parent creation rather than activity/completion, and every child cascade verified.
- Independent-backend barriers for answer/resume versus inactivity, completion versus cleanup, and overlapping cleanup; batch limits, skipped-row retry, partial rollback, capped/missed-run catch-up, and capacity.
- Unauthorized maintenance calls do zero DB work; valid invocations are no-store, bounded, awaited, and safely reported. Verify scheduler/secret setup and a real invocation, not just route existence.
- A failed cleanup never restores expired access. Verify authorized reruns, backlog/failure visibility, provider backup/WAL/replica policy, and restore cleanup. Never use production credentials/data for preview tests.

### Repeatable commands

Set an explicit dedicated `TEST_DATABASE_URL` with schema-creation permission. From `apps/web`, run:

```sh
node --import tsx --test "src/**/*.test.ts"
```

This uses `node:test` and avoids the `tsx` CLI IPC startup in restricted environments. The fixture uses unique data/migration schemas and temporary real-migration copies, cleans up its own resources, and never falls back to `DATABASE_URL`. Missing `TEST_DATABASE_URL` skips DB suites; a configured failure fails.

Configured root entry points remain `pnpm --filter web test`, `pnpm --filter web typecheck`, `pnpm lint`, and package build `pnpm --filter web build`; they are **not a list of successful Stage 3 launcher runs**. The project still declares `pnpm@10.33.4`, whose automatic switch/signature verification failed for root lint/version checks. The reported fallback used pinned **pnpm 10.20** and direct checks, not a successful retry of 10.33.4. Bypass that launcher without changing project configuration/dependencies by invoking installed lockfile-resolved tools from `apps/web`:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node node_modules/vite/bin/vite.js build
```

Also run the installed ESLint command from `packages/ui` for its lint coverage. Package-tool fallbacks do not establish success of the root Turbo wrapper; report command-specific outcomes and the existing chart errors separately. See the [current-behavior source map](sessions-and-evaluation.md#9-verification-and-source-map).

## 8. Explicitly deferred and references

Deferred: accounts/email recovery, cross-device synchronization/shareable reports, strict global unfinished-attempt ownership, lost-creation-response recovery, heartbeats/real-time presence, new telemetry dashboards, billing, and a general content revision system. **Delivered in source:** Stage 3 recovery/Resume/Delete UX. **Required and still pending:** Stage 4 daily cleanup with failure recovery and authorized rollout.

Provider references (reviewed for the original plan on 2026-09-25; recheck the actual deployment plan/root before rollout):

- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — daily Hobby frequency and hour-level precision.
- [Managing Vercel cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — bearer authentication, best-effort/duplicate delivery, failure retry limitations, concurrency.

No scheduler, paid service, Docker/Compose change, or production deletion is activated by this documentation update.
