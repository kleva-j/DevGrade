# Session lifecycle simplification

**Status — 2026-09-27: user-approved Phases A/B/C implemented; stack PRs published as drafts, review-fix updates pending push to those existing PRs.** Maintenance remains off; no production activation. The [current-behavior reference](sessions-and-evaluation.md) supersedes the former file-by-file implementation plan; [delivery and rollout](session-lifecycle-plan.md) owns PR status and the deployment runbook.

## Implemented findings

### A — usable success responses

- `CreatedSession` is a **flat `SessionCredential & AssessmentView`**, not a nested view or creation-only payload.
- Answer success returns **all ordered `acceptedAnswers` plus progress**, replacing the local accepted set instead of appending/incrementing an index.
- Completion returns the **persisted `ReportView` or `LegacySummaryView` directly**, including separate survey state on replay, without rescoring.
- No automatic `getSession` after successful create, answer, complete, or resume. Explicit opens/refreshes, conflicts/expiry, and ambiguous completion recovery still read; ambiguous answer retries retain the exact pending payload/duration.

### B — intent in states, credentials in recovery

- `history`, `creation`, `viewing`, and `attempting` replace the redundant `active`, `gateRequested`, `createOnCheck`, and `keepQuestion` flags. View application preserves same-question selection/timing.
- Recovery remains the sole credential owner; the flow renders state and sends events. No generic operation dispatcher or extra controller layer.
- Cancel prevents queued/discovering creation from later sending a request. Already-sent creation cannot be undone; late success still saves credentials. Delete cancel/changed-state clears automatic creation intent without losing a newly completed report.
- **Historical initial-pass sizes:** machine **717 → 613 lines**; flow **494 → 481**. Not current file counts or targets.

### C — fixed-purpose maintenance

- `runSessionMaintenance(db)` has no options: two fixed bounded operations plus a protected handler/thin route.
- Config module/public options/Zod tuning schemas and oldest-row/lag reporting removed. Keep scalar counts, caps/failures, and bounded `EXISTS` backlog: true/false/**unknown**.
- Parent-first `SKIP LOCKED`, independent commits, fixed DB cutoffs, cooperative budget/timeouts, lazy DB access, strong-secret GET/no-store, and default-off activation remain. Exact constants and wire behavior are [documented once](sessions-and-evaluation.md#5-maintenance-implementation).
- **Historical initial-pass sizes:** maintenance **437 lines/three modules → 336/two**, about **23% smaller**. Not current counts or quotas; routing remains thin.

## Acceptance and remaining work

**Simple and efficient means fewer concepts and round trips, not line quotas.** Keep tests for behavior and safety; do not delete coverage to shrink files or hide complexity in more modules. No new dependency, schema migration, scoring change, or redesign was needed.

The [verification record](sessions-and-evaluation.md#6-verification-and-source-map) separates current focused review-fix checks and clean-worktree typecheck/scoped lint from historical PostgreSQL/browser runs, including user-confirmed maintenance verification. Earlier user-chart diagnostics and launcher limitations are historical, not new failures or proof of final maintenance/build sign-off.

Push review-fix updates to the existing draft stack after review; do not create replacement PRs or claim review threads resolved before publication. Scheduler root/configuration, secrets, deployment, and destructive activation still require the [authorized runbook](session-lifecycle-plan.md#deployment-runbook). Source completion is not a merge, schedule, or production-deployment claim.
