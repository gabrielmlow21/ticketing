import postgres from "postgres";
import { afterAll, expect, test } from "vitest";

const x: number = "oops";

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgres://user:password@localhost:5432/ticketing_test",
);

afterAll(() => sql.end());

test("connects to postgres", async () => {
  const rows = await sql`select 1 as n`;
  expect(rows[0]?.n).toBe(1);
});
