// @ts-check
/**
 * Dev preflight: verify the database is reachable before `vite dev` starts, so a
 * missing `.env` or a stopped Postgres fails fast with an actionable message
 * instead of surfacing as a generic "Something went wrong" at runtime.
 *
 * Run via the `dev` script with Node's env-file loader:
 *   node --env-file-if-exists=.env scripts/preflight-db.mjs
 *
 * Exit codes: 1 = cannot start (no DATABASE_URL / DB unreachable). A reachable
 * but un-seeded database only warns, since the server itself still boots.
 */
import postgres from "postgres";

const DIVIDER = "─".repeat(64);

/** @param {"error" | "warn"} level @param {string} heading @param {string[]} lines */
function banner(level, heading, lines) {
  const log = level === "error" ? console.error : console.warn;
  log("\n" + DIVIDER);
  log("  " + heading);
  log(DIVIDER);
  for (const line of lines) log("  " + line);
  log(DIVIDER + "\n");
}

const SETUP_STEPS = [
  "1. Create the local env file:   cp apps/web/.env.example apps/web/.env",
  "2. Start Postgres:              cd apps/web && docker compose up -d",
  "3. Apply schema:               pnpm --filter web db:migrate",
  "4. Seed the question bank:     pnpm --filter web db:seed",
];

const url = process.env.DATABASE_URL;
if (!url) {
  banner("error", "DevGrade preflight — DATABASE_URL is not set", [
    "The dev server needs a Postgres connection string.",
    "",
    ...SETUP_STEPS,
  ]);
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  connect_timeout: 3,
  idle_timeout: 1,
  onnotice: () => {},
});

try {
  await sql`select 1`;
} catch (err) {
  const detail =
    [
      err instanceof Error && "code" in err ? String(err.code) : "",
      err instanceof Error ? err.message : String(err),
    ]
      .filter(Boolean)
      .join(": ") || "unknown connection error";
  banner("error", "DevGrade preflight — cannot reach Postgres", [
    "DATABASE_URL is set but the database did not respond:",
    `  ${detail}`,
    "",
    "Start (or restart) the local database:",
    "  cd apps/web && docker compose up -d",
  ]);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}

// Reachable — check that migrations + seed have run. Non-fatal: the server boots
// regardless, but the assessment flow needs the question bank to be present.
try {
  const rows = await sql`
    select count(*)::int as count from questions where is_active
  `;
  const count = rows[0]?.count ?? 0;
  if (count === 0) {
    banner("warn", "DevGrade preflight — database has no questions", [
      "Connected, but the question bank is empty. Seed it:",
      "  pnpm --filter web db:seed",
    ]);
  }
} catch {
  banner("warn", "DevGrade preflight — schema not migrated", [
    "Connected, but the `questions` table is missing. Run:",
    "  pnpm --filter web db:migrate && pnpm --filter web db:seed",
  ]);
}

await sql.end({ timeout: 1 }).catch(() => {});
