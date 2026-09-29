# Stable option IDs and option shuffling

**Status:** Stage 1 implemented on `feat/option-ids-stage-1`; local tests/lint passed, 21 of 29 named PostgreSQL cases verified, eight still pending. Not deployed. Stage 2 not started.

**Baseline:** `e648339`, 2026-09-28, plus the question-bank rebalance, balance test, and PRD update present when work began. Preserve those changes.

**Delivery:** Two stages, suitable for two PRs. Medium effort and migration risk; no new infrastructure.

## Goal and model

Separate option identity from display position. Shuffle once at assessment creation and retain the saved order for answering, resume, retries, and report review.

Use **stable question-local integer IDs**, rather than string IDs, to preserve the existing integer answer columns:

```ts
interface QuestionOption {
  id: number;
  text: string;
}
```

- `questions.options`: JSONB array of `{ id, text }` objects instead of strings.
- Application names: `correctOptionId` and `selectedOptionId`.
- Keep physical columns `correct_answer` and `selected_answer`; map the clearer application names through Drizzle. No extra answer columns or options table.
- Assign existing options IDs from their original zero-based positions **once**. Persist IDs explicitly in seed content; never regenerate them from a shuffled/reordered array.
- Validate four options for new MVP content, unique nonnegative integer IDs, nonblank text, and membership of the correct/selected ID. Membership is not an array-bounds check.
- IDs are scoped to their question and session snapshot, not globally unique or presentation labels. Test non-contiguous IDs to expose accidental index assumptions.

## Stage 1 — Prepare compatible readers and clients

Keep bank storage and new-session writes in the existing, unshuffled V1 format during this stage.

1. Add the option model, shared validation/constants, and clear answer field names. Update server contracts, the existing XState context/events, and the runner to select by option ID. Reuse the existing shadcn radio group; keep component props interfaces in their component files.
2. Add V2 private-snapshot parsing and normalize V1 snapshots into the same ID-based runtime model. Derive legacy IDs from **the saved V1 options**, never today's bank. Do not rewrite saved JSON or existing answers. Pin V1 schema literals rather than changing a shared version constant that invalidates them.
3. Prepare the bank reader for both string arrays and ID-object arrays. Until Stage 2, the V1 writer must serialize the correct option's saved array index, not its stable ID. Build assessment views from the saved snapshot.
4. Keep one scoring engine and the existing scoring policy/version. Normalize input before grading, membership validation, and duplicate/retry comparison.
5. Handle wire compatibility at the transport boundary using an explicit contract marker on creation and assessment-content reads:
   - New clients receive option objects and submit `selectedOptionId`.
   - Old V1 tabs retain string options and positional answer/accepted-answer payloads on reads, resume, and submission.
   - Reject requests containing both answer fields. Legacy positional submissions are valid only for V1 sessions.
   - Prepare refresh-required handling using existing error states/copy. Preserve credentials; do not loop indefinitely on a known contract mismatch.
6. Keep the **report snapshot at V1**. Project ordered option text explicitly when awarding reports; existing reports need no IDs, conversion, or rescoring.

**Gate:** Deploy these readers and clients everywhere before converting bank rows or enabling V2 writes. Stage 1 becomes the rollback floor; pre-compatibility code cannot safely read the new bank.

## Stage 2 — Convert the bank and enable shuffling

1. Add a reviewed data migration that converts bank string options to explicit ID objects while retaining existing numeric answer values. Check malformed rows first; abort rather than guess. Do not modify sessions, answers, or report snapshots. Changing Drizzle's JSONB TypeScript annotation alone does not migrate data.
2. Convert `seedData.ts` to explicit IDs matching the migration. Verify all 144 question IDs, option texts, correct-answer texts, weights, and provenance are preserved. Re-seeding must preserve option identities.
3. In session creation, create the RNG once, sample questions first, then reuse `shuffle` from `domain/random.ts` on each selected option array. Save the resulting order in a V2 private snapshot; never reshuffle on render, read, resume, or retry.
4. Reject old-client creation **before inserting anything**, and reject incompatible old-client V2 content reads/submissions without mutation. Never return object options to clients expecting strings.
5. Validate submissions and completion against option IDs in the saved snapshot. Keep private keys/explanations off assessment responses. Deep-copy option objects in safe projections so public and private objects do not share mutable references.
6. Update the source-bank balance test to count the correct option's **authored position**, found by ID, rather than counting ID values. Preserve content balance, but do not require exact balance or a different order in every randomized assessment.
7. Update `prd.md` and `docs/sessions-and-evaluation.md` for the option-ID contract and one-time shuffling behavior.

## Main files

Paths below are relative to `apps/web/src/` unless stated otherwise:

- `db/schema.ts`, `db/seed.ts`, `db/seedData.ts`, and `apps/web/drizzle/` — bank format, mappings, migration.
- `domain/types.ts`, `domain/constants.ts`, `domain/sessionContracts.ts`, `domain/sessionSnapshots.ts`, `domain/scoring.ts` — canonical IDs, compatible snapshots, grading.
- `domain/random.ts` — reuse its generic non-mutating shuffle; no new randomization framework.
- `server/assessmentService.ts`, `server/assessmentValidation.ts`, `server/assessmentHandlers.ts`, `server/sessionAccess.ts` — snapshot-based validation and wire compatibility.
- `machines/createSessionAdapter.ts`, `machines/assessmentMachine.ts`, `machines/sessionRecovery.ts`, `components/assessment/QuestionRunner.tsx` — selection and transport. Touch the existing error/copy/flow files only for refresh-required handling.
- Corresponding domain, bank, server-contract/PostgreSQL, machine, and rendering tests; shared `machines/sessionTestFixtures.ts`.

## Verification in both stages

- Frozen V1 fixtures: unchanged order, correct grading, retries, resume, and report retrieval. Preserve historical validation rules rather than applying the new four-option rule retroactively.
- V2: shuffling preserves IDs/text/correct identity, does not mutate the source, and is deterministic for an injected RNG. Use fixed test permutations that actually move the correct option.
- Reject duplicate IDs, missing correct IDs, invalid selected IDs, and out-of-question selections; confirm non-contiguous IDs work.
- Test old/new client contracts, creation/read/resume/submit, duplicate conflicts, and lost-response recovery. Rejected incompatible creation must insert no session.
- Confirm public payloads exclude both legacy and new answer-key fields and explanations. Confirm report text follows saved presentation order.
- Test the migration and re-seeding against **disposable PostgreSQL**. Verify identical correct-answer text and unchanged historical snapshots/answers before and after. Do not run destructive integration tests against Aiven development.
- Run `pnpm --filter web test`, `pnpm --filter web typecheck`, and `pnpm lint` after each stage. Test PostgreSQL paths with `TEST_DATABASE_URL` explicitly targeting the disposable database; zero skipped database tests for that run.
- Previous baseline: 326 tests passed, 26 database tests skipped; lint passed. Typecheck had three unrelated undefined-value errors in `packages/ui/src/components/chart.tsx:154–158`. Report those separately; introduce no new errors.

## Stage 1 verification result

- Initial non-database run, `pnpm --filter web test`: **391 passed, 0 failed, 29 PostgreSQL tests skipped**.
- `pnpm lint`: passed.
- Stage 1-only `pnpm --filter web typecheck`: the three pre-existing chart errors noted above; no new errors. The separately prepared chart fix is outside this stage.
- Independent integration review findings were fixed and rechecked, including memory-only credential protection and retry behavior.
- Subsequent verification against disposable, loopback-only PostgreSQL 18.1: **21 of 29 named database cases passed**, with zero failures or skips in completed runs. These cover question counts, snapshots, all three option-ID compatibility cases, lifecycle behavior, and the first five maintenance cases. Eight maintenance cases remain unverified after interrupted execution; a complete PostgreSQL-enabled suite run has not been verified. Every completed isolated run confirmed database shutdown, and Aiven was not accessed. Database verification remains a deployment gate.
- Remaining cases: statement-timeout rollback; backlog-check timeouts; completion versus retention deletion; missed-cleanup access enforcement; and idle-sweep coordination with resume/answer in both orderings.
- No migration, bank conversion, shuffling, deployment, or push was performed for Stage 1.

## Boundaries and rollout safety

- No new tables, dependencies, XState states, scoring versions, stored shuffle seeds, or configurable shuffling modes.
- Keep 24-hour resumability and seven-day retention unchanged. Never invalidate or rewrite existing sessions to simplify migration.
- Retain the small V1 adapters; removal is optional future work, not a third required stage. Keep the V1 report reader because new reports still use it.
- Stop if option identity cannot be recovered unambiguously, the deployed reader version is uncertain, or migration would require rewriting historical snapshots.
- Do not include unrelated schema hardening, publication controls, chart fixes, or Docker/package changes. Do not create branches, commit, push, or apply the migration to Aiven without the corresponding instruction.
- During implementation, use bounded terminal commands and no Python. Validate before deployment, and do not roll back below the compatibility release after conversion.
