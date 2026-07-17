import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // `session` is express-session's store (connect-pg-simple creates and owns it).
  // It is not in schema.ts and never will be — so without this filter drizzle
  // reads it as an orphan and `npm run db:push` offers to DROP it, which logs
  // out every signed-in user. It also made push unrunnable non-interactively:
  // with one unmanaged table in the DB and a new table in the schema, drizzle
  // asks "is X a rename of session?" and blocks on the prompt. Excluding it
  // makes the documented push workflow both safe and scriptable.
  tablesFilter: ["!session"],
});
