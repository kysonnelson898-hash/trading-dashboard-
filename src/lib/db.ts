import { Pool } from "pg";
import type { QueryResult, QueryResultRow } from "pg";

const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Set it to a reachable PostgreSQL database to use database-backed features.",
    );
  }

  if (!globalForPostgres.postgresPool) {
    globalForPostgres.postgresPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "trading-dashboard",
    });
  }

  return globalForPostgres.postgresPool;
}

export const db = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    return getPool().query<T>(text, values as never);
  },
};
