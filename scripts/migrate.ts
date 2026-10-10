/**
 * Applies the SQL files in src/db/migrations in order, each as one transaction.
 * The files are idempotent, so running this repeatedly is safe.
 *
 *   npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const sql = neon(url);
const dir = join(process.cwd(), "src", "db", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

async function main() {
  for (const file of files) {
    const statements = readFileSync(join(dir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`Applying ${file} (${statements.length} statements)...`);
    await sql.transaction(statements.map((statement) => sql.query(statement)));
    console.log(`  done`);
  }
}

main().catch((error) => {
  console.error("Migration failed; nothing from the failing file was applied.");
  console.error(error);
  process.exit(1);
});
