import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Sql = postgres.Sql;

export function createDb(url: string): Sql {
  return postgres(url, { max: 10, onnotice: () => {} });
}

export async function migrate(sql: Sql): Promise<void> {
  const path = fileURLToPath(new URL("./migrations.sql", import.meta.url));
  await sql.unsafe(readFileSync(path, "utf8"));
}

/** Postgres unique-violation SQLSTATE. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === UNIQUE_VIOLATION;
}
