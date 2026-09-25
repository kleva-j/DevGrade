import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Lazily-initialized Drizzle client (PostgreSQL everywhere — decision #1).
 *
 * The connection is created on first use rather than at module load so that
 * building/prerendering without a `DATABASE_URL` doesn't crash. Set
 * `DATABASE_URL` in the environment (see `.env.example`).
 */

let dbSingleton: ReturnType<typeof createDb> | null = null;

function createDb(connectionString: string) {
  // `prepare: false` keeps this compatible with transaction-pooling proxies
  // (e.g. PgBouncer / Supabase pooler) used by serverless deployments.
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export function getDb() {
  if (dbSingleton) return dbSingleton;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/web/.env.example to .env and configure it.",
    );
  }
  dbSingleton = createDb(connectionString);
  return dbSingleton;
}

export type Db = ReturnType<typeof getDb>;
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type QueryDb = Db | Transaction;
