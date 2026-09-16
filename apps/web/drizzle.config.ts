import { defineConfig } from "drizzle-kit"

/**
 * Drizzle Kit config for migrations. PostgreSQL in all environments (#1).
 * Run: `pnpm drizzle-kit generate` then `pnpm drizzle-kit migrate`.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
})
