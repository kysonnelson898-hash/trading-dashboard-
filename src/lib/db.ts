import { Pool } from "pg";

const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "trading-dashboard",
  });
}

export const db =
  globalForPostgres.postgresPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.postgresPool = db;
}
