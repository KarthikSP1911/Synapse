import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let instance: Database | undefined;

function connect(): Database {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  instance ??= drizzle(neon(databaseUrl), { schema });
  return instance;
}

/**
 * The database client. The connection is opened on first use rather than when this module is
 * imported, so `next build` (which imports every route to collect page data) works without
 * DATABASE_URL. A missing variable still fails with a clear error on the first query at runtime.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const real = connect();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
