# Product Requirements Document (PRD): DevGrade

**Document Version:** 1.2.2

**Status:** Approved for MVP Development

**Target Release:** Q4 2026

**Last Updated:** 2026-09-15

**Change Log:**

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | — | Initial approved MVP scope. |
| 1.1.0 | 2026-09-15 | Clarified React-only MVP; moved scoring server-side; 4-pillar stratified sampling (8 questions); added data schema, user stories, API specs, deployment, and compliance sections; reduced pricing to free tier only; corrected the report example; inline formatting cleanup. See §12 for open architectural decisions. |
| 1.2.0 | 2026-09-15 | Resolved all open decisions and implemented the domain/DB/server/state-machine core in `apps/web`: PostgreSQL everywhere (#1), single full-stack deploy (#2), weighted core/advanced score granularity 0/33/67/100 (#3), normalized `session_category_scores` (#4), all-questions-up-front delivery (#5). Addressed rate-limiting, privacy, abandonment, and pool-size items. Reworked §5.2 schema, §7 API, §8 deployment, §12 (now resolved), and added §13 Implementation Plan. |
| 1.2.1 | 2026-09-15 | Added §10.1 "Content sourcing & licensing" (paraphrase-not-copy policy referencing MIT-licensed `sudheerj/reactjs-interview-questions` and `lydiahallie/javascript-questions`). Added a per-question `source` provenance column (§5.2) and a pillar-tagged 24-question React starter bank (`db/seedData.ts` + idempotent `db/seed.ts` + `db:seed`). Completed Phase 0 seed/migration items (§13). |
| 1.2.2 | 2026-09-16 | Phase 0 review fixes: unit test suite (`node:test`, 26 tests, `pnpm test`) covering scoring/sampling/proficiency/PRNG; hardened stratified sampling to pair core+advanced by weight class (robust for unbalanced pools); narrowed the duplicate-answer catch to true unique-violations; guarded the completion question lookup; `count(*)` for answered-count; auto-bump `questions.updated_at`; category upsert on re-seed; extracted `RATE_LIMIT_WINDOW_MINUTES` and computed `PROFICIENCY_THRESHOLDS` keys; declared `tsx`. Phase 0 marked complete (§13). |
| 1.3.0 | 2026-09-16 | Phases 1–3 implemented in `apps/web`: TanStack Start server functions (`server/assessmentFns.ts`) as the client API boundary (answer key verified absent from the client bundle, decision #5); XState-driven candidate UI (`components/assessment/*`: intake, question runner with per-question timer + `visibilitychange` focus-loss, loading/error/retry) wired via `machines/assessmentServices.ts`; report with categorical skill radar, per-pillar breakdown, focus areas, and question review. Anonymous client id minted client-side in `localStorage` and passed to `createSession` (replaces the server cookie plan; hashed server-side, equivalent for rate limiting). Promoted categorical `--chart-*` + `--code-*` tokens into `globals.css` and documented them in `design.md` §4. |

---

## 1. Executive Summary

**DevGrade** is an adaptive, AI-ready technical skill assessment platform designed to evaluate front-end software engineers specializing in modern web frameworks. The MVP focuses on React expertise, with future phases expanding to Vue and Angular support.

Traditional hiring tests and quiz apps rely on static, binary pass/fail questions that fail to identify _why_ a candidate struggled. DevGrade solves this by categorizing questions across four core engineering competency pillars (Reactivity & State Management, Component Lifecycle & Architecture, Performance & Rendering, and Data Flow & Async Operations).

The initial **MVP (Phase 1)** delivers a deterministic, lightweight multiple-choice testing engine focused on React expertise, using stratified random sampling (8 questions across 4 competency pillars), client-side state management, and automated skill-gap analysis. Subsequent phases expand to Vue/Angular support, integrate live code execution sandboxes, and implement AI-driven candidate evaluation.

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
| **Average Test Duration**        | 8–10 minutes                                  | Timestamp tracking from session start to completion (8 questions)                       |
| **User Assessment Satisfaction** | > 4.2 / 5.0                                   | Post-assessment 1-question survey: "How helpful was this assessment?"                   |
| **Skill Gap Precision**          | > 80% agreement                               | Candidate follow-up survey: "Did the identified skill gaps match your self-assessment?" |
| **Question Bank Utilization**    | > 70% of active questions used within 30 days | Track question selection frequency to ensure question diversity                         |

---

## 4. Feature Specifications & Requirements

### 4.1 Candidate Intake & Setup

- **Framework Selection:** Candidate chooses target framework. **MVP supports React only**; **Vue** and **Angular** are shown as "coming soon" and enabled in a later phase.
- **Target Level Selection:** Candidate selects self-assessed experience tier: **Junior**, **Mid**, or **Senior**.
- **Session Initialization:** System creates a unique assessment session ID and initializes state tracking.

### 4.2 Stratified Random Sampling Engine

Rather than pulling purely random questions, the engine selects 8 questions from the backlog balanced across the **4 Competency Pillars**:

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
- **Progress & Timer:** Real-time progress bar indicating question count (N / Total) and time elapsed per question.

### 4.4 Rule-Based Scoring Engine & Report Generator

Scoring runs **server-side** (the answer key is never shipped to the client). Each answer is graded when submitted (`session_answers.is_correct`); on completion the engine aggregates weighted category percentages:

```
Category Score (%) = ( Σ(Correct Answers × Difficulty Weight) / Σ(Total Questions × Difficulty Weight) ) × 100
```

**Score granularity (decision #3):** each pillar draws one _core_ question (weight 1.0) and one _advanced_ question (weight 2.0), so a pillar resolves to **0 / 33 / 67 / 100** instead of the coarse 0 / 50 / 100 of two equal questions. This gives the "Developing" band a real value (67 = advanced correct, core wrong maps to 67; core correct, advanced wrong maps to 33). Sampling enforces this weight spread while randomizing within each weight tier (see `apps/web/src/domain/sampling.ts`).

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

## 5. Technical Architecture & Data Schema

### 5.1 Tech Stack

- **Monorepo Architecture:** Turborepo / pnpm workspace (`apps/web`, `packages/ui`).
- **Framework:** TanStack Start (`@tanstack/react-router`) — a single full-stack React app (SSR + server functions). API routes (§7) are server functions within this app, not a separate service (decision #2).
- **Styling:** Tailwind CSS v4 + `shadcn/ui` using OKLCH CSS variables.
- **Database & ORM:** **PostgreSQL + Drizzle ORM in every environment** (dev, CI, prod) — no SQLite/Postgres split (decision #1). Migrations via Drizzle Kit.
- **State Management:** **XState** state machine for the assessment flow (see `apps/web/src/machines/assessmentMachine.ts`); TanStack Router loaders for data. The machine owns the full question set client-side, per decision #5.
- **Validation:** Zod schemas at the server-function boundary (maps to §7.2 error codes).
- **Authentication:** Anonymous assessments (MVP) with optional user accounts in Phase 2. Anonymous access is keyed on an opaque `session_token`; a hashed `client_id` cookie is used only for rate limiting (no IP or device fingerprint stored).

### 5.2 Core Data Schema

PostgreSQL DDL below reflects the implemented Drizzle schema (`apps/web/src/db/schema.ts`). Notable decisions: options are stored as a JSON array (not `option_a..d`), per-pillar results are **normalized** into `session_category_scores` (decision #4), each question carries a `source` for content provenance/licensing (§10.1), and no raw device fingerprint is stored (only a hashed `client_id` for rate limiting and the behavioral `focus_loss_count`).

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
    session_token VARCHAR(64) UNIQUE NOT NULL,   -- anonymous access + deletion handle
    client_id VARCHAR(64) NOT NULL,              -- hashed anon cookie; rate limiting only (not PII)
    framework framework NOT NULL,
    target_level difficulty NOT NULL,
    status session_status NOT NULL DEFAULT 'in_progress', -- in_progress, completed, abandoned
    selected_question_ids JSONB NOT NULL,        -- 8 chosen ids, in order
    focus_loss_count INT NOT NULL DEFAULT 0,     -- behavioral anti-cheat signal
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- drives 'abandoned' sweep
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_status ON test_sessions(status);
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
    UNIQUE (session_id, question_id)             -- enforces 409 on duplicate submit
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
```

---

## 6. User Stories & Acceptance Criteria

### 6.1 Epic: Candidate Assessment Flow

**US-1: Framework and Level Selection**

- **As a** candidate
- **I want to** select my target framework and experience level
- **So that** I receive appropriately challenging questions

**Acceptance Criteria:**

- Display framework selection (React only for MVP)
- Display experience level options (Junior, Mid, Senior)
- Selection persists throughout the session
- Show estimated test duration (8-10 minutes)

**US-2: Question Presentation**

- **As a** candidate
- **I want to** see questions with code examples and multiple choice options
- **So that** I can demonstrate my technical knowledge

**Acceptance Criteria:**

- Display question prompt with syntax-highlighted code blocks
- Show 4 labeled options (A, B, C, D)
- Render markdown code blocks in JetBrains Mono font
- Support RTL/LTR layouts with logical CSS properties
- Show progress indicator (2/8 questions)
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
- Select 8 questions using stratified sampling (2 per pillar)
- Store session in database with timestamp
- Return session ID to client

**US-6: Stratified Question Selection**

- **As a** system
- **I want to** select questions balanced across competency pillars
- **So that** assessments cover all critical areas

**Acceptance Criteria:**

- Filter questions by framework and target level
- Select exactly 2 questions per competency pillar
- Randomize selection within pillar constraints
- Ensure no duplicate questions in single session
- Handle insufficient questions gracefully

---

## 7. API Specifications

### 7.1 REST API Endpoints

#### POST /api/sessions

Initialize a new assessment session.

**Request Body:**

```json
{
  "framework": "react",
  "target_level": "mid"
}
```

**Response:**

````json
{
  "session_id": "uuid",
  "session_token": "random_token",
  "questions": [
    {
      "id": "q_123",
      "category": "reactivity",
      "title": "Understanding useEffect Dependencies",
      "prompt": "What happens when...",
      "code_block": "```javascript\nuseEffect(() => {...}, [dep])\n```",
      "options": ["A", "B", "C", "D"]
    }
  ],
  "total_questions": 8,
  "estimated_duration_minutes": 10
}
````

> All 8 questions are returned up front (decision #5) as **client-safe projections**: no `correct_answer` and no `explanation` — the answer key stays server-side until `/complete`. The `session_token` is the caller's handle for `/answers`, `/complete`, and data-deletion requests.

#### POST /api/sessions/:id/answers

Submit an answer for a specific question. The full question set is already held
by the client (returned from `POST /api/sessions`), so this endpoint only
persists the answer and reports whether the session is now complete
(decision #5 — no `next_question` round-trip).

**Request Body:**

```json
{
  "session_token": "random_token",
  "question_id": "q_123",
  "selected_answer": 1,
  "time_spent_seconds": 45
}
```

**Response:**

```json
{
  "success": true,
  "session_complete": false
}
```

#### POST /api/sessions/:id/complete

Finalize the assessment and generate results.

**Response:**

```json
{
  "session_id": "uuid",
  "total_score": 75,
  "max_score": 100,
  "proficiency_level": "developing",
  "category_scores": {
    "reactivity": 100,
    "lifecycle": 67,
    "performance": 33,
    "async": 100
  },
  "skill_gaps": ["performance"],
  "question_results": [
    {
      "question_id": "q_123",
      "is_correct": true,
      "explanation": "Correct answer explanation"
    }
  ],
  "remediation": {
    "performance": "Focus on memoization and virtual DOM optimization"
  }
}
```

> Note: With one core (weight 1.0) and one advanced (weight 2.0) question per pillar, each `category_scores` value resolves to 0 / 33 / 67 / 100 (decision #3). `performance: 33` (core correct, advanced wrong) falls below the 50% threshold and is flagged as a skill gap; `lifecycle: 67` sits in the Developing band. `total_score` is the weighted overall percentage: correct weight 9.0 of 12.0 total weight = 75. `max_score` is fixed at 100. `skill_gaps` lists only categories below 50%. Full per-pillar rows are persisted in `session_category_scores`.

### 7.2 Error Handling Strategy

- **400 Bad Request**: Invalid input data, malformed JSON
- **404 Not Found**: Session or question not found
- **409 Conflict**: Duplicate answer submission for same question
- **429 Too Many Requests**: Rate limiting (max 5 sessions per hour per IP)
- **500 Internal Server Error**: Generic server errors with generic message
- All errors include structured response: `{"error": "code", "message": "description"}`

---

## 8. Deployment & Monitoring Strategy

### 8.1 Deployment Architecture

**MVP Deployment:**

- **Hosting**: A **single full-stack TanStack Start app** (decision #2) deployed to one Node host (e.g. Railway, Fly.io, or a Vercel Node deployment). The UI and the `/api/*` server functions ship together — there is no separately hosted API service.
- **Database**: **PostgreSQL in every environment** (decision #1) — local via Docker, managed Postgres in production (e.g. Railway/Neon/Supabase). Drizzle Kit runs migrations on deploy.
- **CDN**: Edge/CDN caching for static assets and the client bundle.
- **Scheduled Jobs**: A periodic task invokes `markAbandonedSessions()` to transition idle `in_progress` sessions to `abandoned`.
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

- Initial target: 50 questions per difficulty level (150 total), with a **minimum of ~12 per (level × pillar) bucket** so stratified sampling always has a healthy pool to randomize over (anti-leakage). Each bucket needs both core (weight 1.0) and advanced (weight 2.0) items for the score-granularity model.
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
- Clear data retention policy (90 days for anonymous sessions)
- Optional data deletion request handling
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

- **Free tier (MVP):** Anonymous assessments with full skill-radar reports and remediation suggestions.
- Additional paid tiers (e.g., unlimited assessments, team dashboards, API access) will be introduced once Phase 2+ features land. Tier definitions are intentionally deferred until that scope is implemented.

---

## 11. Risks & Mitigation Strategies

| Risk                                 | Impact | Likelihood | Mitigation Strategy                                                                                                                                                                                        |
| ------------------------------------ | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question Bank Leakage / Cheating** | High   | Medium     | Use randomized sampling across per-bucket pools (min ~12 per level × pillar); hashed `client_id` rate limiting (not IP, avoids shared-NAT lockout); focus-loss detection and per-question timing analysis. |
| **Subjective Question Quality**      | Medium | Medium     | Validate explanations against official framework documentation (React.dev); implement statistical analysis of pass rates; expert review panel for technical accuracy.                                      |
| **Low Engagement on Long Tests**     | Medium | Low        | Limit MVP test sessions to 8 high-signal questions (<10 minutes); provide engaging results visualization; offer practice mode for low-stakes exploration.                                                  |
| **Technical Debt from MVP Scope**    | High   | Medium     | Design architecture with clear upgrade paths; document technical decisions; plan for framework expansion from initial React-only approach.                                                                 |
| **Insufficient Question Diversity**  | Medium | High       | Implement aggressive initial content creation (150+ questions); establish contributor model; A/B test question effectiveness continuously.                                                                 |
| **Performance Degradation at Scale** | Medium | Low        | Design database with proper indexing; implement caching for static question content; monitor API response times; plan database scaling strategy.                                                           |

---

## 12. Architectural Decisions (Resolved)

The items below were open in v1.1.0 and are now decided and implemented in `apps/web` (domain, DB schema, server services, and the XState machine).

1. **Database engine — RESOLVED: PostgreSQL everywhere.** SQLite is dropped entirely; local, CI, and prod all run PostgreSQL via Drizzle ORM + Drizzle Kit migrations (`apps/web/src/db/schema.ts`, `drizzle.config.ts`).
2. **Deployment topology — RESOLVED: single full-stack app.** The UI and `/api/*` server functions ship together as one TanStack Start deployment (see §8.1). No separately hosted API.
3. **Score granularity — RESOLVED: weighted core/advanced pairs.** Each pillar draws one core (1.0) and one advanced (2.0) question, giving 0/33/67/100 resolution. Implemented in `domain/constants.ts`, `domain/sampling.ts`, and `domain/scoring.ts` (see §4.4).
4. **Results storage — RESOLVED: normalized.** Per-pillar scores live in `session_category_scores` (one row per pillar per session); no hardcoded pillar columns (see §5.2). Generalizes to future frameworks/pillars.
5. **Question delivery — RESOLVED: all up front.** `POST /api/sessions` returns all 8 client-safe questions; `POST /api/sessions/:id/answers` only persists and returns `{ success, session_complete }`. `next_question` removed (see §7.1).

**Related considerations — addressed:**

- **Level context:** `session_results.target_level` is stored so a tier is read relative to the tested level. Cross-level normalization for recruiter comparison is deferred to the recruiter-facing phase.
- **Rate limiting:** now keyed on a hashed anonymous `client_id` cookie (not IP), avoiding shared-NAT lockouts (`MAX_SESSIONS_PER_HOUR`, `db/queries.ts`).
- **Privacy:** raw device fingerprint (`browser_info`) removed; only the behavioral `focus_loss_count` and a non-reversible `client_id` hash are stored. Right-to-erasure is `deleteSessionByToken()` (cascades to answers/results).
- **Pool sizing:** content target set to a minimum per (level × pillar) bucket — see §10.1. Sampling fails closed with an `insufficient_questions` error when a balanced set can't be built. A pillar-tagged 24-question React starter bank ships in `db/seedData.ts`, with per-row `source` provenance for licensing (see §10.1 "Content sourcing & licensing").
- **Abandonment:** `markAbandonedSessions()` transitions idle `in_progress` sessions (default 30 min) so the completion-rate KPI is measurable; runs as a scheduled job (see §8.1).

---

## 13. Implementation Plan (MVP)

The domain core, server API (server functions), candidate UI, and report are built and typecheck/build clean (`apps/web/src/{domain,db,server,machines,components,routes}`). Phases 1–3 are largely delivered; the remaining work (integration tests against a live DB, erasure fn, satisfaction survey, content growth) is called out per phase below. Each phase is independently shippable and testable.

### Phase 0 — Foundations (complete)

**Status:** foundations complete; ready for Phase 1.

- [x] Domain layer: constants, types, seeded sampling, weighted scoring.
- [x] PostgreSQL schema (Drizzle) + normalized results + indexes + question `source` provenance column.
- [x] Server service: create/submit/complete with Zod validation, rate limiting, abandonment sweep, erasure.
- [x] XState assessment machine (configure → create → answer → complete, with retry states).
- [x] Initial Drizzle migration (`drizzle/0000_init.sql`) committed; `docker-compose.yml` for local Postgres 16.
- [x] Seed `skill_categories` (from `SKILL_CATEGORY_META`) and a starter React bank of **24 questions** (3 levels × 4 pillars × core/advanced), pillar-tagged with `source` provenance (`db/seedData.ts`, idempotent `db/seed.ts`, `pnpm db:seed`).
- [x] Unit tests (`node:test` via `tsx`, `pnpm test`): 26 tests covering scoring (every 0/33/67/100 path), proficiency boundaries, sampling (weight-class pairing, shortfalls, seeded determinism), and the PRNG. All passing.
- **Exit criteria:** unit tests for `scoring` and `sampling` pass (26/26 green); seed content validated (24 items, full level×pillar core/advanced coverage). Remaining before Phase 1 sign-off: run `db:migrate`/`db:seed` once against local Postgres (docker-compose) to confirm a clean apply.

### Phase 1 — API wiring (server functions)

Expose the service through TanStack Start server functions. **Largely complete.**

- [x] `createServerFn` handlers for create/submit/complete (`server/assessmentFns.ts`); `AssessmentError` messages are surfaced to the client as plain, user-facing errors (internals collapsed to a generic message).
- [x] Anonymous client id: minted client-side and stored in `localStorage`, passed into `createSession` and hashed server-side for rate limiting (replaces the cookie plan — no server-side session state, equivalent anti-abuse guarantee).
- [x] Client adapter (`machines/assessmentServices.ts`) implementing the machine's `AssessmentServices` over the server fns.
- [ ] Erasure server fn (`DELETE` by `session_token`).
- **Exit criteria:** client bundle verified free of the answer key (build-time grep, decision #5). Remaining: end-to-end HTTP integration test against a test database (happy path + 409 duplicate + 429 rate limit).

### Phase 2 — Candidate UI (the assessment flow)

Build the screens, driven by `@xstate/react` `useMachine`. **Complete.**

- [x] Intake (`components/assessment/Intake.tsx`): framework (React enabled, Vue/Angular gated "soon") + level → `CONFIGURE`/`START`.
- [x] Question runner: prompt + `font-mono` code block, radio options, progress `N/Total` bar, per-question timer, `SELECT_OPTION`/`SUBMIT_ANSWER`; `FOCUS_LOSS` wired to `visibilitychange` in the orchestrator.
- [x] Loading/error states from `creatingSession`/`*Failed` with `RETRY`/`RESTART` (`AssessmentFlow.tsx`).
- [x] Repeated copy centralized in `components/assessment/copy.ts` (mirrors the server `MESSAGES` seam); RTL-safe logical classes; native radios in `fieldset/legend` for a11y.
- **Exit criteria (pending live-DB run):** a candidate can complete an 8-question React assessment from intake to submission; flow builds and typechecks clean.

### Phase 3 — Report & skill radar

Render the completed `AssessmentResult`. **Mostly complete.**

- [x] Overall score + proficiency tier badge; categorical SVG skill radar (`SkillRadar.tsx`, `--chart-*` pillar colors); per-pillar breakdown bars; per-question correct/incorrect with explanations; focus areas (flagged gaps) with pillar remediation copy.
- [ ] Post-assessment 1-question satisfaction survey (feeds the Satisfaction KPI).
- **Exit criteria:** report matches persisted `session_results` + `session_category_scores`; skill gaps render remediation.

### Phase 4 — Content & hardening

Make it production-credible.

- Grow the question bank from the 24-item starter set to the §10.1 targets (min per level×pillar bucket), each tagged core/advanced via `difficulty_weight`; progressively replace `source`-adapted items with `original` ones (§10.1 content-sourcing policy).
- Scheduled `markAbandonedSessions` job; Sentry + funnel logging; rate-limit + erasure verified.
- Analytics events for the KPI table (completion, duration, survey).
- **Exit criteria:** KPIs in §3 are all measurable from real data; launch checklist (legal/accessibility in §10.2) green.

### Cross-cutting: testing

- **Unit (implemented):** scoring (each 0/33/67/100 path), sampling (weight-class pairing incl. unbalanced pools + seeded determinism + shortfall), proficiency boundaries, and PRNG determinism — `node:test`, run with `pnpm test`.
- **Integration:** service functions against an ephemeral Postgres (create/submit/complete, 409, 429, insufficient questions, completion guard).
- **Machine:** XState model-based tests for the flow transitions and retry paths.
