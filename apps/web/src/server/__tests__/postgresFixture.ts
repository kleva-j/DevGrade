import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import type { TestContext } from "node:test";

import * as schema from "@/db/schema";

/** No getDb(), .env loading, DATABASE_URL fallback, or shared schema writes. */
export async function createPostgresFixture(t: TestContext) {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.notEqual(
    connectionString,
    undefined,
    "TEST_DATABASE_URL must be explicit",
  );

  let url: URL;
  try {
    url = new URL(connectionString!);
    assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
    assert.ok(url.hostname && url.username && url.pathname.length > 1);
  } catch {
    // URL's native error includes its input, which can contain a password.
    throw new Error(
      "TEST_DATABASE_URL must be a PostgreSQL URL with host, user, and database",
    );
  }

  const suffix = randomUUID().replaceAll("-", "");
  const dataSchema = `assessment_test_${suffix}`;
  const journalSchema = `assessment_migrations_${suffix}`;

  // postgres.js URL parameters override connection options. Pin these in the
  // URL as well, and disallow startup 'options' from changing the search path.
  url.searchParams.delete("options");
  for (const [key, value] of Object.entries({
    search_path: dataSchema,
    statement_timeout: "5000",
    lock_timeout: "2000",
    idle_in_transaction_session_timeout: "10000",
    application_name: "devgrade-assessment-tests",
  })) {
    url.searchParams.set(key, value);
  }

  const client = postgres(url.toString(), {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 5,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  const ownedSchemas: string[] = [];
  let migrationsFolder: string | undefined;

  t.after(async () => {
    const failedDrops: string[] = [];
    try {
      for (const name of [...ownedSchemas].reverse()) {
        try {
          await client`DROP SCHEMA ${client(name)} CASCADE`;
        } catch {
          failedDrops.push(name);
        }
      }
    } finally {
      try {
        await client.end({ timeout: 5 });
      } finally {
        if (migrationsFolder) {
          await rm(migrationsFolder, { recursive: true, force: true });
        }
      }
    }
    assert.deepEqual(
      failedDrops,
      [],
      "Could not drop these test-owned schemas",
    );
  });

  let phase = "creating isolated schemas";
  try {
    // No IF NOT EXISTS: only a successful CREATE grants cleanup ownership.
    await client`CREATE SCHEMA ${client(dataSchema)}`;
    ownedSchemas.push(dataSchema);
    await client`CREATE SCHEMA ${client(journalSchema)}`;
    ownedSchemas.push(journalSchema);

    const [scope] = await client<
      { name: string }[]
    >`SELECT current_schema() AS name`;
    assert.equal(scope?.name, dataSchema);

    phase = "copying and retargeting migrations";
    migrationsFolder = await mkdtemp(
      join(tmpdir(), "devgrade-assessment-migrations-"),
    );
    await cp(
      fileURLToPath(new URL("../../../drizzle/", import.meta.url)),
      migrationsFolder,
      {
        recursive: true,
      },
    );
    for (const file of await readdir(migrationsFolder)) {
      if (!file.endsWith(".sql")) continue;
      const path = join(migrationsFolder, file);
      const original = await readFile(path, "utf8");
      // Existing migrations qualify enum creation and foreign keys with public.
      // Retarget only the temporary copy; search_path scopes unqualified DDL.
      const isolated = original.replaceAll('"public".', `"${dataSchema}".`);
      assert.doesNotMatch(isolated, /\bpublic\s*\./i);
      assert.doesNotMatch(
        isolated,
        /\b(?:SET|RESET)\s+(?:LOCAL\s+)?search_path\b/i,
      );
      await writeFile(path, isolated);
    }

    phase = "applying migrations";
    await migrate(db, { migrationsFolder, migrationsSchema: journalSchema });
  } catch (error) {
    // Do not print connection strings, authentication messages, or nested causes.
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]+$/.test(error.code)
        ? ` (${error.code})`
        : "";
    throw new Error(`PostgreSQL test setup failed while ${phase}${code}`);
  }

  return { db, dataSchema, journalSchema };
}
