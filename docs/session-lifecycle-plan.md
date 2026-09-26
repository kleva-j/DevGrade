# Session lifecycle delivery and rollout

**Status — 2026-09-26:** Lifecycle Stages 1–4 and user-approved simplification Phases A/B/C are implemented in source. Maintenance is **committed locally as `2aaa73a` and disabled by default**; its PostgreSQL verification is user-confirmed. Stack publishing and authorized rollout remain pending. No production migration, deployment, verified cron configuration root, or actual schedule is established.

[Current behavior and validation](sessions-and-evaluation.md) is the implementation reference; [simplification findings](session-lifecycle-simplification-plan.md) records the smaller design. Product scope, 8/16/32 lengths, scoring, and visual design are unchanged.

## Delivery status

1. **Durable policy/content — implemented:** original-creation deadlines, private question snapshots, normalized results plus immutable reports, and legacy-safe migration `0002`. [PR #1](https://github.com/kleva-j/DevGrade/pull/1).
2. **Server lifecycle — implemented:** strict credentials, fresh-clock parent-first transactions, coherent reads, retry-safe operations, expected-state deletion, and known-credential gating. Phase A returns usable committed views/progress directly. [PR #2](https://github.com/kleva-j/DevGrade/pull/2); reported server commit `bb90bab`.
3. **Browser recovery — source delivered:** fail-closed credential storage/discovery, Web Lock creation coordination, explicit Resume versus viewing, history/report/survey restoration, confirmed Delete/cancel, and bounded timing. Phase B removes redundant state flags and success-path reads. [PR #4](https://github.com/kleva-j/DevGrade/pull/4); recovery rebased on the server update.
4. **Maintenance — committed, not activated:** `2aaa73a` contains the fixed-purpose `runSessionMaintenance(db)`, protected GET handler, generated route registration, and tests. PostgreSQL verification is user-confirmed; the fourth stack PR for maintenance is still pending (**not** recovery PR #4).

PRs #1/#2/#4 are **not merged** in the last verified stack state. The revised server/recovery branches and local maintenance commit still need publishing; no push or PR creation is included in this documentation update. Test/browser counts, user confirmations, and command-specific caveats live only in the [verification record](sessions-and-evaluation.md#6-verification-and-source-map).

## Deployment runbook

Requires an authorized operator; these steps have **not** been performed by this documentation task.

1. **Review and migrate.** Review the verification record and publish the owning layer. Apply `apps/web/drizzle/0002_dazzling_may_parker.sql` before snapshot writers; drain old writers. A/B/C needs no new schema migration. Preserve original `createdAt` and legacy semantics—never backfill historical content from today's bank or reset lifetimes. Verify the target environment/bank; preview tests must not use production credentials/data.
2. **Prepare disabled.** Provision a high-entropy bearer-safe `CRON_SECRET` (32–256 characters) in the intended environment. Leave `SESSION_MAINTENANCE_ENABLED=false` initially; absent/non-`true` values are also disabled. Verify unauthorized requests do no DB work and authorized disabled GET returns `{ ok: true, enabled: false }` with no-store. Review eligible volume, cascade scope, host timeouts, and backup policy before destructive activation.
3. **Verify hosting, then configure.** Confirm the actual hosting/project root **before choosing a cron configuration path**; no `vercel.json` location/existence is assumed. With approval, configure one daily **`0 3 * * *` UTC** authenticated GET to `/api/internal/session-maintenance`, or the equivalent external scheduler on another host. Verify provider limits, timezone, delivery/retry behavior, and registration; an endpoint is not a schedule.
4. **Activate and observe.** With separate approval, set `SESSION_MAINTENANCE_ENABLED=true`. Verify a real authorized invocation with `enabled: true`, scalar counts, duration, caps/failures, and backlog signals—not merely a disabled HTTP 200. Do not put secrets in URLs/logs or detach work after response.
5. **Catch up safely.** Use authorized, bounded reruns after missed/capped/failed runs. Finish only when **both backlogs are `false`, caps are null, and clock/operation/observation failures are clear**. A short `SKIP LOCKED` batch is not empty backlog; `null` means **unknown—investigate**, never “drained.” Earlier batch commits survive later failure. Escalate persistent locks/backlog rather than loop indefinitely. Setting the flag false stops future jobs, not already-started work or prior deletions.
6. **Keep retention honest.** Normal access ends at seven days regardless of scheduler health. Daily cleanup usually means deletion at age 7–8 days, possibly later with backlog/failure. Live-row deletion does not erase WAL/PITR, replicas, backups, or viewed copies. Document those policies separately; enforce expiry and purge expired rows before reopening a restored database.

The [maintenance reference](sessions-and-evaluation.md#5-maintenance-implementation) defines fixed limits, authentication, response semantics, and retry behavior. Tests cover exact cutoffs/cascades, younger-row preservation, concurrent mutation/cleanup, overlap/skipped rows, partial failure/catch-up, and handler security. Source verification does not replace the authorized deployment and scheduler checks above.

## Deferred

Accounts/email or cross-device recovery, shareable reports, global attempt ownership, lost-creation-response idempotency, heartbeats, general content versioning, and new telemetry dashboards remain out of scope. The client-ID hash cannot recover credentials that an older browser never saved. Maintenance is implemented; **publishing and operational readiness remain pending**, not waived.
