# Assessment sessions and evaluation

**Implementation reference — updated 2026-09-25, lifecycle stage 1.**

The [approved lifecycle plan](session-lifecycle-plan.md) supersedes earlier retention proposals: 24-hour attempts, seven-day access, daily deletion of records aged seven days or older. Stage 1 adds durable content and pure policy; service enforcement, browser recovery, and scheduling follow in subsequent PR layers.

This document explains how a DevGrade assessment is created, progresses, is
recorded, and is evaluated. It describes the current repository implementation,
not a promise that every lifecycle requirement in the [PRD](../prd.md) is already
operational. “Evaluation” here means scoring a candidate's answers; automated
software tests are covered separately in §10.

## 1. At a glance

- An assessment is anonymous: no account or sign-in is required.
- All lengths are free: **Quick (8, default), Standard (16), Deep (32)**.
- The complete question set is selected at creation. Difficulty does **not**
  adapt after each answer, despite the broader product's “adaptive” description.
- PostgreSQL stores the session, accepted answers, and completed scores. XState
  holds the current browser flow in memory.
- Correctness and scoring run on the server. The initial question payload has no
  answer key or explanations.
- **There is no enforced time-based session/token expiry in the current service.**
  The 30-minute abandonment helper is not an authentication cutoff (§6).
- Refreshing or reopening the page loses the in-memory session; there is no
  implemented resume or saved-report retrieval flow (§5).

## 2. Identity, ownership, and storage

Three identifiers serve different purposes:

| Identifier     | Created by                                      | Stored where                                     | Purpose                                                                                           |
| -------------- | ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `rawClientId`  | Browser, using `crypto.randomUUID()`            | `localStorage` under `devgrade.clientId`         | Groups session-creation attempts for anonymous rate limiting. It is **not** a session credential. |
| `sessionId`    | PostgreSQL UUID default                         | `test_sessions.id` and XState context            | Identifies one assessment and its related records.                                                |
| `sessionToken` | Server, using `randomBytes(32).toString("hex")` | `test_sessions.session_token` and XState context | Opaque 64-character credential authorizing operations on that assessment.                         |

The server stores the SHA-256 hash of `rawClientId` as `client_id`, not the raw
browser value. The stable browser identifier is neither an account nor proof of
a particular person. If `localStorage` is absent, the client generates an
identifier for the call instead; storage-access exceptions are not separately
handled by the current helper.

For answer submission, completion, and survey submission, the caller supplies
**both `sessionId` and `sessionToken`**. `loadSession` loads by ID and compares the
token; an unknown session or a token mismatch produces the same `not_found`
error. These operations do not require the original `rawClientId`.

The token is stored verbatim in the database. It has no embedded expiry, rotation,
or refresh protocol. Treat it as a secret: possession authorizes the exposed
operations; do not put it in logs or public URLs. Losing the browser's in-memory
token does not revoke the stored one.

### Persistent records

| Table                     | What it records                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `test_sessions`           | ID/token, hashed client ID, framework, target level, status, ordered `selected_question_ids`, timestamps, and a focus-loss column.        |
| `session_answers`         | One accepted answer per session/question: selected option index, client-reported time, server-computed correctness, and answer timestamp. |
| `session_results`         | One overall result per session: weighted percentage, maximum 100, proficiency tier, and target level.                                     |
| `session_category_scores` | One row per session/pillar: correct weight, total weight, percentage, and proficiency.                                                    |
| `session_surveys`         | Optional helpfulness rating, one row per completed session; subsequent submissions update it.                                             |

`selected_question_ids` is the **authoritative set and total** after creation.
There is no separate stored preset/count. New sessions also save a private versioned
`question_snapshot` containing the exact ordered content, grading inputs, provenance,
and pillar labels/guidance. Completed sessions save a safe self-contained
`report_snapshot` alongside normalized scores. Nullable snapshots support legacy
records only; no historical content is reconstructed from the current bank.

Sources: [browser services](../apps/web/src/machines/assessmentServices.ts),
[session service](../apps/web/src/server/assessmentService.ts),
[schema](../apps/web/src/db/schema.ts), [DB helpers](../apps/web/src/db/queries.ts).

## 3. Session creation

The browser calls `createSessionFn` through the client services adapter. The
application uses **TanStack Start server functions**, not hand-written REST routes
at the `/api/sessions` paths used as logical operation names in the PRD.

Error codes in this document describe internal `AssessmentError` values. The
server-function handlers currently convert these to plain errors carrying safe
messages; they do not forward the domain `code` and `status` as a structured
browser response. Input-schema validation runs before those handlers. Do not
assume the PRD's REST status mappings are the server-function wire contract.

### Inputs

| Field           | Rule                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `framework`     | Must be a known framework; the service additionally permits only `MVP_FRAMEWORKS` (currently React).                              |
| `targetLevel`   | `junior`, `mid`, or `senior`.                                                                                                     |
| `questionCount` | Numeric `8`, `16`, or `32`. Omitted/`undefined` defaults to 8. Numeric strings, `null`, fractions, and other values are rejected. |
| `rawClientId`   | Non-empty string supplied by the browser.                                                                                         |

Creation proceeds in this order:

1. Validate inputs with the shared schema and enforce the MVP framework gate.
2. Hash the client ID and count its sessions created within the trailing
   **60-minute window**. Reject if there are already **5 or more**. The count
   includes every session status, not just completed sessions.
3. Load active questions matching the chosen framework and level, ordered by ID.
4. Generate the session token and derive a seeded RNG from it.
5. Sample the exact requested count with the quotas below.
6. If any pillar/weight class is short, return `insufficient_questions` **without
   inserting a session**. Do not replace missing advanced questions with core
   questions, repeat IDs, or silently shorten the assessment.
7. Insert the session with `in_progress` status and the ordered selected IDs.
   PostgreSQL initializes `created_at`, `started_at`, and `last_activity_at`.
8. Return `sessionId`, `sessionToken`, `totalQuestions`, and the entire array of
   `PublicQuestion` objects. XState stores them and shows the first question.

### Question selection

Each of the four pillars—Reactivity & State, Lifecycle & Effects, Performance &
Optimization, Async & Data—receives the same number of core and advanced items.

| Length   | Total | Core per pillar | Advanced per pillar | Available weighted points per pillar |
| -------- | ----: | --------------: | ------------------: | -----------------------------------: |
| Quick    |     8 |               1 |                   1 |                                    3 |
| Standard |    16 |               2 |                   2 |                                    6 |
| Deep     |    32 |               4 |                   4 |                                   12 |

Core weight is **1** and advanced weight is **2**. Items are sampled without
replacement within each class, then the selected set is shuffled for display.
Options remain in their stored order. Distinct sessions can still overlap; this
is not a cross-session “never repeat” guarantee.

The same ordered pool, requested count, and seed produce the same selection.
Replaying a seed against a changed pool need not reproduce the original session;
the persisted IDs, not re-sampling, define that session.

The current source bank has six core and six advanced questions per pillar at
each React level. A deployed database must actually be seeded and have enough
**active** rows. Source-bank guard tests do not establish deployment readiness.

The creation rate limit is best-effort, not strong identity enforcement:
changing the browser ID bypasses its grouping, and the count/check/insert is not
one locked operation. Concurrent requests can exceed the nominal limit.

Sources: [validation](../apps/web/src/server/assessmentValidation.ts),
[creation service](../apps/web/src/server/assessmentService.ts),
[sampling](../apps/web/src/domain/sampling.ts),
[constants](../apps/web/src/domain/constants.ts).

## 4. Answering and completing

### Answer submission

The UI shows one question at a time. A candidate selects a zero-based option
index, then submits it. There is no implemented skip, previous-question, or
edit-accepted-answer flow.

`submitAnswerFn` receives `sessionId`, `sessionToken`, `questionId`,
`selectedAnswer`, and `timeSpentSeconds`. The service:

1. Validates the payload and session credential; rejects a completed session.
2. Checks that the question belongs to the persisted selected-ID set.
3. Loads the question and checks the option index against its options.
4. Computes `isCorrect = selectedAnswer === correctAnswer` on the server.
5. Inserts the answer. A unique `(session_id, question_id)` index prevents a
   second answer for the same question.
6. Counts accepted answers, updates `last_activity_at`, and returns
   `{ success: true, sessionComplete }`.

`sessionComplete` means the answer count has reached the selected-ID count. It
**does not** write the final report or change the DB status to `completed`.
XState advances only after a successful response and invokes completion after
saving the final displayed answer. Its last-question check uses the returned
question array's length, not a fixed eight-question constant.

The UI is sequential, but the service checks **membership**, not submission
order. A credential holder can submit another unanswered question from the set.
No correctness or explanation is returned on the answer endpoint.

### Completion

`completeSessionFn` receives the session ID and token. The service:

1. Authenticates and rejects an already-completed session.
2. Loads the accepted answers and rejects completion if fewer than the persisted
   selected-ID count have been answered.
3. Loads the selected question rows and builds the scorer's input.
4. Calculates the overall and per-pillar results (§7).
5. In **one transaction**, inserts the overall result and pillar-score rows,
   marks the session `completed`, and sets `completed_at` and `last_activity_at`.
6. Returns the report only after the transaction succeeds.

The result writes and status change are atomic. The preceding reads and score
calculation occur **before** that transaction; completion is not a fully locked,
end-to-end operation. Unique result constraints prevent two stored overall
reports, but a concurrent completion can still fail rather than return the
existing report.

After completion, `submitSurveyFn` accepts an integer helpfulness rating **1–5**.
It upserts the survey and leaves session status and scores unchanged.

Sources: [server functions](../apps/web/src/server/assessmentFns.ts),
[service](../apps/web/src/server/assessmentService.ts),
[machine](../apps/web/src/machines/assessmentMachine.ts).

## 5. Browser lifecycle, recovery, and database status

### XState flow

```text
configuring → creatingSession → answering → submittingAnswer
                                  ↑                │
                                  └── more items ──┘
                                                   │ final item saved
                                                   ↓
                                              completing → completed
```

Failures use separate machine states, not new PostgreSQL statuses:

| Failed operation | Machine state                          | Retry behavior                                                                  |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Creation         | `setupFailed`                          | Retry creation with the same configuration, or return to setup.                 |
| Answer save      | `answerFailed`                         | Resend the same pending answer, including its captured duration and credential. |
| Completion       | `completeFailed`                       | Retry completion with the same credential.                                      |
| Survey           | `completed.surveyPrompt` with an error | Allow rating submission again; a saved rating is updated on resubmission.       |

`completed` has survey substates: `surveyPrompt`, `submittingSurvey`, and
`surveyThanks`. The report is already complete before any survey response.

Framework, level, and length can change only while configuring. Returning to
setup after creation failure or choosing “Take it again” after completion clears
the old session context but preserves those choices. It **does not delete** an
existing database session. The next start creates a new assessment.

### Refresh and pause

Only the anonymous client ID is stored in `localStorage`. Session credentials,
questions, current position, pending answer, and report are in-memory machine
state. A hard refresh/remount starts a new machine at intake. Accepted answers
remain in PostgreSQL, but there is no exposed session-load/resume or report-read
function to restore them in the UI. There is no pause/resume mechanism; hiding the
tab does not pause the recorded wall-clock duration.

### Retries are not idempotent recovery

Retries can recover **transient failures before persistence**. Repeating an
unchanged invalid payload or credential does not fix it. Lost responses and
partial failures need separate treatment:

- If creation inserted a session but its response was lost, retrying creation
  makes another session; the browser cannot recover the first one's token.
- If an answer was inserted but a later step or response failed, retry may encounter
  a duplicate-answer rejection instead of advancing. Insert, count, and activity update
  are separate operations, not one transaction.
- If completion committed but its response was lost, retry fails with
  “This assessment is already complete.” rather than retrieving the saved report.
  Internally, the service throws `SESSION_COMPLETED`; the browser receives the
  message, not its domain code.

There is no reconciliation flow for these cases yet.

### Persistent status transitions

| Action                                    | From                         | To                                                     |
| ----------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| Create successfully                       | No row                       | `in_progress`                                          |
| Save an answer                            | `in_progress` or `abandoned` | Unchanged                                              |
| Complete successfully                     | `in_progress` or `abandoned` | `completed`                                            |
| Run abandonment helper on an eligible row | `in_progress`                | `abandoned`                                            |
| Submit survey                             | `completed`                  | `completed`                                            |
| Run deletion helper with matching token   | Any stored status            | Row removed, related assessment records cascade-delete |

The abandoned-to-completed path reflects the current service, not a recommended
expiry policy. See the distinction below.

## 6. Expiration, inactivity, retention, and deletion

These are separate concepts; **30 minutes, 60 minutes, 24 hours, and seven days are not
interchangeable session lifetimes**.

| Concept                    | Rule or intent                                    | What is implemented                                                                 |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Token expiry               | No TTL currently defined                          | No expiry timestamp, age check, or rotation.                                        |
| Idle abandonment           | Default 30 minutes since server-recorded activity | `markAbandonedSessions` helper exists; no in-repository caller/scheduler was found. |
| Creation rate-limit window | Trailing 60 minutes                               | Used to count prior session creations; does not expire sessions.                    |
| Answer duration bound      | Integer 0–3600 seconds                            | Payload validation, not a session timeout.                                          |
| Record retention           | Seven-day access; daily eligible-row cleanup                             | No age-based deletion implementation or retention job was found.                    |
| Explicit deletion          | Delete an assessment using its token              | DB helper exists, but no deletion server function or UI is wired.                   |

### What the abandonment helper does

`markAbandonedSessions(db, inactiveMinutes = ABANDON_AFTER_MINUTES)` sets status
to `abandoned` for rows satisfying both:

```text
status = in_progress
last_activity_at < current time − inactiveMinutes
```

The comparison is strict: a timestamp exactly at the computed cutoff is not
older than it. The helper changes **only status** and returns the affected-row
count. It does not delete data, revoke a token, or notify an active browser.
Even once scheduled, classification occurs when the job runs, not necessarily
at the exact 30-minute boundary.

Activity is initialized on creation and refreshed by a successful answer-save
path or successful completion. Selecting options, reading, timer ticks, tab
visibility changes, and survey submissions do **not** refresh it. Thus a person
reading one question for a long time can appear idle to the server.

**Current enforcement gap:** `loadOpenSession` rejects only `completed`. It does
not reject `abandoned` or compare activity timestamps. A valid token can still
submit answers for an abandoned session; its status stays abandoned until a
successful completion changes it to completed.

The repository therefore does **not** implement hard expiration. The PRD's
scheduled-job language describes intended deployment behavior; an external
scheduler or database retention policy cannot be confirmed from these sources.

### Deletion

`deleteSessionByToken(db, sessionToken)` deletes a matching session by token alone
and returns whether a row was removed. Foreign-key cascades remove its answers,
overall result, pillar scores, and survey. Question-bank content remains.

This helper is not currently exposed to the browser. Refreshing, closing a tab,
restarting an assessment, or marking it abandoned is **not** deletion.

Sources: [DB helpers](../apps/web/src/db/queries.ts),
[access checks](../apps/web/src/server/assessmentService.ts),
[schema](../apps/web/src/db/schema.ts), [PRD §§8, 10, 12–13](../prd.md).

## 7. Evaluation and report generation

### Inputs and formula

Evaluation is deterministic, rule-based multiple-choice scoring. It does not run
candidate code, use AI, grade response time, or assign penalties for focus loss.

For each answered question:

```text
correct = 1 when selectedAnswer equals correctAnswer; otherwise 0
weight  = 1 for core; 2 for advanced

pillar percentage = 100 × sum(correct × weight) / sum(weight) within that pillar
overall percentage = 100 × sum(correct × weight) / sum(weight) across all questions
```

Wrong answers add no correct weight but remain in the denominator. There is no
negative marking or partial credit within an individual MCQ. The overall score
is **not** the unweighted percentage of correctly answered questions.

Each preset has equal available weight in every pillar, so each pillar contributes
one quarter of the overall result, provided the selected question metadata has
not changed. The implementation sums weights directly; it does not average
already-rounded pillar percentages.

Percentages are rounded to two decimal places with `Math.round(n * 100) / 100`
before assigning proficiency. The scorer defensively returns zero for a zero
denominator, but ordinary session creation/completion prevents empty or partial
assessments from being scored.

### Proficiency and skill gaps

The same thresholds apply to overall and pillar scores:

| Score percentage      | Domain value | Display tier |
| --------------------- | ------------ | ------------ |
| At least 80           | `proficient` | Proficient   |
| At least 50, below 80 | `developing` | Developing   |
| Below 50              | `skill_gap`  | Skill gap    |

`skillGaps` contains the pillars whose own scores are below 50, even if the
overall score is high. The result retains framework and target level: a Senior
assessment result is relative to the Senior pool, not a calibrated comparison
with Junior results.

Quick's per-pillar outcomes are **0 / 33.33 / 66.67 / 100**. Standard and Deep have
finer steps of approximately **16.67** and **8.33** percentage points respectively.
Longer sets offer broader coverage, not a statistically validated confidence
estimate or a guarantee of a higher score.

### Worked example: Quick

| Pillar                     | Core correct? | Advanced correct? | Correct / available weight | Score | Tier       |
| -------------------------- | ------------- | ----------------- | -------------------------- | ----: | ---------- |
| Reactivity & State         | Yes           | Yes               | 3 / 3                      |   100 | Proficient |
| Lifecycle & Effects        | No            | Yes               | 2 / 3                      | 66.67 | Developing |
| Performance & Optimization | Yes           | No                | 1 / 3                      | 33.33 | Skill gap  |
| Async & Data               | Yes           | Yes               | 3 / 3                      |   100 | Proficient |

```text
Correct questions: 6 of 8
Correct weight:    3 + 2 + 1 + 3 = 9
Available weight:  3 + 3 + 3 + 3 = 12
Overall score:    9 / 12 × 100 = 75 → Developing
Skill gaps:       performance
```

The matching unweighted 75% in this example is coincidental. Answering **only the
four advanced questions correctly** gives 4/8 correct questions, but a weighted
score of **8/12 = 66.67%**, not 50%.

### What the report contains

- Session ID, framework, and target level.
- `totalScore`, `maxScore: 100`, and overall `proficiencyLevel`.
- `categoryScores` with each pillar's weights, percentage, and tier, ordered by
  `SKILL_CATEGORIES`.
- `skillGaps` and per-question `{ questionId, isCorrect, explanation }` entries.
- The UI derives the attempted count from `questionResults.length` and joins
  question IDs to the previously received public questions for titles/prompts.

The completion response still does not contain the `correctAnswer` index field.
Explanations can reveal the answer and are intentionally released only here.
The per-question result order follows the loaded answer rows; the service does
not explicitly order that query by the selected-ID presentation order.

### Question-content consistency limitation

Answer submission and completion use the saved private question snapshot, not
the current question bank. Pinned v1 scoring preserves weights, category assignment,
answer keys, and explanations through edits/reseeding. The awarded report and
normalized scores are written from one calculation in the same transaction.
Unknown, malformed, or missing unfinished snapshots fail closed; no backfill from
current questions is allowed. Retire referenced bank rows rather than deleting them.

Sources: [scorer](../apps/web/src/domain/scoring.ts),
[domain types](../apps/web/src/domain/types.ts),
[completion service](../apps/web/src/server/assessmentService.ts),
[report UI](../apps/web/src/components/assessment/Report.tsx).

## 8. Timing and behavioral signals

- **Displayed timer:** `QuestionRunner` resets a counter on question change and
  increments it each second. It continues while the runner remains mounted
  during submission/retry; background browser throttling can affect its display.
- **Recorded time:** XState captures `Date.now()` on entering `answering`, then
  records rounded elapsed seconds on the first submit, with a minimum of zero.
  Hidden-tab time before submission is included. Retries reuse this captured
  duration; later network/retry waiting is not added to it.
- **Validation:** the server accepts only integer durations from 0 through 3600.
  A captured duration over 3600 is rejected; retrying the same pending answer
  does not repair that value. This is not an automatic expiry or auto-submit.
- **Focus loss:** the flow listens to `visibilitychange` and emits `FOCUS_LOSS`
  when hidden. The machine counts it only while `answering`. There is no actual
  window `blur` listener in this path.
- **Persistence gap:** the in-memory `focusLossCount` is not sent in the current
  service payloads. The DB column exists but normal app operations leave it at
  its default zero. It does not influence scoring.

Sources: [runner](../apps/web/src/components/assessment/QuestionRunner.tsx),
[machine](../apps/web/src/machines/assessmentMachine.ts),
[flow](../apps/web/src/components/assessment/AssessmentFlow.tsx).

## 9. Lifecycle work still outstanding

These are gaps to address in separate implementation work, not capabilities
added by this document:

1. **Expiration policy and enforcement:** decide whether abandonment is merely
   classification or a terminal cutoff; align request checks, UX, and scheduled
   sweeping with that decision.
2. **Retention and erasure:** wire the stated retention policy and authenticated
   deletion interface; do not claim an active daily purge without a running mechanism.
3. **Recovery:** define refresh/resume and saved-report access, plus idempotent
   handling of persisted operations whose responses were lost.
4. **Content consistency:** prevent in-progress assessment evaluation from
   changing when question content is edited.
5. **Timing/signals:** resolve over-limit duration recovery and decide whether
   focus-loss collection should be persisted at all.

## 10. Automated verification and source map

The repository uses `node:test` through `tsx`, not Jest/Vitest. From the repo root:

```sh
pnpm --filter web test
```

PostgreSQL integration tests require an explicitly supplied `TEST_DATABASE_URL`
for a test database with schema-creation permission. They apply temporary copies
of the real migrations in unique schemas and clean up their own resources. With
the variable absent, the database suite skips; configured connection failures
fail rather than silently skip. They do not fall back to the app's `DATABASE_URL`.

| Concern                                                                              | Test source                                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Length validation and defaulting                                                     | [assessmentValidation.test.ts](../apps/web/src/server/assessmentValidation.test.ts)             |
| Exact quotas, shortfalls, uniqueness, deterministic sampling                         | [sampling.test.ts](../apps/web/src/domain/__tests__/sampling.test.ts)                           |
| Weighted scores, thresholds, and equal pillar contribution                           | [scoring.test.ts](../apps/web/src/domain/__tests__/scoring.test.ts)                             |
| Creation, active-pool filtering, public payload, stored IDs, final-answer completion | [assessmentService.postgres.test.ts](../apps/web/src/server/assessmentService.postgres.test.ts) |
| Configuration locking, retry/restart, actual-length progression                      | [assessmentMachine.test.ts](../apps/web/src/machines/assessmentMachine.test.ts)                 |
| Browser-to-server creation payload                                                   | [createSessionAdapter.test.ts](../apps/web/src/machines/createSessionAdapter.test.ts)           |
| Seed content integrity and pool depth                                                | [seedData.test.ts](../apps/web/src/db/__tests__/seedData.test.ts)                               |

These tests do not establish that production has a running abandonment/retention
job, nor do they implement missing resume or idempotent recovery behavior.
