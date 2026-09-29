# Dead Code Audit Report

## Summary

**Scope:** the current working tree on `feat/option-ids-stage-1`, based on commit `e64833938e8786778981e3a70d911708abb891ac`. This includes uncommitted Stage 1 implementation and untracked first-party files, rather than only committed code.

The audit inventoried **137 tracked/untracked first-party files**, including **88 source modules** and **24 test files**. It examined imports, symbol references, application entry points, framework registration, package exports, configuration, deployment scripts, tests, and documented compatibility/future requirements.

| Confirmed cleanup category | Count |
| --- | ---: |
| Whole files | 3: one unused configuration and two empty placeholders |
| Functions/methods | 1 |
| Standalone constants | 1, used only by the dead function |
| Type aliases | 2 |
| Unused message/copy properties | 8 |
| Unread private context fields | 1 |
| Redundant direct dependency declarations | 5 |
| Classes | 0 |

**No complete application or UI source module is confirmed safe to delete.** The source/configuration findings account for **37 full lines plus one inline object member**. Removing the five redundant manifest entries increases that to **42 full lines**, excluding subsequent lockfile changes.

Only confirmed candidates appear in the deletion sections. Public APIs, test-used helpers, documented compatibility code, and uncertain or planned functionality are retained. No source, dependencies, database records, or existing configuration were modified during this audit.

Line references describe the audited working tree and will shift after edits.

### Cleanup status

The confirmed cleanup below has now been applied. The findings and original audit verification remain as a historical record; deliberately retained items were not removed. No database schema, product behavior, or Docker-related files were changed by this cleanup.

- Removed all three listed files, the unused query helper/constant, two type aliases, eight copy properties, and the private toggle-group context member. Public orientation support remains intact.
- Removed all five redundant direct dependencies and regenerated `pnpm-lock.yaml` offline. The lockfile diff contains only deletions (203 lines); no dependency versions were upgraded. Synchronizing the existing installation removed 21 packages.
- Formatted only the eight touched source/manifest files and verified them with Prettier.

| Cleanup validation | Result |
| --- | --- |
| `pnpm install --lockfile-only --offline --ignore-scripts` | Passed. |
| `CI=true pnpm install --frozen-lockfile --offline --ignore-scripts` | Passed against the existing installation; this was not a separate clean-directory install. |
| `env -u TEST_DATABASE_URL pnpm --filter web test` | 391 passed, 29 PostgreSQL tests skipped, zero failures. No database integration run was attempted. |
| `pnpm --filter @workspace/ui typecheck` | Passed. |
| `pnpm --filter web typecheck` | The same three pre-existing possibly-undefined errors in `chart.tsx` at lines 154 and 158; no new diagnostics. |
| `pnpm lint` | Passed for both packages. |
| `pnpm build` | Passed, uncached production build. |
| Targeted `prettier --check` | Passed for all eight touched source/manifest files. |

The install reported an existing ESLint peer mismatch (`@eslint/js` expects ESLint 10; the workspace uses ESLint 9) and an ignored `pnpm.onlyBuiltDependencies` setting. These unrelated configuration issues were not changed.

## Files to Delete

| File | Size | Verification and reason |
| --- | ---: | --- |
| `packages/ui/tsconfig.lint.json` | 14 lines | No repository references. ESLint uses `parserOptions.project: true`, which selects the ordinary `tsconfig.json`; UI typechecking also uses that configuration. A virtual-absence check found no reads/existence checks for this file and no changes to ESLint results or the TypeScript source graph. |
| `packages/ui/src/components/.gitkeep` | 0 bytes | Redundant directory placeholder: the directory contains 14 tracked component files. It is not referenced by configuration or scripts. |
| `packages/ui/src/lib/.gitkeep` | 0 bytes | Redundant directory placeholder: tracked `utils.ts` already preserves the directory. It is not referenced by configuration or scripts. |

Keep `packages/ui/src/hooks/.gitkeep`: it is the only tracked file preserving that directory.

## Functions/Methods to Delete

### `apps/web/src/db/queries.ts`

**`isUniqueViolation` — lines 12–19; 8 lines**

- No imports, calls, test references, string-based lookups, or configuration registrations were found.
- It is not a route, callback, framework hook, or public package export.
- Current answer-conflict handling compares existing answers while holding parent-session locks in `assessmentService.ts`; it does not call this predicate.
- The repository's PostgreSQL `23505` handling rule does not require retaining this particular unused helper.

Delete it together with `PG_UNIQUE_VIOLATION` and the associated comment at lines 10–11. The combined unreachable block is **10 lines**, counted once in the impact estimate.

Keep all remaining live query functions.

## Classes to Delete

**None confirmed.**

In particular, retain `RecoveryUnavailableError`: it is instantiated and used in an `instanceof` check. An unused export modifier does not make its underlying declaration dead.

## Variables/Constants to Delete

### Function-only constant

| File | Symbol | Location | Reason |
| --- | --- | --- | --- |
| `apps/web/src/db/queries.ts` | `PG_UNIQUE_VIOLATION` | Line 11; related comment at line 10 | Its only consumer is the unused `isUniqueViolation` function. Delete the constant and function together. |

### Unused type aliases

| File | Declaration | Location | Reason |
| --- | --- | --- | --- |
| `apps/web/src/domain/constants.ts` | `ContentSource` | Line 97 | No semantic or textual consumers. It is not exposed through an external package API. Keep the live `CONTENT_SOURCE` and `CONTENT_SOURCES` values. |
| `apps/web/src/db/schema.ts` | `SessionAnswerRow` | Line 215 | No semantic or textual consumers. Keep the live `sessionAnswers` table and its columns. Removing the alias requires no database migration. |

### Unused server message properties

In `apps/web/src/server/messages.ts`, remove only these properties:

| Property | Lines | Lines removed |
| --- | --- | ---: |
| `MESSAGES.invalidSessionConfiguration` | 9–10 | 2 |
| `MESSAGES.invalidAnswerPayload` | 17 | 1 |
| `MESSAGES.questionNotFound` | 19 | 1 |
| `MESSAGES.invalidCompletionPayload` | 22 | 1 |
| `MESSAGES.invalidSurveyPayload` | 27 | 1 |

Verification found no consumers of either the property names or their message text. The object is not enumerated, spread, serialized wholesale, or accessed through computed keys.

Active request validation uses `MESSAGES.invalidRequest`; question-membership failures use `MESSAGES.questionNotInSession`. Keep those and the other live message properties.

### Unused UI copy properties

In `apps/web/src/components/assessment/copy.ts`, remove only:

| Property | Line | Reason |
| --- | --- | --- |
| `UI.tagline` | 25 | No runtime, test, configuration, or documented planned consumer. |
| `UI.report.restart` | 145 | No consumer. The active report return/restart interaction uses `UI.recovery.history`. |
| `UI.status.restart` | 165 | No consumer in status views, handlers, or tests. |

The copy-object review covered **96 leaf properties**, **11 imports**, and **155 direct property-access chains**. No object escape, aliasing, computed lookup, enumeration, spreading, or whole-object serialization was found that would indirectly consume these properties.

Do not delete the separate recovery disclosures discussed under Verification Notes merely because they currently lack runtime references.

### Unread private context field

In `packages/ui/src/components/toggle-group.tsx`, remove the private context's unused `orientation` member in these three places:

| Location | Removal |
| --- | --- |
| Line 13 | `orientation?: "horizontal" \| "vertical";` from the private context type |
| Line 19 | `orientation: "horizontal",` from the context default |
| Line 50 | Only `orientation` from `value={{ variant, size, spacing, orientation }}` |

`ToggleGroupContext` is private. Its only consumer reads `variant`, `size`, and `spacing`, not `orientation`; no dynamic forwarding was found.

**Keep the public `orientation` prop, its type/default, `data-orientation`, and orientation-dependent classes.** They are live and control layout. This finding concerns unnecessary context propagation, not orientation support.

### Redundant direct dependency declarations

These findings concern **direct manifest declarations**, not deletion of every matching package from the dependency graph.

| Manifest | Line | Direct dependency | Verification |
| --- | --- | --- | --- |
| `apps/web/package.json` | 23 | `@tanstack/react-devtools` | No application integration/import. The installed Vite devtools plugin detects existing React devtools imports; it does not automatically bootstrap this component package. |
| `apps/web/package.json` | 25 | `@tanstack/react-router-devtools` | No imports. Its appearance in Start's `optimizeDeps.exclude` is an exclusion, not a package-loading entry point. |
| `apps/web/package.json` | 27 | `@tanstack/router-plugin` | No direct application import. TanStack Start obtains this plugin through its own ordinary dependency chain: `@tanstack/react-start` → `@tanstack/start-plugin-core` → `@tanstack/router-plugin`. |
| `packages/ui/package.json` | 23 | `zod` | No UI source/configuration imports. Shadcn has its own ordinary Zod dependency; it does not rely on the UI package's direct declaration. Keep the application's live Zod dependency. |
| `packages/ui/package.json` | 26 | `@tailwindcss/vite` | The UI package has no Vite build/configuration or plugin registration requiring it. The web app imports and owns the active Tailwind Vite plugin. Keep that application dependency. |

Installed package implementations, resolution paths, and **685 installed package manifests** were inspected to check implicit plugin usage and peer-dependency requirements. No installed peer required the listed devtools packages, direct router-plugin declaration, or UI Tailwind plugin declaration.

A fresh dependency resolution/install and build after removing these declarations **was not performed**. When applying this cleanup, regenerate the lockfile with pnpm and validate a clean install/build. Do not manually remove transitive packages or assume the router plugin disappears from the installation.

## Verification Notes

### Entry points and reachability

The following were treated as roots, even when ordinary import searches would not identify them:

- **Workspace commands:** pnpm scripts and Turbo tasks for development, build, preview, lint, formatting, typechecking, testing, and database operations.
- **Application bootstrap:** Vite configuration and its devtools, Tailwind, TanStack Start, Nitro, and React plugins; conventional `src/router.tsx`; generated route registration; the root route; assessment UI; maintenance API route.
- **Server execution:** recovery/API adapters, eight POST/no-store server functions, handlers, assessment services, domain rules, and database queries.
- **State machine:** seven XState actors, three named guards, and seven named actions. All had configuration/string-based consumers; their registration names were checked rather than relying only on direct calls.
- **Tests:** all 24 files discovered by `tsx --test "src/**/*.test.ts"`. Test-only use was sufficient to retain code.
- **Database tooling:** `db:seed`, Drizzle configuration and journal, all three migrations, and PostgreSQL fixtures that read/copy migration files.
- **Shared UI:** wildcard package exports, local component composition, global CSS, fonts, tokens, and variants.
- **Deployment:** Docker Compose, Dockerfile, entrypoint, migration/seed commands, and production preview. These files remain connected and are not deletion candidates.
- **External invocation:** maintenance HTTP methods and public assets. Default-disabled scheduling or lazy imports do not make externally callable code dead.

Generated files were inspected for registration/reference relationships, not proposed for manual deletion. Dependency/build/cache output, separate `.kilo/worktrees` checkouts, and `.od-skills` were excluded from first-party dead-code counts. Environment-file contents were not inspected.

### Reference and indirect-use checks

Candidates were checked using semantic references and repository-wide searches for names, partial/string references, associated text, and configuration/documentation mentions. The review also checked callbacks, exported surfaces, object enumeration, computed access, plugin conventions, and framework registrations.

This was static and configuration analysis of runtime mechanisms, **not production runtime tracing**. Uncertain dynamic or external usage was grounds to retain an item.

### Non-destructive deletion verification

An in-memory TypeScript check virtually removed the proposed code from six source files without writing changes:

- The query predicate/constant block.
- Both unused type aliases.
- The five server messages.
- The three UI copy properties.
- The private context member and its propagation.

With `noEmit`, `noUnusedLocals`, and `noUnusedParameters` enabled:

| Configuration | Baseline | After virtual deletions |
| --- | --- | --- |
| `apps/web/tsconfig.json` | 3 existing diagnostics | Identical 3 diagnostics; none added |
| `packages/ui/tsconfig.json` | 0 diagnostics | 0 diagnostics |

The existing application diagnostics were in `packages/ui/src/components/chart.tsx`: two `TS18048` possibly-undefined diagnostics at line 154 and one `TS2532` at line 158. They are unrelated to the deletion candidates; the application typecheck was **not clean**.

Separately, virtually hiding `packages/ui/tsconfig.lint.json` preserved:

- ESLint results across 15 files: zero errors/warnings before and after.
- 16 TypeScript root files and 3,657 source/declaration files.
- Zero UI TypeScript diagnostics.
- Identical result/graph hashes and zero reads/existence checks targeting the redundant configuration.

No application test suite, production build, database integration test, or dependency reinstall was run during this audit. The simulations establish unchanged static results, not a runtime test pass.

### Deliberately retained items

These are **not approved deletion candidates**:

| Item | Reason to retain |
| --- | --- |
| `UI.recovery.privacy`, `UI.recovery.coordination`, `UI.recovery.accessNote` | Currently unread, but reflect documented privacy/recovery policy. Decide whether to surface or retire the disclosures before deleting them. |
| `focusLossCount` | Its current self-incrementing behavior is covered by an explicit PRD decision. |
| `toErrorResponse`, `AssessmentError.status`, `STATUS_BY_CODE` | Documented logical-status contract in the PRD and lifecycle documentation. |
| `PROFICIENCY_THRESHOLDS` | Documented compatibility alias. |
| `pickOne`, scoring aliases, domain `buildReport` | Used in tests. |
| `completeSessionSchema` and validator re-exports | Explicit compatibility commitments for existing consumers. |
| V1/V2 readers, adapters, legacy views, option-ID compatibility | Active compatibility paths or required by the staged option-ID migration and existing sessions. |
| Error-code members, including `LEGACY_SUMMARY_AVAILABLE` | Used through indexed maps and exhaustive enumeration/tests. |
| Vue/Angular enum members and design tokens/variants | Derived metadata, documented future support, or public styling contracts. |
| Shared UI exports with no current application imports | Wildcard package APIs can have consumers beyond current app imports. This includes alert/field/chart/progress helpers and standalone toggle exports. |
| `IntakeProps`, `QuestionRunnerProps`, `ReportProps`, `SurveyPhase`, `SkillRadarProps`, `AssessmentInput`, `RecoveryUnavailableError` | Underlying declarations are used locally. Their export modifiers may be unnecessary, but deleting the declarations would break live code. |
| Public favicon, robots, and manifest assets | Reachable by browsers or external requests without a source import. |
| Mockup HTML/PNG, documentation, and `NOTICE` | Design/reference/licensing artifacts rather than unreachable application code. |
| Root `tsconfig.json`, `.npmrc`, and `@turbo/gen` | Conventional or manual-tool entry points; lack of source imports cannot establish disuse. |
| Docker-related work | Connected deployment configuration and existing user changes. |

Two configuration irregularities were not converted into deletion claims:

- The web manifest references missing `logo192`/`logo512` assets. Missing targets indicate broken references, not proof that the manifest is unused.
- Two CSS `@source` paths point to nonexistent `packages/apps`/`packages/components` locations. Their intended scanning coverage should be checked/corrected, rather than blindly deleting directives.

### Validation when applying the cleanup

Apply source/configuration cleanup separately from dependency cleanup, preserving unrelated working-tree changes. Run:

```sh
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter @workspace/ui typecheck
pnpm lint
pnpm build
```

For manifest cleanup, also regenerate `pnpm-lock.yaml` using pnpm and verify a clean frozen-lockfile installation/build. Account for the pre-existing chart diagnostics; do not report a clean application typecheck unless those diagnostics are independently resolved.

The conclusions are specific to this working tree and inspected configuration. They do not establish absence of unknown external consumers; public or uncertain surfaces were therefore excluded.

## Estimated Impact

| Cleanup | Full lines removed |
| --- | ---: |
| Unused UI lint configuration | 14 |
| Two redundant empty placeholders | 0 |
| Query predicate, its sole constant, and associated comment | 10 |
| Two unused type aliases | 2 |
| Five server message properties | 6 |
| Three UI copy properties | 3 |
| Private toggle-group context field/default | 2 |
| **Source/configuration subtotal** | **37** |
| Five redundant direct dependency declarations | 5 |
| **Total including manifest entries** | **42** |

Additionally, remove one inline `orientation` member from the context-provider value. Lockfile changes are unquantified and must be generated rather than estimated or hand-edited.

The primary benefit is reduced maintenance surface and fewer misleading declarations. No measurable runtime speedup, bundle-size reduction, or installation-size saving is claimed: types, empty files, and unused configuration do not impose application runtime cost, and several packages will remain transitively installed.
