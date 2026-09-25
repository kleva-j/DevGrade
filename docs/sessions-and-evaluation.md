# Assessment sessions and evaluation

**Implementation reference — 2026-09-25, lifecycle Stages 1–2 implemented on `session-lifecycle/server`.**

[PR #1](https://github.com/kleva-j/DevGrade/pull/1) exists for the first lifecycle layer. This document describes current source, not a deployment. Stage 3 browser recovery and Stage 4 maintenance are **not implemented**. See the [delivery plan](session-lifecycle-plan.md) and [PRD](../prd.md).

## 1. Current behavior at a glance

- Anonymous, React-only assessments; free **Quick (8, default), Standard (16), Deep (32)**. The full stratified set is selected at creation, not adapted after each answer.
- PostgreSQL stores the session, immutable question/report snapshots, accepted answers, normalized scores, and optional survey. XState still holds the browser assessment only in memory.
- The server enforces **24-hour attempts**, **seven-day normal access**, and **30-minute effective inactivity**. Both deadlines use the session's original `createdAt`, never completion or latest activity.
- Authenticated discovery, reads, resume, expected-state deletion, and retry-safe answer/completion operations exist as typed, non-cacheable POST server functions.
- The browser has only a compatibility adapter for the new envelopes. It does **not** save session credentials, discover previous attempts, restore progress/reports, or present Resume/Delete controls.
- No scheduled cleanup, maintenance endpoint, or inactivity sweep is active in this implementation. Access expiry does not itself delete a row.

## 2. Credentials, validation, and the wire boundary

| Identifier     | Creation/storage                                                                                                 | Authority                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `rawClientId`  | Browser UUID in `localStorage` at `devgrade.clientId`; only its SHA-256 hash is stored as `client_id`            | Anonymous creation-rate grouping only; never ownership, listing, or deletion permission |
| `sessionId`    | PostgreSQL UUID; held in XState                                                                                  | Identifies one session                                                                  |
| `sessionToken` | Server-generated 32 random bytes, encoded as 64 hex characters; stored verbatim in PostgreSQL and held in XState | Secret used **with the session ID** to authenticate access                              |

Credentials are validated before DB work: a canonical 36-character UUID spelling (normalized to lowercase) and exactly 64 hexadecimal token characters. Tokens are compared exactly, not case-normalized. Answer inputs require a nonempty question ID of at most 50 characters, a nonnegative integer option index within the saved question's options, and integer time **0–3600 seconds**. `rawClientId` is a string of length 1–1024; surveys accept integer ratings **1–5**. Invalid inputs return safe `bad_request` failures without serializing Zod issues or submitted secrets.

Authentication matches **both ID and token** before disclosing session details or expiry. Unknown IDs and wrong tokens produce the same `not_found`. No token-only access/deletion helper or cookie-ownership path remains. The raw client ID is not required for existing-session operations and cannot recover lost credentials. There is no token rotation/refresh protocol; deadlines are enforced by the service, not embedded in the token.

All eight functions in `server/assessmentFns.ts` use POST and `Cache-Control: no-store`, including discovery and reads. Credentials go in payloads, never URLs. The handler boundary validates inside the safe envelope and sanitizes validation, service, DB-initialization, and unexpected failures:

```ts
{ ok: true, data: T }
// or
{ ok: false, error: { code, message } }
// existing_attempt also includes error.blockers: SessionMetadata[]
```

These are TanStack Start server functions, **not** literal `/api/sessions` REST routes. `AssessmentError.status` and `toErrorResponse` provide logical HTTP mappings; the active adapter does not turn those mappings into HTTP status responses. Consumers must inspect `ok` and the typed error code, not parse messages. The current browser adapter unwraps failures into `AssessmentClientError`, preserving their code/payload, but has no lifecycle-specific recovery states yet.

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

This is **known-credential gating, not global ownership or one-attempt-per-person enforcement**. There is no list-by-client-ID capability. Omitted credentials, cleared/blocked storage, another browser, and a lost creation response limit discovery. The baseline browser currently supplies no known-session list. The Stage 3 Resume/Delete gate and same-browser coordination are still pending.

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

Repeated completion returns the already saved `reportSnapshot.result` without rescoring or touching activity. This also works after 24 hours if the report was committed earlier and normal access remains open. A legacy completed session instead returns `legacy_summary_available`, directing the caller to `getSession`; it is not rescored. The Stage 2 completion success payload remains the compatibility `AssessmentResult`, not the full `ReportView`.

`submitSurvey` requires authenticated completed state and normal access. It upserts an integer 1–5 rating, leaving the award and session activity unchanged.

### Expected-state deletion

`deleteSession({ sessionId, sessionToken, expectedState })` accepts `expectedState: "unfinished" | "completed"`. This represents the state the caller confirmed; the confirmation UI is Stage 3 work. Under the parent lock it compares that expectation with current completed/unfinished state:

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

The former unlocked submit/completion races are fixed. This does not claim global creation uniqueness, creation-request idempotency, browser reconciliation, or concurrency with an implemented cleanup worker; maintenance is still pending.

## 8. Browser baseline and remaining work

The existing XState flow remains configure → create → answer/submit → complete → report/survey, with retry states. Only `devgrade.clientId` persists. Session credentials, questions, current position, pending answers, and the report are in memory. A hard refresh/remount returns to intake; saved answers remain in PostgreSQL but the UI does not retrieve them. No saved-session adapter, Web Lock coordination, report history, resume/deletion UI, or lifecycle-specific expiry screen is implemented.

The compatibility adapter unwraps the typed envelopes, projects creation back to ID/token/questions, and forwards only `sessionComplete` from answer success to the old machine. It does not yet consume deadlines, `acceptedAnswer`, or `nextQuestionId`. The machine still advances its local index; Stage 3 must reconcile authoritative progress for restoration/conflicts/multiple tabs and render saved report/pillar metadata.

Answer retries keep their original pending payload; completion retries now receive the saved result. Lost creation responses before receiving credentials remain unrecoverable and can create another row on retry; request-key idempotency is deferred. Existing client-ID storage-access exceptions are not specially handled.

Timing remains baseline: the display counter and captured `Date.now()` elapsed duration are separate; hidden-tab time before submission is included, retry waiting afterward is not. The machine does not cap durations at 3600, so an overlong pending duration is rejected again on retry. Focus loss is counted in memory on hidden `visibilitychange` while answering; it is not sent to the service or used in grading. Stage 3 needs resume-timer reset/bounds, storage-failure handling, and typed recovery; Stage 4 needs bounded maintenance and authorized rollout, without changing product/design scope.

## 9. Verification and source map

**Primary-agent verification reported for Stage 2 (2026-09-25): 282 tests passed, 0 skipped**, against isolated PostgreSQL 18 with real migrations and independent-backend lock barriers. Package lint/build passed; typecheck has only **three pre-existing shared `chart.tsx` errors**. This records the primary agent's run, not a rerun by this documentation task, a successful root `pnpm build`, or a deployed migration/job.

Tests use `node:test` via `tsx`, not Jest/Vitest. With a dedicated `TEST_DATABASE_URL` exported and a compatible Node runtime, run from `apps/web`:

```sh
node --import tsx --test "src/**/*.test.ts"
```

The normal root entry point is `pnpm --filter web test` (the package script uses `tsx --test`). Direct `node --import tsx` avoids the `tsx` CLI's IPC startup when that is restricted by a sandbox. The fixture creates unique data/migration schemas using temporary copies of real migrations and drops only its own resources. Without `TEST_DATABASE_URL`, PostgreSQL tests skip; configured failures fail. It never falls back to `DATABASE_URL` or loads the app's `.env`. Independent clients assert their schema/backend PID and use observable `pg_blocking_pids` barriers, not sleeps or `Promise.all` over a single connection.

Normal root validation entry points are:

```sh
pnpm --filter web typecheck
pnpm lint
pnpm --filter web build
```

If the pnpm shim is unavailable, use the pinned package manager, e.g. `npm exec --yes --package=pnpm@10.33.4 -- pnpm --filter web typecheck` (and the corresponding lint/build command); this may require network access if not cached. Alternatively use the **installed lockfile-resolved tools**, without upgrading dependencies, from `apps/web`:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node node_modules/vite/bin/vite.js build
```

For package-level lint coverage, also run `node node_modules/eslint/bin/eslint.js` from `packages/ui`. These package-tool fallbacks do not validate the root Turbo wrapper. Keep typecheck's existing chart failures separate from test/lint/build results; do not describe the complete validation set as green.

| Concern                                                                | Source                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pure policy, safe contracts, snapshot formats, scoring                 | `apps/web/src/domain/{sessionLifecycle,sessionContracts,sessionSnapshots,scoring}.ts` and `domain/__tests__/` |
| Schema and DB time                                                     | `apps/web/src/db/{schema,queries}.ts`; migration `0002_dazzling_may_parker.sql`                               |
| Authentication, parent locks, coherent reads/views                     | `apps/web/src/server/sessionAccess.ts`                                                                        |
| Operations, validation, wire errors                                    | `apps/web/src/server/{assessmentService,assessmentValidation,assessmentHandlers,assessmentFns,errors}.ts`     |
| Boundaries, batching, retries, deletion/creation races, coherent reads | `apps/web/src/server/{sessionLifecycle.postgres,sessionContracts,assessmentValidation}.test.ts`               |
| Snapshot fidelity and all-length behavior                              | `apps/web/src/server/{assessmentSnapshots.postgres,assessmentService.postgres}.test.ts`                       |
| Isolated real-DB concurrency fixture                                   | `apps/web/src/server/__tests__/postgresFixture.ts`                                                            |
| Baseline browser/compatibility behavior                                | `apps/web/src/machines/{assessmentMachine,assessmentServices,createSessionAdapter}.ts` and tests              |

Browser-recovery and maintenance release gates are still outstanding in the [plan](session-lifecycle-plan.md). Backend verification does not establish those capabilities or production scheduler/backup readiness.
