# Product Requirements Document (PRD): DevGrade

**Document Version:** 1.9.1

**Status:** Approved for MVP Development

**Target Release:** Q4 2026

**Last Updated:** 2026-09-25

**Change Log:**

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | — | Initial approved MVP scope. |
| 1.1.0 | 2026-09-15 | Clarified React-only MVP; moved scoring server-side; 4-pillar stratified sampling (8 questions); added data schema, user stories, API specs, deployment, and compliance sections; reduced pricing to free tier only; corrected the report example; inline formatting cleanup. See §12 for open architectural decisions. |
| 1.2.0 | 2026-09-15 | Resolved all open decisions and implemented the domain/DB/server/state-machine core in `apps/web`: PostgreSQL everywhere (#1), single full-stack deploy (#2), weighted core/advanced score granularity 0/33/67/100 (#3), normalized `session_category_scores` (#4), all-questions-up-front delivery (#5). Addressed rate-limiting, privacy, abandonment, and pool-size items. Reworked §5.2 schema, §7 API, §8 deployment, §12 (now resolved), and added §13 Implementation Plan. |
| 1.2.1 | 2026-09-15 | Added §10.1 "Content sourcing & licensing" (paraphrase-not-copy policy referencing MIT-licensed `sudheerj/reactjs-interview-questions` and `lydiahallie/javascript-questions`). Added a per-question `source` provenance column (§5.2) and a pillar-tagged 24-question React starter bank (`db/seedData.ts` + idempotent `db/seed.ts` + `db:seed`). Completed Phase 0 seed/migration items (§13). |
| 1.2.2 | 2026-09-16 | Phase 0 review fixes: unit test suite (`node:test`, 26 tests, `pnpm test`) covering scoring/sampling/proficiency/PRNG; hardened stratified sampling to pair core+advanced by weight class (robust for unbalanced pools); narrowed the duplicate-answer catch to true unique-violations; guarded the completion question lookup; `count(*)` for answered-count; auto-bump `questions.updated_at`; category upsert on re-seed; extracted `RATE_LIMIT_WINDOW_MINUTES` and computed `PROFICIENCY_THRESHOLDS` keys; declared `tsx`. Phase 0 marked complete (§13). |
| 1.3.0 | 2026-09-16 | Phases 1–3 implemented in `apps/web`: TanStack Start server functions (`server/assessmentFns.ts`) as the client API boundary (answer key verified absent from the client bundle, decision #5); XState-driven candidate UI (`components/assessment/*`: intake, question runner with per-question timer + `visibilitychange` focus-loss, loading/error/retry) wired via `machines/assessmentServices.ts`; report with categorical skill radar, per-pillar breakdown, focus areas, and question review. Anonymous client id minted client-side in `localStorage` and passed to `createSession` (replaces the server cookie plan; hashed server-side, equivalent for rate limiting). Promoted categorical `--chart-*` + `--code-*` tokens into `globals.css` and documented them in `design.md` §4. |
| 1.4.0 | 2026-09-16 | Phase 3 satisfaction survey: normalized `session_surveys` table (1..5 helpfulness, unique per session; migration `0001`), `submitSurvey` service + server fn (allowed only after completion, upserts on re-submit), and a report survey card driven by new `completed` machine substates (`surveyPrompt`/`submittingSurvey`/`surveyThanks`). Survey bounds centralized in `domain/constants.ts`; copy in `components/assessment/copy.ts`. |
| 1.5.0 | 2026-09-23 | Question-bank Batch A: grew the React starter bank from 24 to **48 questions** (3 levels × 4 pillars × **two** core + **two** advanced per bucket), so stratified sampling has a real pool to randomize over (anti-leakage) instead of returning a fixed set. Added a seed-bank integrity guard test (`db/__tests__/seedData.test.ts`) enforcing id/shape/answer-range/provenance and per-bucket minimum depth via new `MIN_CORE_PER_BUCKET`/`MIN_ADVANCED_PER_BUCKET` constants (`domain/constants.ts`). New items favor `original` provenance with a subset paraphrased from the MIT banks (§10.1). Updated §10.1, §12, §13. |
| 1.6.0 | 2026-09-23 | Question-bank Batch B: grew the React bank from 48 to **96 questions** (3 levels × 4 pillars × **four** core + **four** advanced per bucket), deepening the sampling pool (1-of-4 core × 1-of-4 advanced per pillar → far more distinct sessions). Raised the enforced per-bucket floor to `MIN_CORE_PER_BUCKET`/`MIN_ADVANCED_PER_BUCKET` = 4 (guard test green at 29 tests). Topics remain distinct across all items in a bucket; provenance tracked per row (§10.1). Remaining toward the §10.1 target (~6/6 per bucket, ~144 total): a future Batch C. |
| 1.7.0 | 2026-09-23 | Question-bank Batch C: grew the React bank from 96 to **144 questions** (3 levels × 4 pillars × **six** core + **six** advanced per bucket), reaching the §10.1 pool-depth target (~6/6 per bucket). Raised the enforced per-bucket floor to `MIN_CORE_PER_BUCKET`/`MIN_ADVANCED_PER_BUCKET` = 6 (guard test green at 29 tests; typecheck + lint clean). New `-05`/`-06` items are topic-distinct from every prior item in each bucket and vary the `correctAnswer` index to reduce answer-position leakage; provenance tracked per row (§10.1). Updated §10.1, §12, §13. |
| 1.8.0 | 2026-09-24 | Implemented free selectable lengths: Quick (8, default), Standard (16), Deep (32). Strict core/advanced sampling, shared exact numeric `questionCount` validation, unchanged scoring/schema, fixed selected-ID snapshot, and XState configuration preserved through retries. Intake and report copy now reflect the selected length without time or statistical confidence claims. Added sampler, validation, machine, and isolated PostgreSQL tests; verification and the unrelated typecheck blocker are recorded in §13. |
| 1.9.0 | 2026-09-25 | Session lifecycle Stages 1–2 implemented on `session-lifecycle/server`: immutable question/report snapshots alongside normalized scores; 24-hour attempts, seven-day normal access from original creation, and 30-minute effective inactivity; strict credentials, parent-first transactions/fresh DB time, coherent read-only views, idempotent answers/completion, expected-state deletion, and a bounded known-credential creation gate. Typed no-store POST server functions return authoritative progress including `nextQuestionId`. At this stage browser changes were compatibility-only and recovery/maintenance were pending. Primary agent reported 282 tests passed/0 skipped on isolated PostgreSQL 18, package lint/build passed, and three existing chart typecheck errors. PR #1 existed; no deployment or active cleanup was claimed. Stage 3 is recorded next. |
| 1.9.1 | 2026-09-25 | Stage 3 source delivered on `session-lifecycle/recovery`: version-1 per-session credential storage, fail-closed creation discovery/preflight, Web Lock coordination, original-configuration resume and accepted-ID reconciliation, confirmed deletion/cancel/changed-state handling, saved-report history/metadata/survey recovery, and bounded timing excluding offline/hidden intervals. Independent validation reported 339 tests passed/0 skipped on disposable PostgreSQL 18.1 with real migrations/144-question seed, plus headed Chrome 153: 5 scenarios/55 named checks. Direct web/UI lint passed and web build passed per implementation agent; three existing chart typecheck errors remain. Root pnpm lint/version switching to 10.33.4 failed signature verification; pinned 10.20/direct checks are not root-wrapper success. Stage 4 remains pending; no production deployment is claimed (§13). |

---

## 1. Executive Summary

**DevGrade** is an adaptive, AI-ready technical skill assessment platform designed to evaluate front-end software engineers specializing in modern web frameworks. The MVP focuses on React expertise, with future phases expanding to Vue and Angular support.

Traditional hiring tests and quiz apps rely on static, binary pass/fail questions that fail to identify _why_ a candidate struggled. DevGrade solves this by categorizing questions across four core engineering competency pillars (Reactivity & State Management, Component Lifecycle & Architecture, Performance & Rendering, and Data Flow & Async Operations).

The initial **MVP (Phase 1)** delivers a deterministic, lightweight multiple-choice testing engine focused on React expertise, using stratified random sampling (free Quick 8-question default, Standard 16-question, or Deep 32-question assessments across 4 competency pillars), client-side state management, and automated skill-gap analysis. Subsequent phases expand to Vue/Angular support, integrate live code execution sandboxes, and implement AI-driven candidate evaluation.

---

## 2. Problem Statement & User Personas

### Problem Statement

- **For Engineers & Job Seekers:** Generic multiple-choice tests don't reflect real-world framework mechanics (e.g., stale closures, context re-renders, memoization patterns), providing no actionable feedback on how to improve.

### Target User Personas

#### Persona A: The Job Seeking Developer (Alex)

- **Goal:** Wants to benchmark their React/Vue skills before applying to Senior or Mid-level roles.
- **Pain Point:** Doesn't know where their technical knowledge falls short until failing an actual live interview.

#### Persona B: The Technical Recruiter / Engineering Manager (Sarah)

- **Goal:** Needs to screen 50+ candidates quickly for a Senior Frontend Engineer position.
- **Pain Point:** Screening tests yield high scores on basic syntax, but candidates fail on real-world performance and architecture tasks.
- **MVP Scope Note:** Recruiter-facing features (candidate identity, results dashboards, and team comparisons) are **out of scope for the Phase 1 MVP** and are targeted for Phase 2+ (see §10.3). Phase 1 serves Persona A directly; Persona B informs the roadmap but is not served by MVP features.

---

## 3. Product Goals & Success Metrics

### Product Goals

1. **Deterministic Accuracy:** Provide consistent, framework-specific skill reports without relying on AI during initial MVP phases.
2. **Actionable Feedback:** Deliver categorized skill radar reports that pinpoint specific framework anti-patterns.
3. **Seamless UX:** Keep test session latency under 200ms per question turn using client-side state management and optimized rendering.

### Key Performance Indicators (KPIs)

| Metric                           | Target (MVP)                                  | Measurement Method                                                                      |
| -------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Test Completion Rate**         | > 85%                                         | Ratio of started tests to completed reports (tracked via session status)                |
| **Average Test Duration**        | Observe by selected length; no promised duration | Timestamp tracking from session start to completion, grouped by selected-ID snapshot length |
| **User Assessment Satisfaction** | > 4.2 / 5.0                                   | Post-assessment 1-question survey: "How helpful was this assessment?"                   |
| **Skill Gap Precision**          | > 80% agreement                               | Candidate follow-up survey: "Did the identified skill gaps match your self-assessment?" |
| **Question Bank Utilization**    | > 70% of active questions used within 30 days | Track question selection frequency to ensure question diversity                         |

---

## 4. Feature Specifications & Requirements

### 4.1 Candidate Intake & Setup

- **Framework Selection:** Candidate chooses target framework. **MVP supports React only**; **Vue** and **Angular** are shown as "coming soon" and enabled in a later phase.
- **Target Level Selection:** Candidate selects self-assessed experience tier: **Junior**, **Mid**, or **Senior**.
- **Length Selection:** Candidate chooses **Quick (8 questions, default)**, **Standard (16)**, or **Deep (32)**. All three are free; these are assessment lengths, not pricing tiers. Show question counts, not time estimates or promises of statistical confidence or score comparability.
- **Input Contract:** `questionCount` accepts only the exact numeric allowlist **8, 16, 32**. Missing input defaults to **8**; unsupported values are rejected, including numeric strings, `null`, booleans, and fractional values (no coercion or rounding).
- **Session Initialization:** System creates a unique assessment session ID and initializes state tracking. XState configuration includes framework, level, and `questionCount`; configuration is immutable once started and preserved through retries. The stored selected-question ID snapshot is authoritative for session length (§5.2).

### 4.2 Stratified Random Sampling Engine

Rather than pulling purely random questions, the engine selects the requested count from the active backlog, filtered by framework and target level, balanced across the **4 Competency Pillars**:

| Length | Total questions | Core + advanced pairs per pillar | Questions per pillar | Total weight per pillar |
| --- | --- | --- | --- | --- |
| Quick (default) | 8 | 1 | 2 | 3 |
| Standard | 16 | 2 | 4 | 6 |
| Deep | 32 | 4 | 8 | 12 |

Each pair contains one core question (weight **1**) and one advanced question (weight **2**). Sample without replacement within each pillar's exact weight classes; other weights cannot substitute. If any active pillar pool lacks the required core or advanced count, fail closed with `insufficient_questions`. Never substitute classes, repeat questions, or silently shorten a session.

**Quick (8-question) example:** the diagram below shows two questions per pillar; Standard and Deep scale every pillar equally as above.

```
                              ┌────────────────────────────────────────┐
                              │    Question Backlog Filtered by        │
                              │    Framework + Difficulty Level        │
                              └───────────────────┬────────────────────┘
                                                  │
                ┌─────────────────────────────────┼─────────────────────────────────┐
                ▼                                 ▼                                 ▼
   ┌──────────────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐
   │ Reactivity & State       │      │ Component Lifecycle      │      │ Performance & Rendering  │
   │ (2 Questions)            │      │ (2 Questions)            │      │ (2 Questions)            │
   └──────────────────────────┘      └──────────────────────────┘      └──────────────────────────┘
                                                                       │
                                                                       ▼
                                                      ┌──────────────────────────┐
                                                      │ Data Flow & Async Ops    │
                                                      │ (2 Questions)            │
                                                      └──────────────────────────┘
```

### 4.3 Test Runner & Interface

- **Multi-Choice Question Display:** Renders markdown code blocks (`JetBrains Mono`), question prompt, and 4 radio options (A, B, C, D).
- **Bi-Directional Support:** Native LTR/RTL layout support using logical CSS properties (`ms-*`, `ps-*`).
- **Progress & Timer:** Real-time progress bar indicating question count (N / Total, where Total is the selected-question snapshot length) and time elapsed per question. Elapsed timing is not an estimated completion time.

### 4.4 Rule-Based Scoring Engine & Report Generator

Scoring runs **server-side** (the answer key is never shipped to the client). Each answer is graded against the session's saved private question snapshot (`session_answers.is_correct`); first completion computes the award from accepted selections and the same saved inputs using pinned v1 scoring. Normalized scores and the immutable report are written together; later reads/retries never rescore:

```
Category Score (%) = ( Σ(Correct Answers × Difficulty Weight) / Σ(Total Questions × Difficulty Weight) ) × 100
```

**Score granularity (decision #3):** the weighted formula and proficiency thresholds are unchanged. Each pillar draws **1 / 2 / 4** _core_ + _advanced_ pairs for Quick / Standard / Deep respectively (weights **1 / 2**). Quick pillar scores resolve to **0 / 33.33 / 66.67 / 100** (rounded to two decimals): advanced-only correct is Developing; core-only correct is a Skill Gap. Standard and Deep have finer resolution, in steps of **100/6** and **100/12** percentage points respectively. Each pillar has equal total weight within a session, so all four contribute equally to the weighted overall percentage at every length. Finer resolution is not a claim of statistical confidence or comparability across lengths, levels, or sampled sets. Sampling enforces the exact weight classes (see §4.2; `apps/web/src/domain/sampling.ts`).

#### Proficiency Tiering:

- **>= 80%:** Proficient — Solid grasp of framework best practices with minimal edge case confusion.
- **50% – 79%:** Developing — Understands basic usage but struggles with complex scenarios and optimization.
- **< 50%:** Skill Gap Flagged — Fundamental misunderstanding detected; triggered in final report with targeted remediation advice and resource links.

#### Skill Gap Identification:

Categories scoring below 50% are flagged with specific remediation paths:

- **Reactivity & State**: Recommended React hooks patterns and state management resources
- **Component Lifecycle**: Official React lifecycle documentation and anti-pattern guides
- **Performance & Rendering**: Memoization strategies and React DevTools profiling tutorials
- **Data Flow & Async**: Async/await patterns, error handling, and data fetching best practices

---

### 4.5 Session lifecycle

Approved policy: inactivity after **30 minutes** marks an unfinished attempt effectively abandoned, but it remains resumable until **24 hours from creation**. New answers and first completion stop at that deadline. Normal session/report access and surveys stop **seven days from creation**; activity never extends either deadline.

The implemented server gate authenticates every supplied known credential and blocks creation for an unfinished attempt younger than 24 hours, including inactive or unrestorable attempts. Completed and attempt-expired sessions do not block. Lists are limited to 1,000 credentials and checked server-side in 100-entry batches without truncation. The Stage 3 browser now scans/discovers all known stored/in-memory credentials and requires **Resume** or confirmed server-side **Delete** for a found blocker. Cancel, incomplete/failed discovery, and blocked/full/corrupt storage cannot authorize new creation. Scan/discovery/preflight/create/persist are coordinated by the **`devgrade.session-lifecycle` Web Lock** where supported, with only per-instance serialization otherwise; this is not global account/device ownership enforcement.

Browser handles are JSON **`version: 1`** at **`devgrade.session.<sessionId>`**: ID/token, optional ISO attempt/access deadlines, and optional `hint: { framework, targetLevel, questionCount }`. No questions, answers, report payloads, or XState snapshots are persisted, and hints are not authority. A valid credential inside a damaged hint/version is retained for discovery but flags corruption. A post-create handle-write failure preserves the current credential in memory and warns; retry reads that same session rather than creating another. Recovery after closing/refreshing an unsaved handle is not guaranteed.

History and explicit Resume restore the **original** server configuration, ordered questions/accepted progress, immutable report metadata, and separate saved survey state. Opening a session is read-only and never auto-resumes or first-completes; all-answered unfinished attempts still require an active/explicit Resume path before 24 hours. The machine reconciles accepted IDs after acknowledgements/conflicts, not local index increments. Display/submission timing is clamped to **0–3600 seconds**, resets on resume/new question, and excludes hidden/observed offline intervals and time between visits. At seven days normal access is denied and matching browser handles are removed only after server confirmation; DB rows remain pending explicit deletion or future cleanup.

Stage 4 **plans** daily cleanup at `0 3 * * *` UTC for all-status sessions aged **seven days or older**, including dependent records. **No scheduled cleanup is implemented or active yet.** Once operational, deletion would normally occur around 7–8 days, possibly later after failures/backlog; seven days is the enforced normal-access cutoff and cleanup-eligibility threshold, not a physical-erasure guarantee. Authenticated expected-state deletion is already available even after access expiry. Backup/WAL/replica retention is separate.

Delivery is tracked in §13 and [the lifecycle plan](docs/session-lifecycle-plan.md). Do not infer a production deployment from source implementation.

## 5. Technical Architecture & Data Schema

### 5.1 Tech Stack

- **Monorepo Architecture:** Turborepo / pnpm workspace (`apps/web`, `packages/ui`).
- **Framework:** TanStack Start (`@tanstack/react-router`) — a single full-stack React app (SSR + server functions). API routes (§7) are server functions within this app, not a separate service (decision #2).
- **Styling:** Tailwind CSS v4 + `shadcn/ui` using OKLCH CSS variables.
- **Database & ORM:** **PostgreSQL + Drizzle ORM in every environment** (dev, CI, prod) — no SQLite/Postgres split (decision #1). Migrations via Drizzle Kit.
- **State Management:** **XState** drives the assessment/recovery flow (`apps/web/src/machines/assessmentMachine.ts`); `sessionRecovery.ts` owns credentials and authenticated server-function calls. Safe views remain in memory, minimal handles persist in browser storage, and server reads reconcile progress. The full question set is still delivered up front (decision #5).
- **Validation:** Shared Zod schemas validate before DB work inside the typed, safe server-function envelope (§7.2).
- **Authentication:** Anonymous assessments (MVP) with optional user accounts in Phase 2. Access requires both a canonical UUID `sessionId` and an exact 64-hex-character `sessionToken`. A browser-generated `rawClientId` stored in `localStorage` is hashed only for rate limiting, never ownership (no IP or device fingerprint stored).

### 5.2 Core Data Schema

PostgreSQL DDL below reflects the implemented Drizzle schema (`apps/web/src/db/schema.ts`). Notable decisions: options are stored as a JSON array (not `option_a..d`), per-pillar results are **normalized** into `session_category_scores` (decision #4), each question carries a `source` for content provenance/licensing (§10.1), and no raw device fingerprint is stored (only a hashed `client_id` for rate limiting and the behavioral `focus_loss_count`).

Selectable lengths themselves require **no DB schema migration** and **no additional stored count or pricing fields**. Persist the ordered selected-question IDs once at creation; the length of `selected_question_ids` is authoritative for totals/progress, and first completion requires exactly that accepted-ID set. Existing 8-ID sessions remain Quick sessions; later defaults or client configuration must not reinterpret them.

Lifecycle migration `0002_dazzling_may_parker.sql` adds the nullable private `question_snapshot`, safe `report_snapshot`, and lifecycle indexes shown below. New writers always save versioned snapshots. Normalized result/pillar rows and the immutable awarded report come from one calculation in one parent-locked transaction. Snapshot reads validate format, selected order, and configuration; they never reconstruct content from the live bank. Null snapshots are legacy-only: unfinished rows are unrestorable, completed rows expose persisted summaries, and both retain their original creation-based deadlines. No stored expiry columns or new status are added.

```sql
-- 1. Skill Categories (competency pillars as data; extensible)
CREATE TABLE skill_categories (
    name VARCHAR(50) PRIMARY KEY,          -- reactivity, lifecycle, performance, async
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    pillar_order INT NOT NULL              -- default report order
);

-- 2. Question Backlog
CREATE TABLE questions (
    id VARCHAR(50) PRIMARY KEY,
    framework framework NOT NULL,          -- enum: react (MVP), vue, angular (future)
    difficulty difficulty NOT NULL,        -- enum: junior, mid, senior
    skill_category VARCHAR(50) NOT NULL REFERENCES skill_categories(name),
    title VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    code_block TEXT,                       -- optional syntax-highlighted snippet
    options JSONB NOT NULL,                -- string[] (4 options for MVP)
    correct_answer INT NOT NULL,           -- index into options; server-only
    explanation TEXT NOT NULL,             -- server-only until completion
    difficulty_weight REAL NOT NULL DEFAULT 1.0, -- 1.0 core / 2.0 advanced (granularity, #3)
    source VARCHAR(100) NOT NULL DEFAULT 'original', -- content provenance for licensing (§10.1)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_questions_framework_difficulty ON questions(framework, difficulty);
CREATE INDEX idx_questions_category ON questions(skill_category);

-- 3. Test Sessions
CREATE TABLE test_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(64) UNIQUE NOT NULL,   -- secret paired with id for access/deletion
    client_id VARCHAR(64) NOT NULL,              -- hashed browser ID; rate limiting, never ownership
    framework framework NOT NULL,
    target_level difficulty NOT NULL,
    status session_status NOT NULL DEFAULT 'in_progress', -- in_progress, completed, abandoned
    selected_question_ids JSONB NOT NULL,        -- ordered snapshot of 8/16/32 ids; authoritative length
    question_snapshot JSONB,                    -- private versioned content; required by new writers
    focus_loss_count INT NOT NULL DEFAULT 0,     -- behavioral anti-cheat signal
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- effective inactivity; future sweep
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_created_id ON test_sessions(created_at, id);
CREATE INDEX idx_sessions_status_activity_id ON test_sessions(status, last_activity_at, id);
CREATE INDEX idx_sessions_client_recent ON test_sessions(client_id, created_at);

-- 4. Session Answers (one row per answered question; correctness computed server-side)
CREATE TABLE session_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    question_id VARCHAR(50) NOT NULL REFERENCES questions(id),
    selected_answer INT NOT NULL,
    time_spent_seconds INT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, question_id)             -- one acceptance; same-option replay is a no-op
);
CREATE INDEX idx_session_answers_session ON session_answers(session_id);

-- 5. Session Results (one row per completed session)
CREATE TABLE session_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    target_level difficulty NOT NULL,            -- tier is interpreted relative to level
    total_score REAL NOT NULL,                   -- weighted overall %, 0..100
    max_score INT NOT NULL DEFAULT 100,
    proficiency_level proficiency NOT NULL,      -- proficient, developing, skill_gap
    report_snapshot JSONB,                      -- safe versioned award, public questions, saved pillar metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Session Category Scores (#4: normalized per-pillar rows, replaces fixed columns)
CREATE TABLE session_category_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    skill_category VARCHAR(50) NOT NULL REFERENCES skill_categories(name),
    correct_weight REAL NOT NULL,
    total_weight REAL NOT NULL,
    score_pct REAL NOT NULL,
    proficiency proficiency NOT NULL,
    UNIQUE (session_id, skill_category)
);
CREATE INDEX idx_category_scores_session ON session_category_scores(session_id);

-- 7. Session Surveys (post-assessment satisfaction, §3 KPI; one row per session)
CREATE TABLE session_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    helpfulness_rating INT NOT NULL,             -- 1..5; upserted on re-submit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. User Stories & Acceptance Criteria

### 6.1 Epic: Candidate Assessment Flow

**US-1: Framework, Level, and Length Selection**

- **As a** candidate
- **I want to** select my target framework, experience level, and assessment length
- **So that** I receive appropriately challenging questions in my chosen set size

**Acceptance Criteria:**

- Display framework selection (React only for MVP)
- Display experience level options (Junior, Mid, Senior)
- Display free Quick (8, default), Standard (16), and Deep (32) length options
- XState configuration includes the selected count, is immutable once started, and survives retries
- Show question counts without time estimates or statistical confidence/comparability claims

**US-2: Question Presentation**

- **As a** candidate
- **I want to** see questions with code examples and multiple choice options
- **So that** I can demonstrate my technical knowledge

**Acceptance Criteria:**

- Display question prompt with syntax-highlighted code blocks
- Show 4 labeled options (A, B, C, D)
- Render markdown code blocks in JetBrains Mono font
- Support RTL/LTR layouts with logical CSS properties
- Show progress indicator using the selected-question snapshot length (e.g. 2/8 for Quick, 2/16 for Standard, 2/32 for Deep)
- Display elapsed time per question

**US-3: Answer Submission**

- **As a** candidate
- **I want to** select and submit my answer
- **So that** my responses are recorded and scored

**Acceptance Criteria:**

- Single answer selection enforced
- Immediate visual feedback on selection
- Submit button enables only after selection
- Track time spent per question
- Prevent answer changes after submission

**US-4: Results Display**

- **As a** candidate
- **I want to** see a detailed breakdown of my performance
- **So that** I can identify specific skill gaps

**Acceptance Criteria:**

- Display overall score percentage
- Show radar chart of 4 competency pillars
- Categorize performance: Proficient (≥80%), Developing (50-79%), Skill Gap (<50%)
- Show correct/incorrect status per question
- Display explanations for incorrect answers
- Provide remediation suggestions for skill gaps

### 6.2 Epic: Assessment Management

**US-5: Session Initialization**

- **As a** system
- **I want to** create a unique assessment session
- **So that** candidate responses are properly tracked

**Acceptance Criteria:**

- Generate unique session token
- Initialize empty answer state
- Accept only numeric `questionCount` values 8, 16, or 32; default missing input to 8 and reject unsupported values
- Select exactly the requested count using stratified sampling (§4.2)
- Store session with timestamp and ordered selected-ID snapshot; derive length from that snapshot, not a separate count field
- Return session ID and all client-safe questions up front; keep the answer key server-side

**US-6: Stratified Question Selection**

- **As a** system
- **I want to** select questions balanced across competency pillars
- **So that** assessments cover all critical areas

**Acceptance Criteria:**

- Filter active questions by framework and target level
- Select exactly 1, 2, or 4 core (weight 1) + advanced (weight 2) pairs per pillar for 8, 16, or 32 questions respectively
- Randomize without replacement within each pillar's exact weight classes
- Ensure no duplicate questions in a single session
- Fail closed with `insufficient_questions` if any active pillar/weight-class pool is short; no substitutes, repeats, or silent shortening

---

## 7. API Specifications

### 7.1 Session API operations

The MVP exposes eight TanStack Start server functions in `server/assessmentFns.ts`, not hand-written REST routes. All use **POST** and **`Cache-Control: no-store`**, including discovery/reads. The `/api/...` headings below are logical operation names, not credential-bearing URLs. Calls use `{ data: input }`; examples show camelCase input and the current response envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. `existing_attempt` additionally carries safe `error.blockers` metadata. This is not the old plain-error/HTTP-response contract (§7.2).

Every existing-session operation requires `sessionId` (canonical 36-character UUID, normalized lowercase) plus `sessionToken` (exactly 64 hex characters, compared exactly). Validation precedes DB work; authentication precedes expiry/content disclosure. Wrong tokens and unknown IDs are indistinguishable. Credentials are not logged, placed in URLs, or inferred from `rawClientId`. Example credentials below are illustrative, not usable sessions.

#### POST /api/sessions — `createSessionFn`

Initialize a new assessment. Optional `questionCount` accepts exactly numeric **8, 16, 32**; omission defaults to **8**, without coercion/rounding. `rawClientId` is a nonempty string of at most 1,024 characters, stored only as a hash for rate limiting. Optional `knownCredentials` is an array of ID/token pairs (maximum **1,000**).

**Input (Quick example):**

```json
{
  "framework": "react",
  "targetLevel": "mid",
  "questionCount": 8,
  "rawClientId": "anonymous-browser-id",
  "knownCredentials": []
}
```

**Success response:**

```json
{
  "ok": true,
  "data": {
    "sessionId": "11111111-1111-4111-8111-111111111111",
    "sessionToken": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "attemptExpiresAt": "2026-09-26T10:00:00.000Z",
    "accessExpiresAt": "2026-10-02T10:00:00.000Z",
    "questions": [
      {
        "id": "q_123",
        "skillCategory": "reactivity",
        "title": "State updates",
        "prompt": "What happens when...",
        "codeBlock": null,
        "options": ["A", "B", "C", "D"]
      }
    ],
    "totalQuestions": 8
  }
}
```

> Example assumes creation at 2026-09-25 10:00 UTC; `questions` is abbreviated to one of eight. All selected questions arrive up front as `PublicQuestion` via `toPublicQuestion`, without `correctAnswer` or `explanation` (decision #5). Totals derive from selected IDs; no duration estimate is returned. The caller needs both credentials for later operations; Stage 3 saves a minimal version-1 handle and also retains it in recovery-layer memory (§4.5).

Creation validates the entire known list, authenticates/locks matching parents in deterministic ID order in **100-entry batches**, then reads fresh DB time and child progress. Any supplied authenticated unfinished attempt younger than 24 hours returns `existing_attempt` without insertion, regardless of settings/inactivity/snapshot restorability. Completed/attempt-expired sessions do not block. No truncation or partial discovery authorizes creation, and the final check does not trust earlier discovery. Omitted/lost credentials cannot be discovered; this is not global ownership enforcement. Stage 3 supplies the complete checked stored/in-memory credential list and implements Resume/Delete, fail-closed storage preflight, and same-browser Web Lock coordination (§4.5).

#### POST /api/sessions/:id/answers — `submitAnswerFn`

The full question set is already client-held. Submission saves an answer and returns **authoritative progress**, not new question content. It validates selected-ID membership, saved option bounds, and integer duration **0–3600 seconds**, then grades from the private snapshot under the parent lock.

**Input:**

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "sessionToken": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "questionId": "q_123",
  "selectedAnswer": 1,
  "timeSpentSeconds": 45
}
```

**Success response:**

```json
{
  "ok": true,
  "data": {
    "success": true,
    "sessionComplete": false,
    "acceptedAnswer": {
      "questionId": "q_123",
      "selectedAnswer": 1,
      "timeSpentSeconds": 45
    },
    "answeredCount": 1,
    "totalQuestions": 8,
    "nextQuestionId": "q_124"
  }
}
```

`nextQuestionId` is the first unanswered selected ID by set membership, or `null` when all are accepted. `sessionComplete` does not award the report. Same-option retries acknowledge the original accepted duration without timing/status/activity writes; different-option retries conflict. Completed/expiry checks precede acknowledgement, so late retries do not bypass deadlines. Newly accepted answers atomically set `in_progress` and refresh activity. The Stage 3 API adapter preserves the full result. After acknowledgement the machine rereads `getSession`, derives the first unanswered question from the refreshed accepted-ID set, and handles typed conflicts/expiry rather than incrementing a local index. This is authoritative progress reconciliation; it does not introduce a next-question-content endpoint.

#### POST /api/sessions/:id/complete — `completeSessionFn`

Accepts `{ sessionId, sessionToken }`. First completion requires the exact selected accepted-ID set and an unfinished attempt strictly younger than 24 hours. Inside one parent-locked transaction, saved inputs produce normalized overall/pillar rows, the immutable report snapshot, and completed status/timestamps. Repeated completion returns the saved result without rescoring/activity writes, including after 24 hours while normal access remains open. Legacy completed rows return `legacy_summary_available`; read their summary with `getSessionFn` instead.

**Success response (`AssessmentResult`; question results abbreviated):**

```json
{
  "ok": true,
  "data": {
    "sessionId": "11111111-1111-4111-8111-111111111111",
    "framework": "react",
    "targetLevel": "mid",
    "totalScore": 75,
    "maxScore": 100,
    "proficiencyLevel": "developing",
    "categoryScores": [
      { "skillCategory": "reactivity", "correctWeight": 3, "totalWeight": 3, "scorePct": 100, "proficiency": "proficient" },
      { "skillCategory": "lifecycle", "correctWeight": 2, "totalWeight": 3, "scorePct": 66.67, "proficiency": "developing" },
      { "skillCategory": "performance", "correctWeight": 1, "totalWeight": 3, "scorePct": 33.33, "proficiency": "skill_gap" },
      { "skillCategory": "async", "correctWeight": 3, "totalWeight": 3, "scorePct": 100, "proficiency": "proficient" }
    ],
    "skillGaps": ["performance"],
    "questionResults": [
      { "questionId": "q_123", "isCorrect": true, "explanation": "Correct answer explanation" }
    ]
  }
}
```

> Quick example: correct weight 9 of 12 gives 75; only performance is below 50. Standard/Deep retain the same formula (§4.4). `categoryScores` is an array of normalized rows, not fixed per-pillar columns; `questionResults` follows selected presentation order. No `correctAnswer` field or separate `remediation` map is returned. Completion still returns `AssessmentResult`; the Stage 3 machine then calls `getSessionFn` and renders the immutable saved report, public questions, pillar metadata, and separate survey state. Completion retries read before another attempt, recovering a lost committed award without rescoring.

#### POST /api/sessions/:id/survey — `submitSurveyFn`

Accepts `{ sessionId, sessionToken, rating }`, integer `rating` **1–5**. Requires completed state and normal access before seven days from session creation. Upserts one row in `session_surveys`, leaving session activity and the immutable report unchanged. Success is `{ ok: true, data: { success: true } }`.

#### Discovery, read, resume, and delete — POST server functions

- **`discoverSessionsFn({ data: { credentials } })`:** maximum 1,000 validated ID/token pairs, queried in batches of 100. Returns `data.sessions` entries: `available` with safe metadata (configuration/count, original creation time, both deadlines, effective status, answered/total counts, `blocksCreation`, `canResume`), or generic `unavailable` plus the supplied ID for missing/wrong-token/access-expired rows. Never lists sessions by client-ID hash or returns question/answer content.
- **`getSessionFn({ data: credential })`:** read-only; before access expiry returns the five `kind` variants below. Discovery and reads use **read-only `REPEATABLE READ`** for coherent multi-query snapshots; no activity/status writes. A snapshot already authorized cannot be recalled after a later deletion.
- **`resumeSessionFn({ data: credential })`:** parent-locked; eligible unfinished attempts reactivate and refresh activity. Otherwise returns the completed/expired/legacy view without activity writes. Does not auto-complete all-answered attempts; access-expired requests fail.
- **`deleteSessionFn({ data: { sessionId, sessionToken, expectedState } })`:** `expectedState` is `unfinished` or `completed`, representing the caller's confirmation. Under the parent lock, a match cascades deletion and returns `data: { kind: "deleted" }`; mismatch returns `data: { kind: "changed_state", currentState }` without deletion. Still allowed after access expiry. Missing/wrong-token rows return `not_found`. Stage 3 supplies inline confirmation (Cancel initially focused; Escape cancels), preserves a handle on changed state and opens its current view, and rechecks the creation gate only after confirmed deletion/unavailability. Canceling confirmation also cancels creation.

| `getSession` kind | Returned data |
| --- | --- |
| `assessment` | Original configuration/status/deadlines, safe ordered questions, accepted selections/durations without correctness, counts and `nextQuestionId` |
| `attempt_expired` | Minimal authenticated unfinished metadata/deadlines, no resume payload or partial score |
| `report` | Immutable `reportSnapshot`, ID, both deadlines, separate nullable survey rating |
| `legacy_summary` | Persisted overall/pillar summary and completion time, deadlines/survey rating, no invented historical question review |
| `legacy_unrestorable` | Unfinished null-snapshot metadata; cannot resume and blocks creation below 24 hours |

Completed state precedes attempt expiry; unfinished expiry precedes legacy content. Invalid non-null snapshots fail with `snapshot_unavailable`, never a live-bank reconstruction. Every mutation locks the authenticated parent before children and checks fresh PostgreSQL time after lock acquisition; waiting across a deadline cannot use stale transaction-start time.

### 7.2 Error Handling Strategy

The active wire failure is **`{ ok: false, error: { code, message } }`**, with `blockers` for `existing_attempt`. Safe messages are selected by code, not raw exception text; validation and DB-initialization failures are inside this boundary. The following are logical `AssessmentError.status`/`toErrorResponse` mappings, **not HTTP statuses automatically emitted by the server-function adapter**:

- **400:** `bad_request` — invalid inputs, including unsupported count, malformed credentials, invalid option/duration, or incomplete first completion.
- **404:** `not_found` — unknown session or mismatched token, without expiry disclosure.
- **409:** `conflict` for a different accepted option; `session_completed`, `insufficient_questions`, `existing_attempt`, `legacy_unrestorable`, `legacy_summary_available`, or `snapshot_unavailable`. Same-option eligible replay is success, not conflict.
- **410:** `attempt_expired` or `access_expired` for operations barred by their deadlines. An authenticated read/resume may instead return the retained `attempt_expired` view before access expiry.
- **429:** `rate_limited` — best-effort maximum five sessions per trailing hour per hashed browser client ID, not per IP.
- **500:** `internal_error` — generic safe message; no credentials, Zod issue payloads, SQL, or raw DB error details.

The browser API adapter preserves typed failures in `AssessmentClientError`. Stage 3 recovery/XState reconciles conflicts, completed/legacy states, and attempt expiry; terminal `not_found`/`access_expired` clears the matching handle, while transient failures preserve it. Local removal failures warn rather than imply that all browser copies were erased.

---

## 8. Deployment & Monitoring Strategy

### 8.1 Deployment Architecture

**MVP Deployment:**

- **Hosting**: A **single full-stack TanStack Start app** (decision #2) deployed to one Node host (e.g. Railway, Fly.io, or a Vercel Node deployment). The UI and the `/api/*` server functions ship together — there is no separately hosted API service.
- **Database**: **PostgreSQL in every environment** (decision #1) — local via Docker, managed Postgres in production (e.g. Railway/Neon/Supabase). Drizzle Kit runs migrations on deploy.
- **CDN**: Edge/CDN caching for static assets and the client bundle.
- **Scheduled Jobs (Stage 4, not implemented)**: One protected daily `0 3 * * *` UTC maintenance invocation will delete eligible all-status sessions and materialize retained idle status in bounded parent-locked batches. Request-time inactivity and access expiry already work independently of scheduling; there is no active cleanup job yet.
- **Environment Variables**: `DATABASE_URL` (see `apps/web/.env.example`), managed via the host dashboard.

**Infrastructure Requirements:**

- Node.js 20 LTS or newer (Node 18 reaches end-of-life before the target release)
- 1 GB RAM minimum for the app server
- Managed PostgreSQL with connection pooling (client uses `prepare: false` for pooler compatibility)
- Automatic SSL termination

### 8.2 Monitoring & Observability

**Key Metrics to Track:**

- API response times (p50, p95, p99)
- Error rates by endpoint (and by `AssessmentError` code)
- Session completion / abandonment rates
- Database query performance
- User engagement metrics

**Tools:**

- Host-native analytics for frontend performance
- Host metrics for app health
- Custom logging for the assessment completion funnel
- Sentry for error tracking and alerting

---

## 9. Phased Implementation Roadmap

```
  Phase 1: Deterministic MVP            Phase 2: Live Code Sandbox          Phase 3: AI-Driven Engine
 ┌─────────────────────────────┐       ┌─────────────────────────────┐     ┌─────────────────────────────┐
 │ • JSON Question Backlog     │       │ • In-browser Monaco Editor  │     │ • Dynamic Question Generator│
 │ • Stratified Sampling Engine│ ────► │ • Client-side Vitest Runner │ ──► │ • LLM Code Rubric Evaluator │
 │ • Rule-Based Scoring        │       │ • Interactive Debugging     │     │ • Natural Language Feedback │
 │ • Skill Radar Report UI     │       │ • Anti-cheat typing metrics │     │ • Personalized Study Plans  │
 └─────────────────────────────┘       └─────────────────────────────┘     └─────────────────────────────┘

```

---

## 10. Business & Operational Considerations

### 10.1 Content Strategy

**Question Bank Management:**

- Initial target: 50 questions per difficulty level (150 total), with a **minimum of ~12 per (level × pillar) bucket** so stratified sampling always has a healthy pool to randomize over (anti-leakage). Each bucket needs both core (weight 1.0) and advanced (weight 2.0) items for the score-granularity model. **Current progress:** 144 items live (Batches A–C — **6 core + 6 advanced per bucket**, meeting the ~12/bucket pool-depth target); the enforced per-bucket floor lives in `MIN_CORE_PER_BUCKET`/`MIN_ADVANCED_PER_BUCKET` (currently 6/6) and is asserted by `db/__tests__/seedData.test.ts`, raised toward the target as later batches land.
- Review cycle: Quarterly validation against latest framework documentation
- Question lifecycle: Draft → Review → Active → Deprecated
- Contributor model: Expert review panel for technical accuracy

**Quality Assurance:**

- Cross-reference explanations with official documentation (React.dev)
- Statistical analysis of question difficulty (pass rates by level)
- A/B testing of question clarity and effectiveness
- Community feedback loop for question improvement

**Content sourcing & licensing:**

To reach a working, testable product quickly, the MVP seeds an _original, pillar-tagged_ React question bank authored for DevGrade, with a subset **paraphrased/adapted** (never copied verbatim) from two public, permissively-licensed reference banks:

| Reference                                                                                         | License | Used for                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| [`sudheerj/reactjs-interview-questions`](https://github.com/sudheerj/reactjs-interview-questions) | MIT     | Canonical React concepts across all four pillars (reference to author from).               |
| [`lydiahallie/javascript-questions`](https://github.com/lydiahallie/javascript-questions)         | MIT     | MCQ format template and the JS event-loop/async items feeding the **Async & Data** pillar. |

**Policy:**

- **No verbatim ingestion.** Copying question/answer text wholesale is both a validity risk (public banks are the first thing candidates study → answer leakage) and a licensing burden. Items are re-authored in DevGrade's voice and re-tagged to a pillar/level.
- **Provenance is tracked at the data layer.** Every `questions` row carries a `source` (`original`, or the reference repo slug — see `CONTENT_SOURCE` in `domain/constants.ts`), so attribution obligations are auditable and reportable. MIT requires retaining the upstream license/attribution; a repo-level `NOTICE` lists the referenced banks.
- **Trajectory:** as the bank grows toward the §10.1 targets (min per level×pillar bucket), adapted items are progressively replaced by original items so the production pool is leakage-resistant and wholly owned. Expert review still validates every item against React.dev regardless of source.
- **Attribution:** MIT attributions for the referenced banks are retained in `NOTICE`; the report UI credits sourced content where shown.

### 10.2 Legal & Compliance

**Data Privacy:**

- GDPR-compliant data handling for EU users
- Seven-day normal-access limit is enforced; daily cleanup of sessions aged seven days or older remains Stage 4 work (§4.5). No exact physical-erasure guarantee; backup/WAL/replica retention must be documented separately.
- Authenticated expected-state erasure and Stage 3 confirmation/recovery UI are implemented in source. Same-origin scripts/shared-profile users can read localStorage credentials; handles are not accounts or shareable report links.
- Cookie consent mechanism for analytics

**Terms of Service:**

- Clear disclaimers about assessment limitations
- No employment guarantee implications
- Intellectual property rights for question content
- User content licensing for community contributions

**Accessibility:**

- WCAG 2.1 AA compliance for UI components
- Screen reader compatibility for code blocks
- Keyboard navigation support
- Color contrast compliance (4.5:1 minimum)

### 10.3 Go-to-Market Strategy

**Target Market Segmentation:**

- Individual developers (B2C): Self-assessment and skill benchmarking
- Small companies (B2B): Team skill assessment and training needs
- Recruiting agencies (B2B): Candidate pre-screening

**Pricing Model:**

- **Free tier (MVP):** Anonymous Quick (8, default), Standard (16), and Deep (32) assessments, all with full skill-radar reports and remediation suggestions. Selectable lengths add no pricing or payment requirement.
- Additional paid tiers (e.g., unlimited assessments, team dashboards, API access) will be introduced once Phase 2+ features land. Tier definitions are intentionally deferred until that scope is implemented.

---

## 11. Risks & Mitigation Strategies

| Risk                                 | Impact | Likelihood | Mitigation Strategy                                                                                                                                                                                        |
| ------------------------------------ | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question Bank Leakage / Cheating** | High   | Medium     | Use randomized sampling across per-bucket pools (min ~12 per level × pillar); hashed `client_id` rate limiting (not IP, avoids shared-NAT lockout); focus-loss detection and per-question timing analysis. |
| **Subjective Question Quality**      | Medium | Medium     | Validate explanations against official framework documentation (React.dev); implement statistical analysis of pass rates; expert review panel for technical accuracy.                                      |
| **Low Engagement on Long Tests**     | Medium | Low        | Default to Quick (8 questions); let candidates opt into Standard (16) or Deep (32), with clear counts and no promised duration; provide constructive results visualization.                                                  |
| **Technical Debt from MVP Scope**    | High   | Medium     | Design architecture with clear upgrade paths; document technical decisions; plan for framework expansion from initial React-only approach.                                                                 |
| **Insufficient Question Diversity**  | Medium | High       | Implement aggressive initial content creation (150+ questions); establish contributor model; A/B test question effectiveness continuously.                                                                 |
| **Performance Degradation at Scale** | Medium | Low        | Design database with proper indexing; implement caching for static question content; monitor API response times; plan database scaling strategy.                                                           |

---

## 12. Architectural Decisions (Resolved)

The original decisions below were open in v1.1.0 and implemented for the Quick baseline in `apps/web` (domain, DB schema, server services, and the XState machine). Selectable lengths and lifecycle Stages 1–3 are implemented in source; reported independent validation and remaining Stage 4 maintenance/rollout work are recorded in §13, without a production deployment claim.

1. **Database engine — RESOLVED: PostgreSQL everywhere.** SQLite is dropped entirely; local, CI, and prod all run PostgreSQL via Drizzle ORM + Drizzle Kit migrations (`apps/web/src/db/schema.ts`, `drizzle.config.ts`).
2. **Deployment topology — RESOLVED: single full-stack app.** The UI and `/api/*` server functions ship together as one TanStack Start deployment (see §8.1). No separately hosted API.
3. **Score granularity — RESOLVED: weighted core/advanced pairs.** Each pillar draws 1/2/4 pairs for Quick/Standard/Deep, with exact core (1) and advanced (2) weights. Quick resolves to 0/33.33/66.67/100; longer lengths give finer resolution with unchanged scoring and equal pillar contributions (see §4.2–4.4; `domain/constants.ts`, `domain/sampling.ts`, `domain/scoring.ts`).
4. **Results storage — RESOLVED: normalized.** Per-pillar scores live in `session_category_scores` (one row per pillar per session); no hardcoded pillar columns (see §5.2). Generalizes to future frameworks/pillars.
5. **Question delivery — RESOLVED: all up front.** Creation returns all selected client-safe questions (8/16/32), while the answer key stays server-side. Answer success now returns `{ success, sessionComplete, acceptedAnswer, answeredCount, totalQuestions, nextQuestionId }` inside the typed envelope. `nextQuestionId` is authoritative progress, not another question-content round-trip; all content still arrives up front (§7.1).

**Related considerations — addressed:**

- **Level context:** `session_results.target_level` is stored so a tier is read relative to the tested level. Cross-level normalization for recruiter comparison is deferred to the recruiter-facing phase.
- **Rate limiting:** keyed on the hash of the browser's localStorage client ID (not a cookie or IP), avoiding shared-NAT grouping. Five creations per trailing hour is best-effort, not globally serialized identity enforcement (`MAX_SESSIONS_PER_HOUR`, `db/queries.ts`).
- **Privacy:** no raw device fingerprint; the behavioral `focus_loss_count` column and hashed client ID remain. Erasure uses ID/token plus confirmed expected state through `deleteSession`, cascading to all session children/snapshots. Token-only helpers are removed; the client ID never grants access or deletion.
- **Pool sizing:** content target set to a minimum per (level × pillar) bucket — see §10.1. Sampling must fail closed with an `insufficient_questions` error when the active pool cannot supply the requested 1/2/4 core+advanced pairs per pillar; substitutes, repeats, and silent shortening are forbidden. A pillar-tagged **144-question** React bank ships in `db/seedData.ts` (six core + six advanced per bucket), with per-row `source` provenance for licensing (see §10.1 "Content sourcing & licensing") and a guard test (`db/__tests__/seedData.test.ts`) enforcing the per-bucket minimum depth.
- **Abandonment:** request-time policy derives effective `abandoned` state at 30 minutes without mutating reads. Eligible explicit resume/new answers reactivate the attempt; neither extends its 24-hour lifetime. The old unbounded helper is removed; a bounded daily materialization/cleanup worker is pending (§8.1).

---

## 13. Implementation Plan (MVP)

The domain core, server functions, candidate UI/report, selectable lengths, and lifecycle Stages 1–3 are delivered in source (`apps/web/src/{domain,db,server,machines,components,routes}`), currently on `session-lifecycle/recovery`. Stage 4 maintenance/rollout remains pending. Reported independent validation and implementation-agent checks below distinguish passing tests/browser/direct package checks from three existing chart typecheck errors and the failing root pnpm launcher. Source delivery is not production deployment. Lifecycle stage numbers are separate from the original MVP phases below.

### Session lifecycle — staged delivery

1. **Policy and durable content — implemented:** pure 30-minute/24-hour/seven-day policy; private question and safe report snapshots alongside normalized scores; pinned v1 scoring; generated nullable snapshot/index migration. No fabricated legacy content or reset of original creation-based deadlines. [PR #1](https://github.com/kleva-j/DevGrade/pull/1) exists for this first layer.
2. **Server lifecycle and creation gate — implemented on `session-lifecycle/server`:** strict ID/token credentials; parent-first mutation locks and fresh DB clock checks; read-only repeatable-read discovery/views; five `getSession` variants; explicit resume distinct from reads; idempotent answer/completion; confirmed expected-state deletion; full-list known-credential gate (maximum 1,000, batches of 100), not global ownership. All server functions return typed no-store POST envelopes; answer success includes authoritative `nextQuestionId` without changing up-front question delivery.
3. **Browser recovery and Resume/Delete UX — source delivered on `session-lifecycle/recovery`:** version-1 `devgrade.session.<sessionId>` handles, fail-closed storage/discovery/preflight, `devgrade.session-lifecycle` Web Lock coordination, original-configuration explicit Resume, authoritative accepted-ID reconciliation, confirmed Delete/cancel/changed-state handling, history and saved-report/pillar metadata/survey restoration, typed unavailable/expiry paths, and bounded timing excluding hidden/offline intervals. Post-create storage failure retains the current session in memory with a warning, not duplicate creation. No production deployment is claimed.
4. **Daily cleanup and rollout — not implemented:** no active scheduled cleanup or inactivity worker. Activation requires authorized migration, bounded maintenance/route implementation, scheduler/secret setup, backlog/backup policy, and deployment verification.

**Stage 3 independent validation, reported by the primary agent (2026-09-25): 339 tests passed, 0 skipped**, using disposable **PostgreSQL 18.1**, real migrations, and the **144-question seed**; independent-backend lock-barrier coverage remains in the suite. **Headed Chrome 153: five scenarios, 55 named checks** covered 8/16/32 completion/reload/report/survey, Resume/Delete/cancel/cascades, and two same-context tabs coordinated via Web Locks producing only **one new row**. Expired all-answered unfinished attempts could not first-complete late. At **age ≥7 days**, report access was denied and handles removed while DB rows remained. **197 no-store responses** were observed; **187 pre-completion responses** contained no answer-key markers. Keyboard Delete confirmation and **320px mobile dark RTL** had no horizontal overflow; no console errors or HTTP 5xx were observed. These are scoped observed checks, not exhaustive browser or deployment guarantees.

Direct web/UI lint passed; web build passed **per the implementation agent**. Typecheck remains at **three pre-existing unrelated shared `chart.tsx` errors**. Root `pnpm lint` / version checks failed during automatic switching to **10.33.4** because of signature verification; reported fallback checks used pinned **pnpm 10.20** and direct tools. Neither root lint nor root build success is claimed. No application tests/build/browser runs were repeated by this documentation task. Apply migration `0002_dazzling_may_parker.sql` before new writers and preserve dependency order; Stage 4 still needs authorized migration/scheduler/secret/backlog/backup rollout verification. See [current behavior and validation commands](docs/sessions-and-evaluation.md#9-verification-and-source-map) and [remaining exit criteria](docs/session-lifecycle-plan.md#7-verification-and-remaining-exit-criteria).

**Repeatable validation:** with an explicit dedicated `TEST_DATABASE_URL`, run `node --import tsx --test "src/**/*.test.ts"` from `apps/web` (`node:test`, no `tsx` CLI IPC startup). Configured root entry points remain `pnpm --filter web test`, `pnpm --filter web typecheck`, `pnpm lint`, and package build `pnpm --filter web build`, but the failing **10.33.4** launcher is not a successful validation path. The reported fallback used pinned **pnpm 10.20** and direct checks. Installed lockfile-resolved commands such as `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js`, and `node node_modules/vite/bin/vite.js build` from `apps/web` bypass the launcher; also run the installed ESLint command from `packages/ui` for that package. Do not change the project pin or infer root Turbo success from package results.

### Selectable lengths — implemented extension

- [x] Carry exact numeric `questionCount` (8/16/32; missing → 8) from intake through immutable XState configuration and creation, preserving it through retries and return to setup.
- [x] Enforce strict active-pool weight-class sampling (§4.2); derive session length and completion from the existing ordered selected-ID snapshot, with no schema migration or extra stored count/pricing.
- [x] Update intake/progress/report copy for the three free lengths; retain all-public-questions-up-front delivery and server-only answer keys, with no time or statistical confidence/comparability promises.
- [x] Validate all lengths, omitted and invalid inputs, exact class quotas, uniqueness, active-pool shortfalls (no fallback), unchanged weighted scoring/equal pillar contributions, snapshot-based completion, client-safe delivery, and configuration/retry preservation.

**Verification (2026-09-24):** 217 tests passed with an isolated temporary PostgreSQL 18 database, including all nine length/level combinations. Production build and repo-wide lint passed. Browser smoke tests completed Quick, Standard, and Deep against the seeded 144-question bank; checked keyboard selection, mobile light/LTR and dark/RTL layouts, final-question completion, report counts, and configuration preservation. No answer-key/seed markers were found in the built public JavaScript. Typecheck remains blocked by three unrelated errors in the existing shared `chart.tsx` edits (lines 154/158); this extension does not change that file.

**Repeatable DB tests:** set `TEST_DATABASE_URL` to a dedicated PostgreSQL test database and use the commands above. Integration tests create/drop only their own unique schemas using temporary copies of real migrations; independent clients verify schema/backend identity for concurrency barriers. Without this explicit variable DB suites skip; configured failures fail, with no fallback to `DATABASE_URL`. To enable longer assessments in an existing deployment, apply the existing migrations and run `pnpm --filter web db:seed` against that environment if the bank is not already current. Lengths themselves need no migration; lifecycle snapshots require `0002`.

### Phase 0 — Foundations (complete)

**Status:** historical foundations complete; the original baseline below is superseded where noted by the implemented lifecycle stages above.

- [x] Domain layer: constants, types, seeded sampling, weighted scoring.
- [x] PostgreSQL schema (Drizzle) + normalized results + indexes + question `source` provenance column.
- [x] Server service foundations: create/submit/complete, Zod validation, and rate limiting. Lifecycle Stage 2 now owns authenticated access/deletion and request-time inactivity; scheduled maintenance remains Stage 4 work.
- [x] XState assessment machine (configure → create → answer → complete, with retry states).
- [x] Initial Drizzle migration (`drizzle/0000_init.sql`) committed; `docker-compose.yml` for local Postgres 16.
- [x] Seed `skill_categories` (from `SKILL_CATEGORY_META`) and a starter React bank of **24 questions** (3 levels × 4 pillars × core/advanced), pillar-tagged with `source` provenance (`db/seedData.ts`, idempotent `db/seed.ts`, `pnpm db:seed`).
- [x] Unit tests (`node:test` via `tsx`, `pnpm test`): 26 tests covering scoring (every 0/33/67/100 path), proficiency boundaries, sampling (weight-class pairing, shortfalls, seeded determinism), and the PRNG. All passing.
- **Historical exit criteria:** baseline scoring/sampling tests passed (26/26) and the original 24-item seed covered every level×pillar core/advanced pair. Current real-migration PostgreSQL coverage and the expanded bank are recorded above; this is not a production migration/seed claim.

### Phase 1 — API wiring (server functions)

Expose the service through TanStack Start server functions. **Largely complete.**

- [x] `createServerFn` handlers for create/submit/complete/survey plus discovery/read/resume/delete (`server/assessmentFns.ts`); Stage 2 uses safe typed envelopes and no-store POST for all operations (§7).
- [x] Anonymous client ID: minted client-side in `localStorage`, passed into creation and hashed only for best-effort rate limiting, never ownership. Session records remain server-side.
- [x] `AssessmentApi` adapter unwraps all eight typed server-function envelopes; `createBrowserRecovery` constructs per-flow storage, credential ownership, Web Lock coordination, and server calls (`machines/assessmentServices.ts`).
- [x] Erasure POST server function requires ID/token and confirmed expected state, with cascading deletion and changed-state protection; Stage 3 inline confirmation/cancel/reconciliation UI is delivered.
- **Verification:** client-safe payload/handler tests, isolated PostgreSQL service/race coverage, and the Stage 3 headed-browser response checks above are reported. No production deployment or exhaustive HTTP/browser coverage is implied.

### Phase 2 — Candidate UI (the assessment flow)

Build the screens, driven by `@xstate/react` `useMachine`. **Complete.**

- [x] Intake (`components/assessment/Intake.tsx`): framework (React enabled, Vue/Angular gated "soon") + level → `CONFIGURE`/`START`.
- [x] Question runner: prompt + `font-mono` code block, radio options, progress `N/Total` bar, per-question timer, `SELECT_OPTION`/`SUBMIT_ANSWER`; `FOCUS_LOSS` wired to `visibilitychange` in the orchestrator.
- [x] Bootstrap/checking, restoring/resuming, answer/reconciliation, completion, confirmation/deletion, and typed expiry/unavailable/failure states with Retry/Cancel/History actions (`AssessmentFlow.tsx`, `assessmentMachine.ts`).
- [x] Repeated copy centralized in `components/assessment/copy.ts` (mirrors the server `MESSAGES` seam); RTL-safe logical classes; native radios in `fieldset/legend` for a11y.
- **Stage 3 verification:** Quick/Standard/Deep completion/reload, saved-report/survey recovery, Resume/Delete/cancel, Web Lock coordination, expiry handling, keyboard confirmation, and 320px dark RTL checks are reported above. Current typecheck still has three unrelated chart errors; production rollout is not claimed.

### Phase 3 — Report & skill radar

Render the immutable completed `ReportSnapshot` with saved public questions/pillar metadata and separate survey state; legacy rows render persisted summaries only. **Delivered in source, including Stage 3 recovery/history.**

- [x] Overall score + proficiency tier badge; categorical SVG skill radar (`SkillRadar.tsx`, `--chart-*` pillar colors); per-pillar breakdown bars; per-question correct/incorrect with explanations; focus areas (flagged gaps) with pillar remediation copy.
- [x] Post-assessment 1-question satisfaction survey (feeds the Satisfaction KPI): normalized `session_surveys` (integer 1–5, unique per session, server upsert), allowed only after completion and before access expiry. Stage 3 restores the saved rating/thank-you state on report reload; the current thanks UI has no change-rating control.
- **Exit criteria:** report matches persisted `session_results` + `session_category_scores`; skill gaps render remediation.

### Phase 4 — Content & hardening

Make it production-credible.

- Grow the question bank from the 144-item bank (Batches A–C, 6 core + 6 advanced per bucket, meeting the §10.1 pool-depth target) toward the broader §10.1 content goals, each tagged core/advanced via `difficulty_weight`; keep `MIN_CORE_PER_BUCKET`/`MIN_ADVANCED_PER_BUCKET` honest via `db/__tests__/seedData.test.ts`; progressively replace `source`-adapted items with `original` ones (§10.1 content-sourcing policy).
- Lifecycle Stage 4 bounded daily cleanup/inactivity job and authorized rollout; Sentry + funnel logging. Server rate-limit/erasure paths and Stage 3 browser erasure UX are implemented and covered; scheduled maintenance remains pending.
- Analytics events for the KPI table (completion, duration, survey).
- **Exit criteria:** KPIs in §3 are all measurable from real data; launch checklist (legal/accessibility in §10.2) green.

### Cross-cutting: testing

- **Unit (implemented Quick baseline):** scoring (each 0/33/67/100 path, shown as whole percentages), sampling (weight-class pairing incl. unbalanced pools + seeded determinism + shortfall), proficiency boundaries, and PRNG determinism — `node:test`, run with `pnpm test`. Selectable-length coverage is listed in the extension checklist above.
- **Integration (implemented):** isolated real-PostgreSQL service/snapshot/lifecycle tests, strict credentials, known-list batching/gate, safe wire handlers, idempotent replays, exact completion membership, expected-state deletion, independent-backend races/fresh-clock barriers, and coherent reads. Maintenance coverage is Stage 4 work.
- **Machine/browser (Stage 3 delivered):** storage/SSR/failure handling, original-configuration restoration, accepted-ID reconciliation, bounded/offline timing, Resume/Delete/cancel, report/survey recovery, and lifecycle outcomes are covered by automated tests and the scoped independent headed-browser checks above. Stage 4 deployment/maintenance checks remain pending.
