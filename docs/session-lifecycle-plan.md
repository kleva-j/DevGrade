# Session lifecycle completion plan

**Status — 2026-09-25:** Stages **1–2 implemented**; current layer `session-lifecycle/server`. Stage 3 browser recovery and Stage 4 maintenance/rollout are **not implemented**. [PR #1](https://github.com/kleva-j/DevGrade/pull/1) exists for the first lifecycle layer. This status does not claim merge, deployment, production migration, or cleanup activation.

**Baseline:** free Quick 8 / Standard 16 / Deep 32 assessments, PostgreSQL, TanStack Start/Nitro, and XState. Product scope, scoring, and visual design remain unchanged. See [current behavior](sessions-and-evaluation.md) and the [PRD](../prd.md).

## 1. Approved policy and implementation boundary

> **30 minutes: effectively inactive. 24 hours from original creation: unfinished attempt expires. Seven days from original creation: normal access ends and cleanup eligibility starts. Daily deletion is planned, not active.**

| Concern                  | Policy and current status                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Inactivity               | Implemented: unfinished sessions are effectively `abandoned` at `now >= lastActivityAt + 30 minutes`; reads do not materialize the status. Inactivity does not end an otherwise eligible attempt.                                       |
| Attempt lifetime         | Implemented: `attemptExpiresAt = createdAt + 24 hours`. No unfinished resume, new answer, answer retry, or first completion at/after the deadline. Leaving a tab open cannot bypass it.                                                 |
| Normal access            | Implemented: `accessExpiresAt = createdAt + 7 × 24 hours` for every status. Reads/completion retries/surveys stop at this boundary, even if data remains stored.                                                                        |
| Saved reports            | Implemented server retrieval: an already-awarded report remains readable until seven days from **session creation**, not completion. Browser saved-report recovery is pending.                                                          |
| Starting another attempt | Implemented server gate: every supplied authenticated unfinished attempt younger than 24 hours blocks insertion. Stage 3 must collect all known browser credentials and offer Resume or confirmed Delete, never “Start another anyway.” |
| Explicit deletion        | Implemented: authenticated parent-locked cascading deletion with `expectedState: "unfinished"                                                                                                                                           | "completed"`. Changed state returns a non-destructive outcome. Confirmation UI is pending. |
| Daily cleanup            | Stage 4: `0 3 * * *` UTC; bounded all-status deletion where `createdAt <= DB time − 7 days`, independent of browser traffic. No active scheduled cleanup or replacement inactivity worker exists yet.                                   |
| Ownership/discovery      | Implemented per supplied ID/token pair, not by anonymous client-ID hash. No account/device-wide ownership or global single-attempt guarantee.                                                                                           |

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

Deletion compares the caller's confirmed expected state with current state under the lock. A match returns `deleted` after cascading parent deletion. A mismatch returns `changed_state` plus `currentState`, preserving a report that completed after an unfinished confirmation. This server contract exists; user confirmation and changed-state UI are Stage 3. Deletion is allowed after access expiry, but always requires valid credentials. A now-missing row after a lost response returns generic `not_found`, not a fabricated successful deletion.

### Bounded known-credential gate

Discovery accepts `credentials`; creation accepts optional `knownCredentials`. Each list is validated in full with a maximum of **1,000**, never silently truncated. Authenticated parent lookups and answer-ID metadata queries are batched in **100s**. No per-handle full-answer/content fetch is needed for discovery.

Discovery returns `available` metadata or generic `unavailable` for missing/wrong-token/access-expired credentials. Creation rejects with `existing_attempt` if any supplied authenticated unfinished session is below 24 hours, irrespective of requested settings or snapshot restorability. Completed and attempt-expired sessions do not block.

This cannot discover omitted or lost credentials. There is no list-by-client-ID or global single-attempt guarantee, and the existing browser currently supplies no saved list. Best-effort creation rate limiting (five per hashed client ID per trailing hour) also remains separate from ownership and does not serialize simultaneous new creations by client ID. Lost creation-response recovery/request-key idempotency is deferred.

## 4. Stage 3 — browser recovery and Resume/Delete UX (not implemented)

Current browser changes are **compatibility-only**: unwrap typed envelopes into the old machine service interface. XState still advances locally and renders the in-memory result/questions. The adapter does not pass through lifecycle deadlines or authoritative answer progress. Only the anonymous client ID is stored; no session credential storage, recovery/history, Web Locks, or deletion UI exists.

### Required creation/recovery flow

1. Read all known per-session credentials, not only an active pointer or those matching the requested configuration. Resolve all blocker metadata before permitting creation; respect the 1,000-entry server bound without dropping unchecked handles.
2. If an authenticated unfinished attempt younger than 24 hours exists, show its original configuration, progress, and deadline. Offer **Resume** or **Delete**; cancel/dismiss cancels creation. An unrestorable legacy blocker gets a delete-only explanation.
3. Explicit Resume calls `resumeSession` and uses the server view/first unanswered ID. All-answered unfinished state invokes idempotent completion only within the attempt window. Read/bootstrap alone must not refresh activity.
4. Delete requires confirmation and sends the expected state. On `changed_state`, preserve the handle and reconcile/show the report rather than automatically retrying destructive deletion under a different expectation.
5. Remove only a confirmed deleted/unavailable handle; recheck the remaining list before creating with the requested configuration. A discovery/deletion network error preserves handles and offers Retry/Cancel, never bypass.
6. Reconcile typed expiry/conflict/completion outcomes and server progress in open tabs. A blocker completing/expiring while a prompt is open changes the gate after a fresh check; no forced deletion of an expired attempt.

Where supported, use a **Web Lock** around final storage rescan, server check/create, and credential persistence. Release it while awaiting user decisions; reacquire and rediscover afterward. Coordinate gate-related storage mutations with the same lock. Missing support, another profile, omitted credentials, storage failure, and a lost creation response remain documented limits, not global ownership enforcement.

### Storage, state, and design constraints

- Add an injectable, versioned saved-session storage adapter with independent per-ID handles: ID/token, both deadlines, minimal display hints. Preserve report handles when starting another attempt.
- Do not persist private grading data, questions/reports as authority, or serialized XState snapshots. Handle SSR and blocked/full/corrupt storage. If storage fails after creation, continue in memory with a recovery warning, not automatic duplicate creation.
- Same-origin scripts/shared browser profiles can read localStorage tokens; document this trade-off. No token-bearing links, logs, analytics, or public routes.
- Do not discard completed handles at the 24-hour attempt cutoff. Server-confirmed terminal unavailability clears only the affected handle; transient failures preserve it. Backend deletion cannot remotely erase unopened browser storage or copies of a viewed report.
- Add bootstrap/restoration, checking, Resume/Delete choice, deletion, unavailable, and retry states. Fresh restoration clears unsubmitted choices; in-process retries retain pending requests. Consume typed failures without parsing messages or endless expiry retries.
- Restore reports from saved public questions/pillar metadata and survey state, not current metadata. Show distinct “Resume until” and “Report available until” deadlines; no physical-erasure promise.
- Reset unanswered-question timing on resume, exclude offline time, and keep captured duration within the existing 0–3600 bound. Timing does not affect grading. Baseline overlong-duration retries are not fixed in Stage 2.
- Reuse existing shadcn components, semantic tokens, keyboard behavior, light/dark/RTL rules, and the `/` flow. No product/design expansion, accounts, or pricing changes.

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

**Stage 2, reported by the primary agent on 2026-09-25:** **282 passing tests, 0 skipped**, against isolated PostgreSQL 18 with real migrations. Independent scoped connections assert backend PIDs and observable lock barriers. Package lint/build pass; typecheck has only **three existing unrelated shared `chart.tsx` errors**. This is not a new validation run by the documentation task, nor evidence that root `pnpm build` succeeded.

Implemented coverage includes exact temporal boundaries, strict credentials/safe envelopes, snapshot fidelity, all lengths, legacy variants, out-of-order authoritative progress, same/different-option replays, once-only completion, expected-state deletion/cascades, the complete bounded credential gate, parent-locked races, fresh time after lock waits, and coherent read snapshots during cascade deletion. The fixture is no longer limited to concurrency on one backend. Maintenance/browser tests below remain exit criteria, not claimed coverage.

### Stage 3 exit criteria

- Refresh/reopen for 8/16/32 questions, first unanswered restoration, all-answered first-completion cutoff, saved report/survey recovery before seven days.
- Multiple/mismatched-configuration blockers; complete bounded discovery; cancel/failure/forget cannot bypass a found blocker. Completed/expired attempts do not block.
- Confirmation and changed-state handling, response loss, transient handle preservation, terminal per-handle cleanup, blocked/full/corrupt storage, two-tab coordination and unsupported Web Lock behavior.
- Typed conflict/expiry reconciliation and timer bounds; keyboard/mobile/light/dark/RTL checks using the existing design.

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

Normal root commands remain `pnpm --filter web test`, `pnpm --filter web typecheck`, `pnpm lint`, and **package build** `pnpm --filter web build`. If the pnpm shim is unavailable, use pinned `pnpm@10.33.4`, e.g. `npm exec --yes --package=pnpm@10.33.4 -- pnpm --filter web build` (network may be needed when uncached). Or use installed lockfile-resolved tools from `apps/web`:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node node_modules/vite/bin/vite.js build
```

Also run the installed ESLint command from `packages/ui` for its lint coverage. Package-tool fallbacks do not establish success of the root Turbo wrapper; report command-specific outcomes and the existing chart errors separately. See the [current-behavior source map](sessions-and-evaluation.md#9-verification-and-source-map).

## 8. Explicitly deferred and references

Deferred: accounts/email recovery, cross-device synchronization/shareable reports, strict global unfinished-attempt ownership, lost-creation-response recovery, heartbeats/real-time presence, new telemetry dashboards, billing, and a general content revision system. **Not deferred:** completing Stage 3 recovery/Resume/Delete UX and Stage 4 daily cleanup with failure recovery.

Provider references (reviewed for the original plan on 2026-09-25; recheck the actual deployment plan/root before rollout):

- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — daily Hobby frequency and hour-level precision.
- [Managing Vercel cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — bearer authentication, best-effort/duplicate delivery, failure retry limitations, concurrency.

No scheduler, paid service, Docker/Compose change, or production deletion is activated by this documentation update.
