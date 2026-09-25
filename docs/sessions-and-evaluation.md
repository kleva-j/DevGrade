# Assessment sessions and evaluation

**Implementation reference — 2026-09-25, lifecycle Stages 1–3 delivered in source; current layer `session-lifecycle/recovery`.**

[PR #1](https://github.com/kleva-j/DevGrade/pull/1) exists for the first lifecycle layer. This document describes current source and reported validation, **not production deployment**. Browser recovery is implemented; Stage 4 maintenance/rollout remains **pending**, with no active scheduled cleanup. See the [delivery plan](session-lifecycle-plan.md) and [PRD](../prd.md).

## 1. Current behavior at a glance

- Anonymous, React-only assessments; free **Quick (8, default), Standard (16), Deep (32)**. The full stratified set is selected at creation, not adapted after each answer.
- PostgreSQL stores the session, immutable question/report snapshots, accepted answers, normalized scores, and optional survey. The browser persists minimal credential handles, not questions/reports or XState snapshots; server reads restore the in-memory view.
- The server enforces **24-hour attempts**, **seven-day normal access**, and **30-minute effective inactivity**. Both deadlines use the session's original `createdAt`, never completion or latest activity.
- Authenticated discovery, reads, resume, expected-state deletion, and retry-safe answer/completion operations exist as typed, non-cacheable POST server functions.
- The browser discovers saved sessions, offers Resume/Delete before new creation, restores original configuration/progress and immutable reports/surveys, and reconciles typed lifecycle outcomes. Same-browser Web Lock coordination is implemented where supported.
- No scheduled cleanup, maintenance endpoint, or inactivity sweep is active in this implementation. Access expiry does not itself delete a row.

## 2. Credentials, validation, and the wire boundary

| Identifier     | Creation/storage                                                                                                                                      | Authority                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `rawClientId`  | Browser UUID in `localStorage` at `devgrade.clientId`; only its SHA-256 hash is stored as `client_id`                                                 | Anonymous creation-rate grouping only; never ownership, listing, or deletion permission      |
| `sessionId`    | PostgreSQL UUID; saved in a per-ID browser handle and referenced by the machine                                                                       | Identifies one session                                                                       |
| `sessionToken` | Server-generated 32 random bytes encoded as 64 hex characters; stored verbatim in PostgreSQL, the browser handle, and the recovery layer's memory map | Secret used **with the session ID** to authenticate access; UI/machine callers pass only IDs |

Credentials are validated before DB work: a canonical 36-character UUID spelling (normalized to lowercase) and exactly 64 hexadecimal token characters. Tokens are compared exactly, not case-normalized. Answer inputs require a nonempty question ID of at most 50 characters, a nonnegative integer option index within the saved question's options, and integer time **0–3600 seconds**. `rawClientId` is a string of length 1–1024; surveys accept integer ratings **1–5**. Invalid inputs return safe `bad_request` failures without serializing Zod issues or submitted secrets.

Authentication matches **both ID and token** before disclosing session details or expiry. Unknown IDs and wrong tokens produce the same `not_found`. No token-only access/deletion helper or cookie-ownership path remains. The raw client ID is not required for existing-session operations and cannot recover lost credentials. There is no token rotation/refresh protocol; deadlines are enforced by the service, not embedded in the token.

All eight functions in `server/assessmentFns.ts` use POST and `Cache-Control: no-store`, including discovery and reads. Credentials go in payloads, never URLs. The handler boundary validates inside the safe envelope and sanitizes validation, service, DB-initialization, and unexpected failures:

```ts
{ ok: true, data: T }
// or
{ ok: false, error: { code, message } }
// existing_attempt also includes error.blockers: SessionMetadata[]
```

These are TanStack Start server functions, **not** literal `/api/sessions` REST routes. `AssessmentError.status` and `toErrorResponse` provide logical HTTP mappings; the active adapter does not turn those mappings into HTTP status responses. Consumers must inspect `ok` and the typed error code, not parse messages. The browser adapter unwraps failures into `AssessmentClientError`, preserving their code/payload. The recovery layer and XState machine handle typed conflicts, expiry, completed/legacy states, and unavailability without parsing message strings.

## 3. Lifetimes, activity, and deletion eligibility

| Boundary                                     | Active server behavior                                                                                                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lastActivityAt + 30 minutes`                | An unfinished session is effectively `abandoned` at or after this point. This is inactivity, not terminal expiry. Reads derive the status without writing it.                                                                                  |
| `attemptExpiresAt = createdAt + 24 hours`    | At or after this time, no unfinished resume, answer processing (including retries), or first completion. Authenticated metadata remains readable until access expiry.                                                                          |
| `accessExpiresAt = createdAt + 7 × 24 hours` | At or after this time, normal reads, resume, answer/completion operations, and surveys are denied, regardless of stored status. Discovery returns generic `unavailable`. Authenticated explicit deletion remains allowed while the row exists. |

These are elapsed UTC durations with inclusive expiry boundaries, not calendar days. Mutation checks use fresh PostgreSQL `clock_timestamp()` time after acquiring locks. Neither deadline slides forward.

Creation initializes activity. Explicit eligible resume and newly accepted answers set `in_progress` and refresh `lastActivityAt`; first completion sets `completed` and refreshes activity. Reads/discovery, same-option acknowledgements, completion retries, surveys, invalid requests, option selection, timer ticks, and focus changes do not refresh activity. A stored `abandoned` attempt remains resumable within 24 hours if its saved content is valid.

Seven days also defines cleanup eligibility, **not a physical-erasure deadline**. Stage 4 plans daily all-status deletion at `0 3 * * *` UTC. Once operational, healthy deletion would normally occur around ages 7–8 days, with further delays possible after failures, lock contention, or backlog. Currently no such job runs in this implementation; retained rows remain inaccessible after seven days. Backup/WAL/replica retention is separate from live-row deletion.

## 4. Creation, discovery, and the known-credential gate

`createSession` accepts `framework`, `targetLevel`, optional `questionCount`, `rawClientId`, and optional `knownCredentials`. Only React is enabled. Length accepts exactly numeric **8, 16, 32**; omission defaults to 8 without coercion.

Creation validates the **entire** supplied credential list before opening a transaction. It then authenticates and locks known parents in deterministic ID order, obtains fresh DB time, and checks all of them before inserting anything. Any authenticated unfinished session younger than 24 hours blocks creation, regardless of framework, level, length, inactivity, or missing/corrupt question snapshot. The response is `existing_attempt` with safe blocker metadata. Completed and attempt-expired sessions do not block; unavailable credentials confer no authority.

Both `knownCredentials` and discovery's `credentials` have a maximum of **1,000 entries**, rejected rather than truncated when exceeded. Parent queries and answer-ID metadata reads use **100-entry batches**. Creation locks all authenticated parents before reading children; it does not trust an earlier discovery response or authorize insertion from only a partial batch. Discovery is metadata-only, not an answer/content download.

`discoverSessions({ credentials })` returns an entry for each supplied credential:

- `available` with session ID, creation time, original configuration/count, both deadlines, effective status, answered/total counts, `blocksCreation`, and `canResume`;
- `unavailable` with only the supplied session ID for missing rows, token mismatches, or access-expired rows. These cases are intentionally indistinguishable.

This is **known-credential gating, not global ownership or one-attempt-per-person enforcement**. There is no list-by-client-ID capability. The browser now supplies its complete checked list, combining stored and in-memory handles, under the `devgrade.session-lifecycle` Web Lock where supported. Blocked/full/corrupt storage fails closed for new creation, rather than silently omitting known sessions. Cleared storage, another profile, omitted credentials, unsupported cross-tab locking, and a lost creation response remain limits (§8).

After the gate, creation hashes `rawClientId` and counts all-status sessions in the trailing **60 minutes**, rejecting when there are already **5 or more**. This remains best-effort rate limiting: there is no per-client identity lock, and simultaneous creations can exceed the nominal cap. Changing the client ID also changes its grouping.

The active pool is filtered by framework/level and ordered by ID. A random token seeds sampling without replacement; the chosen set is shuffled for presentation, while option order is preserved:

| Length       | Core (weight 1) per pillar | Advanced (weight 2) per pillar | Total weight per pillar |
| ------------ | -------------------------: | -----------------------------: | ----------------------: |
| Quick: 8     |                          1 |                              1 |                       3 |
| Standard: 16 |                          2 |                              2 |                       6 |
| Deep: 32     |                          4 |                              4 |                      12 |

Any class shortfall fails with `insufficient_questions` and no session insert: no substitutions, repeated IDs, or silent shortening. The source bank has six core and six advanced items per pillar/React level; a deployment still needs a sufficiently populated active bank.

Creation saves the selected IDs and private content snapshot, sets `createdAt`, `startedAt`, and `lastActivityAt` from DB time, then returns `sessionId`, `sessionToken`, both deadlines, `totalQuestions`, and **all** `PublicQuestion` objects. No answer key or explanation is released.

## 5. Durable content and evaluation

`selected_question_ids` is authoritative for membership, order, and count. There is no separately stored preset/count, current-question index, or expiry status.

| Storage                                       | Purpose                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `test_sessions.question_snapshot`             | Private, versioned ordered questions: public presentation, keys, explanations, weights, provenance, and pillar labels/descriptions/order |
| `session_answers`                             | One accepted selection per session/question, original duration, server-computed correctness, server timestamp                            |
| `session_results` + `session_category_scores` | Normalized overall and per-pillar result/weights/proficiency                                                                             |
| `session_results.report_snapshot`             | Immutable awarded result, public questions in selected order, saved pillar metadata, completion timestamp, format/scoring versions       |
| `session_surveys`                             | Mutable helpfulness rating, separate from the immutable report                                                                           |

New writers always provide snapshots; nullability supports legacy rows only. Snapshot validation checks supported versions, exact selected-ID order, configuration, and pillar membership. Unknown/malformed content fails closed with `snapshot_unavailable`. It is never repaired by fetching today's bank. Report parsing allowlists fields, including nested fields, and report reads never rescore or rebuild from private/current question content. Preserve identities referenced by foreign keys; retire bank rows instead of deleting them.

### Scoring

Submission grades against the saved question, and first completion computes the award from accepted selections and the saved inputs using pinned **v1** scoring:

```text
correct = 1 if selectedAnswer == saved correctAnswer, otherwise 0
pillar % = 100 × sum(correct × weight) / sum(weight) within the pillar
overall % = 100 × sum(correct × weight) / sum(weight) across all questions
```

Wrong answers remain in the denominator; there is no negative marking, individual partial credit, timing/focus-loss penalty, code execution, or AI grading. Each pillar contributes equally at each preset. Percentages are rounded to two decimals before tier assignment: **≥80 Proficient**, **≥50 and <80 Developing**, **<50 Skill gap**. `skillGaps` contains only pillars below 50. Framework/target level remain part of the result; scores are not calibrated across levels, lengths, or sampled sets.

For Quick, pillar scores are 0 / 33.33 / 66.67 / 100. Standard and Deep refine steps to 100/6 and 100/12 percentage points. In a Quick example with pillar correct weights **3, 2, 1, 3** out of 3 each, the total is **9/12 = 75**, Developing, and only the third pillar is a skill gap. Four advanced-only correct answers instead yield **8/12 = 66.67%**, not the unweighted 50%.

The report contains overall/normalized category scores and per-question `{ questionId, isCorrect, explanation }` in selected presentation order. It has no `correctAnswer` index field. Explanations can reveal answers and are deliberately available only after completion. Normalized rows and the safe report snapshot are written from the same calculation in the same transaction.

## 6. Reads, resume, answers, completion, and deletion

### Reads versus explicit resume

`getSession(credential)` is read-only and returns exactly five `kind` variants before access expiry:

| Kind                  | Payload/meaning                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assessment`          | Original configuration, both deadlines, effective status, safe ordered questions, accepted selections/durations without correctness, answered/total counts, and `nextQuestionId` |
| `attempt_expired`     | Minimal authenticated unfinished metadata/deadlines, no questions or partial score; no longer blocks creation                                                                    |
| `report`              | Saved full `reportSnapshot`, session ID, both deadlines, and separate nullable `surveyRating`                                                                                    |
| `legacy_summary`      | Persisted overall/pillar summary, framework/level, completion time, both deadlines, survey rating; no invented historical question review                                        |
| `legacy_unrestorable` | Unfinished null-snapshot metadata; cannot resume, but blocks creation while younger than 24 hours                                                                                |

Completed state is considered before attempt expiry, so an already-awarded report remains readable after 24 hours until seven days. For unfinished rows, attempt expiry takes precedence over legacy content. Malformed non-null snapshots are errors, not fabricated legacy summaries.

`resumeSession` locks the parent and reactivates an eligible unfinished session, refreshing activity and returning the authoritative assessment view. Completed, attempt-expired, or unrestorable legacy rows return their corresponding view **without** changing activity; resume does not throw merely because the attempt is expired. Access-expired rows still fail. All-answered unfinished sessions have `nextQuestionId: null`, but resume/read does not auto-complete them. First completion remains subject to the 24-hour deadline.

### Answer retries and progress

`submitAnswer` authenticates, checks normal access/unfinished attempt eligibility, validates saved membership/options, then:

- For a new answer, saves correctness and the accepted duration, reactivates the parent, and refreshes activity atomically.
- For the same previously accepted option, acknowledges the **original** answer/duration with no answer, timing, status, or activity writes. A different valid retry duration does not replace the first one.
- For a different option on an answered question, returns `conflict`; it never overwrites the accepted selection.

Success returns `{ success: true, sessionComplete, acceptedAnswer, answeredCount, totalQuestions, nextQuestionId }`. Progress is derived by selected-ID set membership; `nextQuestionId` is the **first unanswered selected ID**, not an answer count used as an index. Question content is still delivered up front. Submission order is not enforced, though the UI is sequential. No answer correctness/explanation is returned here.

`sessionComplete` means all selected IDs have accepted answers, not that a report was awarded. Normal expiry/completed checks precede duplicate acknowledgement: late answer retries cannot revive an expired attempt or modify a completed session.

### Completion and surveys

First completion requires the accepted-ID set to match the selected set exactly, not merely the same count. Under the parent lock it computes the saved award, writes normalized results/pillar rows/report JSON, and marks the session completed atomically. Missing/extra/invalid accepted answers fail; no automatic partial report is generated.

Repeated completion returns the already saved `reportSnapshot.result` without rescoring or touching activity. This also works after 24 hours if the report was committed earlier and normal access remains open. A legacy completed session instead returns `legacy_summary_available`, directing the caller to `getSession`; it is not rescored. The completion success payload remains `AssessmentResult`, not the full `ReportView`. The Stage 3 machine does not render that transient result: it rereads `getSession` and renders the saved award and separate survey state.

`submitSurvey` requires authenticated completed state and normal access. It upserts an integer 1–5 rating, leaving the award and session activity unchanged.

### Expected-state deletion

`deleteSession({ sessionId, sessionToken, expectedState })` accepts `expectedState: "unfinished" | "completed"`. This represents the state the caller confirmed in the implemented inline Delete confirmation screen (Cancel receives initial focus; Escape cancels). Under the parent lock it compares that expectation with current completed/unfinished state:

- match → delete the parent and return `{ kind: "deleted" }`;
- mismatch → return `{ kind: "changed_state", currentState }` without deleting anything.

Thus an unfinished-attempt confirmation cannot silently erase a report completed in another tab. Deletion remains authorized after either deadline. Wrong/missing credentials still produce generic `not_found`; no tombstones or token-only fallback exist. A lost deletion response can be retried/rechecked, but a now-missing row does not produce a second `deleted` acknowledgement.

Cascades remove answers, results, pillar scores, surveys, and both snapshot fields; question-bank content stays. Closing a tab, resetting XState, or forgetting a browser handle is not server deletion.

## 7. Concurrency guarantees

`sessionAccess.ts` centralizes authenticated access and transaction discipline:

- Answer, resume, completion, survey, and deletion acquire `FOR UPDATE` on the authenticated parent **before child reads/writes**. Fresh DB time is read after lock acquisition; transaction-start `now()` cannot authorize a request that waited across a deadline.
- Creation locks supplied authenticated parents in deterministic ID order across all batches before reading child progress and evaluating blockers. It rechecks on the server rather than trusting discovery.
- `getSession` and discovery use short, **read-only `REPEATABLE READ`** transactions for coherent multi-query snapshots. They do not lock for update or write activity/status. A read authorized on its snapshot cannot be recalled by a later deletion.
- Mutation results are acknowledged only after commit. Parent serialization plus unique constraints prevents duplicate answer/report writes; there is no catch-and-continue query in an aborted uniqueness transaction.

The former unlocked submit/completion races are fixed, and Stage 3 adds browser reconciliation and Web Lock coordination. This still does not claim global creation uniqueness, creation-request idempotency, or concurrency with an implemented cleanup worker; maintenance remains pending.

## 8. Browser recovery, storage, and timing

### Exact saved-handle format

`machines/sessionStorage.ts` uses localStorage keys **`devgrade.session.<sessionId>`** (`SESSION_STORAGE_PREFIX = "devgrade.session."`) and JSON **`version: 1`** (`SESSION_STORAGE_VERSION = 1`). Each handle contains `sessionId`, `sessionToken`, optional ISO `attemptExpiresAt` / `accessExpiresAt`, and optional `hint: { framework, targetLevel, questionCount }`. Normal writes save the server deadlines/configuration; optional hints are never authority. There is no active-session pointer. The unrelated `devgrade.clientId` remains rate-limit metadata only.

Only those fields are projected into storage: no questions, accepted answers, private grading data, report content, or serialized actor state. Storage is injectable and browser globals are accessed only when operations run; each mounted flow owns its own recovery instance, not a credential-bearing SSR singleton. Tokens are readable by same-origin scripts and users of that browser profile; no token-bearing links or account/cross-device recovery are provided.

A scan snapshots all prefixed keys, validates UUID/token and key-to-ID agreement, and merges valid handles into a per-flow memory map. Damaged hints/versions retain a recoverable credential but flag corruption; malformed records are not silently erased to enable creation. Missing or inaccessible disk state never drops a credential already known in memory, and a same-ID/different-token collision is corruption. More than 1,000 known handles blocks discovery/creation rather than truncating them.

### Fail-closed creation and same-browser coordination

Bootstrap discovers all known handles and shows server-derived history; it does not create or auto-resume. On Start, the recovery layer runs the entire scan → discovery → blocker check → storage preflight → server create → credential save sequence under **`devgrade.session-lifecycle`**. A per-instance queue serializes operations; `navigator.locks.request` adds cross-tab coordination where supported. Without Web Locks, only that local queue is guaranteed, not cross-tab or global uniqueness. Human choices never hold the lock; every later creation attempt reacquires it and rescans. Handle refresh/removal and confirmed deletion also use this coordination.

Discovery must return exactly one entry for every checked credential; omitted/duplicate entries fail closed. Blocked/unavailable, full, or corrupt storage, credential-limit errors, and incomplete/failed discovery prevent creation. The write preflight uses a separate random `devgrade.storage-probe.<uuid>` key, verifies a 1,024-character write, and removes the probe without overwriting a handle. It is a preflight, not a guarantee that a later write will succeed.

If **creation succeeds but saving its handle fails**, the credentials are retained in memory, the UI warns about recovery, and the machine continues by reading the newly created session. Retrying that read never creates a replacement. Refreshing/closing after a failed handle write can lose recovery access; a creation response lost **before credentials arrive** remains a separate deferred idempotency gap.

A found unfinished blocker offers **Resume** or confirmed server-side **Delete**, with original configuration/progress/deadlines. Canceling either the gate or confirmation cancels creation. Delete removes the handle only after confirmed deletion/unavailability, then rechecks all remaining sessions before continuing the original new-session request. A `changed_state` result preserves the handle, cancels automatic creation, and reads the current report/state; it never retries deletion with a changed expectation automatically. Transient failures retain handles. There is no “Forget” or “Start another anyway” bypass for a found blocker.

### Restoration, history, and report rendering

History is metadata-first and normally newest-created first. It shows the server's original framework/level/count, progress, status, and separate “Resume until” / “Report available until” deadlines. Completed-report handles survive starting another attempt. Opening an unfinished session performs a read and shows a ready/expired/legacy screen; **explicit Resume** is needed to reactivate it. Resume uses its **original configuration**, not the settings selected for a new assessment. All-answered unfinished sessions require explicit Resume/active flow before first completion, and the server still rejects it at or after 24 hours.

After answer acknowledgement or a reconcilable conflict/completed/attempt-expired/legacy outcome, the machine rereads `getSession`. It selects the first unanswered question by the authoritative accepted-ID set, never a local `index + 1` or answer count. `nextQuestionId` remains part of the server contract; the machine derives the same position from the refreshed ordered questions/accepted answers. All question content is still returned up front; reconciliation rereads a full safe view, not a next-question-content endpoint. Fresh open/resume clears unsubmitted choices; same-question background reconciliation preserves selection/timing. Transient answer retries retain the exact pending payload/duration; completion retry first reads state to recover a lost committed result or discover expiry.

Completed views render **`reportSnapshot`**: saved public question presentation, pillar labels/descriptions and radar metadata, and the awarded result, not current bank metadata or the transient completion payload. Legacy views render only their persisted summary. Survey state is loaded separately; an existing rating restores the thank-you/saved-rating display instead of a new prompt. The server still supports rating upserts, but this UI does not expose a change-rating control after thanks.

Storage events, visible/online return, manual refresh, and advisory deadline wakeups recheck server state in eligible screens; the gate also refreshes on a bounded interval. Browser clocks never authorize access or deletion. Server-confirmed `not_found` / `access_expired` or discovery `unavailable` removes only the matching handle (with a warning if local removal fails); transient failures preserve it. At seven days the view is denied and handles are cleared after server confirmation, **while the database row remains until explicit deletion or future Stage 4 cleanup**. This does not remotely erase unopened browser storage or copies of viewed reports.

### Client timing

Both the display and submitted duration use `boundedDuration`: rounded integer seconds clamped to **0–3600**, with non-finite values becoming zero. Explicit resume/new-question entry resets the timer; saved/offline time between visits is not reconstructed. Hidden-tab and observed offline intervals pause timing, and return shifts the start timestamp to exclude the paused duration. Retries reuse the originally captured duration, not later network waiting. Same-question reconciliation does not reset elapsed time. Focus loss remains an in-memory signal, not a persisted grading input. These timing changes do not extend server deadlines or affect scores.

Stage 3 source is delivered; Stage 4 still needs bounded maintenance and authorized rollout, without product/design expansion.

## 9. Verification and source map

**Stage 3 independent validation reported by the primary agent (2026-09-25):**

- **339 tests passed, 0 skipped**, using disposable **PostgreSQL 18.1**, real migrations, and the **144-question seed**. Existing independent-backend/lock-barrier coverage remains part of the suite.
- **Headed Chrome 153: five scenarios, 55 named checks.** Quick/Standard/Deep (8/16/32) completion, reload and saved-report/survey recovery; Resume/Delete gate, cancel, and DB cascades; two tabs in the same browser context using Web Locks produced **only one new session row**.
- Expired all-answered unfinished attempts could not complete late. At **age ≥7 days**, report access was denied and browser handles removed, while the DB row remained (no maintenance worker).
- **197 no-store responses** observed; **187 pre-completion responses** checked without answer-key markers. These counts describe the exercised responses, not every possible execution.
- Keyboard Delete confirmation and **320px mobile, dark, RTL** checked with no horizontal overflow; no console errors or HTTP 5xx observed.

Direct web/UI lint passed; web build passed **per the implementation agent**. Typecheck still reports only **three pre-existing shared `chart.tsx` errors**. The root `pnpm lint` / version launcher failed while switching to project-pinned **10.33.4** because of signature verification; pinned **pnpm 10.20** and direct checks were used instead. No successful root lint/build wrapper run is claimed. These are reported agent results, not tests/build/browser runs repeated by this documentation task or evidence of production deployment.

Tests use `node:test` via `tsx`, not Jest/Vitest. With a dedicated `TEST_DATABASE_URL` exported and a compatible Node runtime, run from `apps/web`:

```sh
node --import tsx --test "src/**/*.test.ts"
```

The normal root entry point is `pnpm --filter web test` (the package script uses `tsx --test`). Direct `node --import tsx` avoids the `tsx` CLI's IPC startup when that is restricted by a sandbox. The fixture creates unique data/migration schemas using temporary copies of real migrations and drops only its own resources. Without `TEST_DATABASE_URL`, PostgreSQL tests skip; configured failures fail. It never falls back to `DATABASE_URL` or loads the app's `.env`. Independent clients assert their schema/backend PID and use observable `pg_blocking_pids` barriers, not sleeps or `Promise.all` over a single connection.

The configured root entry points are listed below for reference, **not as successful Stage 3 launcher runs**:

```sh
pnpm --filter web typecheck
pnpm lint
pnpm --filter web build
```

The declared package manager remains `pnpm@10.33.4`; its automatic version-switch/signature failure is a tooling blocker, not a lint result. The reported fallback used pinned **pnpm 10.20** with direct checks, not a successful retry of the 10.33.4 launcher. To bypass that launcher without changing project configuration or dependencies, invoke the **installed lockfile-resolved tools** from `apps/web`:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node node_modules/vite/bin/vite.js build
```

For package-level lint coverage, also run `node node_modules/eslint/bin/eslint.js` from `packages/ui`. These package-tool fallbacks do not validate the root Turbo wrapper. Keep typecheck's existing chart failures separate from test/lint/build results; do not describe the complete validation set as green.

| Concern                                                                 | Source                                                                                                                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure policy, safe contracts, snapshot formats, scoring                  | `apps/web/src/domain/{sessionLifecycle,sessionContracts,sessionSnapshots,scoring}.ts` and `domain/__tests__/`                                                        |
| Schema and DB time                                                      | `apps/web/src/db/{schema,queries}.ts`; migration `0002_dazzling_may_parker.sql`                                                                                      |
| Authentication, parent locks, coherent reads/views                      | `apps/web/src/server/sessionAccess.ts`                                                                                                                               |
| Operations, validation, wire errors                                     | `apps/web/src/server/{assessmentService,assessmentValidation,assessmentHandlers,assessmentFns,errors}.ts`                                                            |
| Boundaries, batching, retries, deletion/creation races, coherent reads  | `apps/web/src/server/{sessionLifecycle.postgres,sessionContracts,assessmentValidation}.test.ts`                                                                      |
| Snapshot fidelity and all-length behavior                               | `apps/web/src/server/{assessmentSnapshots.postgres,assessmentService.postgres}.test.ts`                                                                              |
| Isolated real-DB concurrency fixture                                    | `apps/web/src/server/__tests__/postgresFixture.ts`                                                                                                                   |
| Browser credentials, coordination, discovery and recovery               | `apps/web/src/machines/{sessionStorage,sessionRecovery,assessmentMachine,assessmentServices,createSessionAdapter}.ts` and tests                                      |
| Recovery/history, confirmation, saved reports/surveys and bounded timer | `apps/web/src/components/assessment/{AssessmentFlow,SessionHistory,DeleteConfirmation,Report,LegacySummary,SatisfactionSurvey,QuestionRunner}.tsx`; `report.test.ts` |

Stage 3 source delivery and its reported browser verification are complete. The remaining maintenance/rollout gates are in the [plan](session-lifecycle-plan.md); none of this establishes production migration, scheduler activation, or backup/restore readiness.
