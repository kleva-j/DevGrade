# AGENTS.md

Guidance for coding agents in the **DevGrade** repo. Read [`prd.md`](./prd.md)
for product intent (and the numbered decisions in §12); read
[`design.md`](./design.md) for UI/visual rules.

## What this is

DevGrade is an **anonymous, adaptive front-end skill-assessment platform** (React
MVP). A candidate answers a stratified, weighted **8-question** multiple-choice
set and gets a **rule-based** skill report across four competency pillars. No
accounts, no PII. Vue/Angular are modeled in the enums but gated off
(`MVP_FRAMEWORKS`) until later.

Monorepo (Turborepo + pnpm):

- `apps/web` — the TanStack Start app; **all product logic** lives here
  (`src/{domain,db,server,machines,routes}`).
- `packages/ui` — shared shadcn/ui component library (`@workspace/ui`).

## Stack

| Area       | Choice                                                               |
| ---------- | -------------------------------------------------------------------- |
| App        | TanStack Start + Router (React 19), single full-stack deploy, Vite 8 |
| Data       | PostgreSQL (**every env**) via Drizzle ORM + `postgres`              |
| State      | XState v5 (`@xstate/react`)                                          |
| Validation | Zod v4                                                               |
| Language   | TypeScript 6 (strict); pnpm `10.33.4`, Node `>=20`                   |

## Commands

Run from the repo root (Turbo fans out per package):

```bash
pnpm dev | build | lint | format | typecheck
```

Scoped to the app:

```bash
pnpm --filter web test        # node:test via tsx (NOT vitest/jest) over src/**/*.test.ts
pnpm --filter web typecheck
pnpm --filter web db:generate # after editing src/db/schema.ts
pnpm --filter web db:migrate
pnpm --filter web db:seed     # idempotent
```

Running queries needs a live PostgreSQL (`DATABASE_URL`); `cd apps/web && docker
compose up -d` provides one. Building without a DB is fine. After a change, run
`pnpm --filter web typecheck`, `pnpm --filter web test`, and `pnpm lint`.

## Invariants (easy to violate, not obvious from the code)

- **Layering is one-directional:** `domain ← db ← server ← routes`.
  `apps/web/src/domain/*` is **pure** (no db/server/framework imports) and is the
  unit-tested rules engine. `server/assessmentService.ts` takes an injected `Db`
  and throws `AssessmentError`.
- **Never send the answer key to the client.** `Question` (with `correctAnswer` /
  `explanation`) is server-only; the wire type is `PublicQuestion` via
  `toPublicQuestion`. Correctness is always computed server-side.
- **Domain strings have one source of truth:**
  `apps/web/src/domain/constants.ts` (DB `pgEnum`s and Zod validators are derived
  from it). Don't inline domain string literals; user-facing copy lives in
  `server/messages.ts`, error codes in `server/errors.ts`.
- **PostgreSQL everywhere.** Edit `src/db/schema.ts` → `db:generate` → review and
  commit the SQL in `drizzle/` → `db:migrate`. Don't hand-edit `drizzle/meta`.
- **`db/queries.ts`:** store only the hashed `client_id`; map only Postgres
  `23505` to a conflict (never a blanket catch).
- **"decision #N" comments** map to `prd.md` §12 — keep those invariants.

## Don'ts

- Don't edit `apps/web/src/routeTree.gen.ts` (generated).
- Don't hand-format or fight import order — `pnpm format` (Prettier) and
  `pnpm lint` (ESLint) own style.
- Don't create branches, push, or open PRs unless asked. Use Conventional
  Commits; keep `prd.md` in sync when behavior/schema/phase changes.

## Task-specific references (read only when relevant)

- Question-bank content + licensing: `apps/web/src/db/seedData.ts` + `NOTICE`
  (policy in `prd.md` §10.1).
- Phased roadmap / status: `prd.md` §13 (Phase 0 complete; Phase 1 = API wiring).
