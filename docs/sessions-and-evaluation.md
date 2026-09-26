# Assessment sessions and evaluation

**Current source — 2026-09-26.** Lifecycle Stages 1–4 and approved simplification Phases A/B/C are implemented. Maintenance is **committed locally and disabled by default**; its PostgreSQL verification is user-confirmed. No production deployment or active schedule is established. See [delivery and activation](session-lifecycle-plan.md), [simplification findings](session-lifecycle-simplification-plan.md), and the [PRD](../prd.md).

## 1. Policy and authority

Anonymous React assessments remain free Quick **8** (default), Standard **16**, or Deep **32**. Selection, scoring, product scope, and design are unchanged.

- **30 minutes** since activity: unfinished sessions become effectively `abandoned`; reads derive this without writing status. Eligible explicit resume/new answers reactivate them.
- **24 hours from original `createdAt`**: unfinished resume, answer processing (including retries), and first completion stop. No late or automatic partial award.
- **7 × 24 hours from original `createdAt`**: normal reads, resume, answers/completion retries, and surveys stop for every status. An already-awarded report remains readable after 24 hours, but not after seven days.

These are elapsed UTC durations with inclusive expiry boundaries, not sliding or calendar-day windows. Creation initializes activity; explicit eligible resume, newly accepted answers, and first completion refresh it. Reads/discovery, duplicate acknowledgements, completion retries, surveys, invalid requests, and browser events do not.

Seven days also starts cleanup eligibility, **not guaranteed physical erasure**. While maintenance is disabled, expired rows can remain until explicit deletion. A healthy daily schedule would normally delete around age 7–8 days; missed runs, locks, or backlog can delay deletion without extending access. Backups/WAL/PITR/replicas have separate retention.

Every existing-session operation authenticates **both** a canonical 36-character UUID `sessionId` (normalized lowercase) and an exact 64-hex-character `sessionToken` (not case-normalized). The server creates the token from 32 random bytes. Unknown IDs and wrong tokens share `not_found`; authentication precedes expiry/content disclosure. No cookie ownership, token-only helper, token refresh, or client-ID recovery exists.

`rawClientId`, stored at `devgrade.clientId`, is hashed server-side only for best-effort **five creations per trailing 60 minutes**. It grants no listing, ownership, or deletion rights; simultaneous creations can exceed that nominal limit.

## 2. Durable content and evaluation

`selected_question_ids` defines membership, presentation order, and count. There is no separate stored count, current index, expiry column, or `expired` status.

- `test_sessions.question_snapshot`: versioned private questions, keys/explanations, weights/provenance, and pillar labels/descriptions/order.
- `session_answers`: one accepted selection/duration per question, server correctness and timestamp.
- `session_results` and `session_category_scores`: normalized overall/pillar scores and weights.
- `session_results.report_snapshot`: immutable awarded result, public questions in selected order, saved pillar metadata, completion time, and format/scoring versions.
- `session_surveys`: separate mutable helpfulness rating.

New writers always provide snapshots. Validation rejects unsupported/malformed snapshots and selected-order/configuration mismatches with `snapshot_unavailable`; it never repairs history from today's bank. Null snapshots are legacy-only. Report parsing allowlists nested fields; reads/replays neither rescore nor reconstruct private content. Preserve referenced bank/category identities; retire content rather than delete it.

Sampling uses exactly **1/2/4 core + advanced pairs per pillar** for 8/16/32 questions (weights 1/2), without replacement. Any active-pool shortfall returns `insufficient_questions` without insertion, substitutes, or shortening. Questions are shuffled for presentation; option order is preserved. The seed contains 144 React questions, six core and six advanced per level/pillar bucket.

Grading uses saved questions and pinned **v1** rules:

```text
pillar % = 100 × sum(correct × weight) / sum(weight) within that pillar
overall % = 100 × sum(correct × weight) / sum(weight) across all questions
```

Wrong answers stay in the denominator. Percentages round to two decimals before tier assignment: **≥80 Proficient; ≥50 and <80 Developing; <50 Skill gap**. Only pillars below 50 enter `skillGaps`. Quick pillar scores are 0/33.33/66.67/100; Standard/Deep refine the steps without statistical-confidence or cross-set comparability claims. For Quick, correct weights 3/2/1/3 out of 3 each yield 9/12 = **75**, Developing, with only the third pillar flagged. No timing/focus-loss penalty, partial credit, code execution, or AI grading is applied.

The report includes ordered `{ questionId, isCorrect, explanation }` results, never a `correctAnswer` index. Explanations can reveal answers and are released only after completion. Normalized rows and the safe report come from one calculation in one transaction.

## 3. Operations and wire contracts

All eight `server/assessmentFns.ts` functions are **POST**, with **`Cache-Control: no-store`** and credentials in payloads, never URLs. Validation, service, DB-initialization, and unexpected failures are sanitized inside this envelope:

```ts
{ ok: true, data: T }
// or
{ ok: false, error: { code, message } }
// existing_attempt additionally carries error.blockers: SessionMetadata[]
```

These are TanStack Start server functions, not literal `/api/sessions` REST routes. Logical `AssessmentError.status`/`toErrorResponse` mappings are **not automatically emitted HTTP statuses**. The adapter unwraps typed `AssessmentClientError`; callers inspect codes, not messages. See [PRD §7](../prd.md#7-api-specifications) for inputs and logical errors.

Validation happens before DB work: exact numeric count 8/16/32 (missing defaults to 8), `rawClientId` length 1–1024, question ID length 1–50, nonnegative integer option within the saved options, integer duration **0–3600**, and integer survey rating **1–5**. No submitted secrets, Zod issues, or raw DB errors are exposed.

### Creation and discovery

Creation validates all optional `knownCredentials`, authenticates/locks known parents in deterministic ID order, then checks fresh DB time and child progress before inserting. Any authenticated unfinished attempt below 24 hours blocks creation—even inactive or unrestorable content, regardless of requested settings. Completed/attempt-expired sessions do not block.

Creation and discovery lists each have a **1,000-credential maximum**, rejected rather than truncated. Parent and answer-ID metadata queries use **100-entry batches**; creation locks all known parents before any child reads. Discovery returns one `available` metadata entry or generic `unavailable` plus supplied ID for missing/wrong-token/access-expired credentials. Metadata includes original configuration/count/creation time, deadlines, status, progress, `blocksCreation`, and `canResume`, not question/answer content.

This is **known-credential gating, not global ownership**. There is no list-by-client-ID or one-attempt-per-person guarantee; omitted/lost credentials cannot be discovered.

Success contracts in `domain/sessionContracts.ts`:

```ts
type CreatedSession = SessionCredential & AssessmentView;

interface AcceptedAnswerResult extends SessionProgress {
  success: true;
  sessionComplete: boolean;
  acceptedAnswer: AnswerInput;
  acceptedAnswers: AnswerInput[];
}
```

Creation is **flat**: `kind: "assessment"`, ID/token, original configuration/creation time, deadlines/status/eligibility metadata, all ordered `PublicQuestion` objects, empty `acceptedAnswers`, and initial progress. There is no nested `assessment` field. Recovery retains the token and passes the safe view to the machine.

### Reads versus resume

`getSession` is read-only, returning five `kind` variants before access expiry:

| Kind                  | Meaning                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `assessment`          | Original configuration/status/deadlines, safe ordered questions and accepted selections/durations, counts and `nextQuestionId` |
| `report`              | Immutable `reportSnapshot`, ID, deadlines, separate nullable `surveyRating`                                                    |
| `legacy_summary`      | Persisted overall/pillar summary, framework/level, completion time, deadlines/survey; no invented question history             |
| `attempt_expired`     | Unfinished metadata/deadlines only; no questions, resume, or partial score                                                     |
| `legacy_unrestorable` | Unfinished null-snapshot metadata; cannot resume but blocks creation below 24 hours                                            |

Completed state precedes attempt expiry; unfinished expiry precedes legacy content. Invalid non-null snapshots are errors, not legacy substitutes.

`resumeSession` locks/reactivates an eligible unfinished session, refreshes activity, and returns its assessment view. Other retained states return the corresponding completed/expired/legacy view without activity writes; access expiry still fails. Read/resume does not itself award a report. An all-answered unfinished attempt has `nextQuestionId: null`; the browser may explicitly complete after Resume only before the server cutoff.

### Answers, completion, survey, and deletion

- **Answer:** new acceptance saves correctness/duration and refreshes activity atomically. Same-option replay returns the original accepted answer/duration without writes; a different option conflicts. Eligibility checks precede replay. Success returns **all `acceptedAnswers` in selected-ID order**, plus `acceptedAnswer`, `answeredCount`, `totalQuestions`, `nextQuestionId`, and `sessionComplete`. The next ID is the first unanswered selected ID, not count-as-index; questions still arrive up front. No pre-completion correctness/explanation is returned.
- **Complete:** first completion requires exactly the selected accepted-ID set, not just equal counts. Under the parent lock it writes normalized results/pillars, report JSON, completed status, and timestamps atomically. It returns **`ReportView | LegacySummaryView` directly**, not a transient `AssessmentResult`. First completion returns the persisted report with `surveyRating: null`; replay returns the saved report or legacy summary and current survey without rescoring/activity writes. Legacy replay does not require an error-driven follow-up read. `sessionComplete` on an answer only means all answers exist, not an awarded report.
- **Survey:** authenticated completed state and normal access are required. Upsert 1–5 without changing the award or activity.
- **Delete:** authenticated `{ sessionId, sessionToken, expectedState: "unfinished" | "completed" }` compares the caller-confirmed state under the parent lock. Match returns `{ kind: "deleted" }` after cascades; mismatch returns `{ kind: "changed_state", currentState }`, preserving a newly completed report. Allowed even after expiry while the row exists. Missing/wrong credentials remain `not_found`, including a retry after deletion. Cascades remove session children and snapshots, not the bank. Closing a tab or forgetting a handle is not server deletion.

### Transaction guarantees

Answer/resume/complete/survey/delete lock the authenticated parent **before children**, then obtain fresh PostgreSQL `clock_timestamp()` time. Waiting across a cutoff cannot use stale transaction-start time. Creation applies the same discipline across the complete known list. Success is returned after commit; parent serialization and unique constraints prevent duplicate awards/answers without catch-and-continue in an aborted transaction.

`getSession` and discovery use short **read-only `REPEATABLE READ`** transactions for coherent snapshots, without update locks or activity writes. A previously authorized response cannot be recalled after later deletion. Maintenance also locks parents first (§5); this does not add global creation uniqueness or creation-request idempotency.

## 4. Browser recovery

### Storage and creation safety

`sessionStorage.ts` saves JSON **`version: 1`** under **`devgrade.session.<sessionId>`** (prefix `devgrade.session.`): ID/token, optional ISO `attemptExpiresAt`/`accessExpiresAt`, and optional `hint: { framework, targetLevel, questionCount }`. Hints are not authority. No active pointer, questions, answers, reports, grading data, or serialized XState actor is stored. Recovery owns credentials per mounted flow, not in an SSR singleton. Same-origin scripts/shared-profile users can read tokens; there is no account or cross-device recovery.

Scans merge all prefixed records with in-memory credentials. Damaged hints/versions preserve valid credentials but flag corruption; key/ID mismatch or conflicting tokens also fail closed. Missing/inaccessible disk state never drops a known memory credential. Over 1,000 handles, blocked/full/corrupt storage, failed discovery, or missing/duplicate discovery entries **prevent new creation**, not silently shorten its known list.

The **`devgrade.session-lifecycle` Web Lock** covers scan → discovery → gate → storage preflight → create → persist and related handle/deletion work. A per-instance queue is the fallback, **not cross-tab locking**. Human choices release the lock; each new creation attempt reacquires it and rescans. Preflight verifies/removes a separate 1,024-character `devgrade.storage-probe.<uuid>` write without overwriting handles.

If creation succeeds but handle persistence fails, credentials remain in memory, the UI warns, and the machine **uses the returned assessment directly**. No follow-up read or replacement creation is needed; refresh/close can lose the unsaved handle. A creation response lost before credentials arrive remains a deferred idempotency gap.

Canceling queued/discovering creation prevents a later create call: abort is checked before scanning, after discovery, and before sending creation. Cancellation cannot unsend an in-flight request. If it succeeds after cancellation, recovery still remembers the credentials under the same lock so later discovery can find it.

### State, requests, and restoration

The machine separates **`history`, `creation`, `viewing`, and `attempting`** state groups. The redundant `active`, `gateRequested`, `createOnCheck`, and `keepQuestion` flags are removed. `afterDelete` holds only the requested configuration for a delete-from-creation-gate continuation.

- Bootstrap/history discovers metadata without creating or auto-resuming. Opening is read-only, never permission to answer or first-complete. Explicit Resume restores the **original server configuration**, not new-intake settings, and enters attempting.
- **No automatic `getSession` after successful create, answer, complete, or resume.** Apply returned views directly; answer success replaces the whole accepted set and progress. Ordinary answers use one submit request; final answers use answer + complete. An all-answered Resume can still require a separate completion request.
- Explicit opens/refreshes, conflict/expiry reconciliation, and ambiguous completion failures still read. Ambiguous answer failure retains the exact pending answer/duration for replay. Successful responses describe committed state at that operation, not a promise that another tab cannot change it.
- First unanswered position comes from selected-ID membership. Fresh open/resume clears unsubmitted choices; `applyView` preserves selection/timing when reconciliation leaves the same unanswered question.
- A blocker offers Resume or confirmed Delete, never Forget/Start-anyway. Delete confirmation initially focuses Cancel; Escape cancels. Cancel clears pending creation intent. Confirmed deletion/unavailability removes only the matching handle, then rescans before continuing creation. `changed_state` preserves row/handle, clears automatic creation intent, and opens the current view without silently changing the destructive expectation.

History retains completed handles across new attempts and shows server configuration/count/progress/status and both deadlines, newest-created first. Reports render **saved** public questions, pillar/radar metadata, and awarded results; legacy views render persisted summaries only. Separate saved survey state restores thanks/rating; the API allows upserts, but the thanks UI has no change-rating control.

Storage/visibility/online events, manual refresh, advisory deadlines, and a bounded gate refresh recheck eligible screens. Server-confirmed `not_found`, `access_expired`, or discovery `unavailable` removes the matching handle; transient errors preserve it and removal failures warn. Seven-day denial can clear handles while the DB row remains with maintenance disabled. Unopened browser storage and viewed copies are not remotely erased.

### Timing

Display and submission use `boundedDuration`: finite rounded integer seconds clamped to **0–3600**, non-finite values becoming zero. Resume/new-question entry resets timing; hidden-tab and observed offline intervals pause it, and time between visits is not reconstructed. Same-question reconciliation preserves elapsed time; pending retries preserve the captured duration rather than add network waiting. Timing/focus loss does not affect scores or extend server deadlines.

## 5. Maintenance implementation

`runSessionMaintenance(db)` has **no options**. Two implementation modules—`sessionMaintenance.ts` and `sessionMaintenanceHandler.ts`—plus thin routing replace the configurable three-module design. Public options/Zod tuning schemas and oldest-row/lag reporting are removed.

Fixed limits: **200 rows/batch, at most five batches per operation, 20-second cooperative budget, 5-second idle-work reserve, 1-second statement timeout, 250ms lock timeout**. Deletion gets the first 15-second window. Pool/network unavailability is not bounded by this cooperative budget; hosting limits remain necessary.

One PostgreSQL clock establishes fixed cutoffs, preserving timestamp precision and elapsed 24-hour days:

1. Delete all-status parents with `created_at <= cutoff − 7 days`, ordered by `(created_at, id)`.
2. Mark retained `in_progress` parents (`created_at > deletion cutoff`) abandoned where `last_activity_at <= cutoff − 30 minutes`, ordered by `(last_activity_at, id)`.

Both use parent-first `FOR UPDATE SKIP LOCKED`, repeat eligibility in the mutation, and commit each batch independently. Earlier commits survive later failure; interrupted transactions roll back. Work is awaited, never detached; repeated/overlapping runs can retry skipped rows.

The summary contains `ok`, `durationMs`, `clockFailure`, and `deletion`/`abandonment`, each with `count`, `batches`, `cap`, `failure`, `backlog`, `backlogFailure`. Caps are `batch_limit`, `budget`, or null; failures classify statement timeout, lock timeout, or database error. Bounded `EXISTS` checks include locked/skipped eligible rows: **`backlog: true` = remains, `false` = none observed, `null` = unknown**. Observation failures include budget exhaustion. A short batch is not proof of drainage. HTTP 200/`ok` can still carry caps/backlog requiring attention; unknown is never success at catching up.

`/api/internal/session-maintenance` authenticates before method, activation, or DB access. `CRON_SECRET` must be high-entropy, 32–256 bearer-safe characters (`[A-Za-z0-9+/_-]+={0,2}`); SHA-256 digests are compared with `timingSafeEqual`. Invalid auth gets 401; authenticated non-GET (including HEAD) gets 405/`Allow: GET`. Only literal **`SESSION_MAINTENANCE_ENABLED=true`** enables work; otherwise authorized GET returns 200 `{ ok: true, enabled: false }` without initializing the DB. Enabled requests lazily initialize and await the runner. Explicit output/log projections exclude identities, secrets, and content; logging failures cannot change committed outcomes. Every response is no-store; enabled success is 200, failed summaries/unexpected failures are 503. No caller URL/body tuning exists.

**No cron configuration root or actual schedule has been verified; no production activation is claimed.** Use the [deployment runbook](session-lifecycle-plan.md#deployment-runbook), not endpoint existence, as the activation checklist.

## 6. Verification and source map

**Verification record — not rerun for this documentation update:**

- **Maintenance PostgreSQL: user-confirmed successful run, zero failures and zero skipped tests.** The passing-test total and output were not captured in the handoff; the earlier interrupted agent attempts are not recorded as failures or successful runs.
- **Final regression:** the user reports that the full database-backed suite, lint, typecheck, and production build have already been run. Per-command outcomes were not supplied, so this record does not infer a new all-green result or resolution of the earlier chart errors.
- Earlier agent-recorded **post-Phase A+B PostgreSQL suite: 344 passed, 0 skipped**. This is a historical A+B count, not the final Phase C count.
- Browser: **five scenarios, 137 named checks**. **62 ordinary answers** each used one submit request/no get; **three final answers** each used two requests (answer + complete); **five starts** used discovery + create/no get; explicit Resume used one request.
- Covered 8/16/32 completion/reload/resume/report/survey, Resume/Delete gate/cancel/cascades, two same-context Web-Locked tabs producing one creation, ≥24-hour late-completion rejection, seven-day report denial, and keyboard/320px/dark/RTL without overflow.
- **129 no-store responses** observed; **120 pre-completion responses** checked without answer-key markers. These are exercised-response counts, not exhaustive guarantees.
- Earlier direct app/UI lint and web build passed. Clean-branch typecheck passed before restoring unrelated user chart edits; the subsequent check reported **three pre-existing `chart.tsx` errors at lines 154/158**. No fix is claimed by this documentation update.
- Root pnpm lint/version launch failed switching to **10.33.4** because of signature verification. Reported fallback used pinned **pnpm 10.20** and direct installed tools. No successful root lint/build wrapper run is claimed.

Tests use `node:test`, not Vitest/Jest. Export an explicit dedicated `TEST_DATABASE_URL`; from `apps/web`, run installed lockfile-resolved tools:

```sh
node --import tsx --test "src/**/*.test.ts"
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node node_modules/vite/bin/vite.js build
```

Also run the installed ESLint command from `packages/ui` (no UI build script). The test fixture uses unique data/migration schemas and real migration copies, cleaning only its own resources. Missing `TEST_DATABASE_URL` skips DB suites; configured failures fail. It never falls back to `DATABASE_URL` or loads the app's `.env`. Independent clients verify schema/backend identity and use observable lock barriers rather than sleeps/single-connection pseudo-concurrency. `node --import tsx` avoids the CLI IPC startup in restricted environments; direct tools bypass the launcher without changing the project's pin or validating root Turbo.

Source map, relative to `apps/web/src/`:

- Policy/contracts/content/scoring: `domain/{sessionLifecycle,sessionContracts,sessionSnapshots,scoring}.ts`.
- Storage/transactions/API: `db/{schema,queries}.ts`, `server/{sessionAccess,assessmentService,assessmentValidation,assessmentHandlers,assessmentFns,errors}.ts`.
- Browser: `machines/{sessionStorage,sessionRecovery,assessmentMachine,assessmentServices,createSessionAdapter}.ts`, `components/assessment/AssessmentFlow.tsx` and report/history/confirmation/timer components.
- Maintenance: `server/{sessionMaintenance,sessionMaintenanceHandler}.ts`, `routes/api/internal/session-maintenance.ts` and corresponding tests. Schema migration: `apps/web/drizzle/0002_dazzling_may_parker.sql`.

Publishing and authorized operational rollout remain in the [delivery plan](session-lifecycle-plan.md).
