import { createDb, migrate, type Sql } from "../src/db/index.js";
import type { EventId, HoldToken, SeatId } from "@ticketing/shared";

export function testDb(): Sql {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/ticketing_test";
  return createDb(url);
}

export async function resetSchema(sql: Sql): Promise<void> {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await migrate(sql);
}

export async function seedEvent(
  sql: Sql,
  opts: { seats: number; status?: "draft" | "on_sale" | "closed" },
): Promise<{ eventId: EventId; seatIds: SeatId[] }> {
  const [event] = await sql<{ id: string }[]>`
    INSERT INTO events (name, starts_at, status, currency)
    VALUES ('Test Event', now() + interval '30 days',
            ${opts.status ?? "on_sale"}, 'MYR')
    RETURNING id
  `;
  if (!event) throw new Error("seed: no event");

  const rows = Array.from({ length: opts.seats }, (_, i) => ({
    event_id: event.id,
    section: "A",
    row: "1",
    number: i + 1,
    x: i,
    y: 0,
    price_cents: 5000,
  }));
  const seats = await sql<{ id: string }[]>`
    INSERT INTO seats ${sql(rows, "event_id", "section", "row", "number", "x", "y", "price_cents")}
    RETURNING id
  `;

  return {
    eventId: event.id as EventId,
    seatIds: seats.map((s) => s.id as SeatId),
  };
}

export const token = (s: string): HoldToken =>
  s.padEnd(16, "0").slice(0, 32) as HoldToken;
