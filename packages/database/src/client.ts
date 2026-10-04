import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export function createDatabaseClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error(
      "DATABASE_URL is required to create the server-side database client.",
    );
  }

  const queryClient = postgres(databaseUrl);

  return drizzle(queryClient, { schema });
}
