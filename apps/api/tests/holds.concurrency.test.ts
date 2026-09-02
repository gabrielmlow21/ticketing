import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { holdSeats } from "../src/domain/holds.js";
import { resetSchema, seedEvent, testDb, token } from "./helpers.js";

const sql = testDb();

beforeEach(async () => {
  await resetSchema(sql);
});

afterAll(async () => {
  await sql.end();
});

describe("holdSeats", () => {
  it("holds available seats", async () => {
    const { eventId, seatIds } = await seedEvent(sql, { seats: 4 });

    const res = await holdSeats(sql, {
      eventId,
      seatIds: seatIds.slice(0, 2),
      holdToken: token("alice"),
      ttlSeconds: 600,
    });

    expect(res.kind).toBe("held");
    if (res.kind !== "held") return;
    expect(res.order.status).toBe("draft");
    expect(res.order.subtotalCents).toBe(10_000);
  });

  /**
   * The test this whole project exists for.
   *
   * Two callers race for the same seat with no coordination in application
   * code. Exactly one must win. If this ever goes flaky, the bug is real —
   * do not add a retry to make it green.
   */
  it("resolves a two-way race: exactly one winner", async () => {
    const { eventId, seatIds } = await seedEvent(sql, { seats: 1 });
    const contested = seatIds.slice(0, 1);

    const [a, b] = await Promise.all([
      holdSeats(sql, { eventId, seatIds: contested, holdToken: token("alice"), ttlSeconds: 600 }),
      holdSeats(sql, { eventId, seatIds: contested, holdToken: token("bob"), ttlSeconds: 600 }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["conflict", "held"]);

    const loser = a.kind === "conflict" ? a : b.kind === "conflict" ? b : null;
    expect(loser?.kind === "conflict" && loser.unavailableSeatIds).toEqual(contested);
  });

  it("is all-or-nothing and names only the seats that lost", async () => {
    const { eventId, seatIds } = await seedEvent(sql, { seats: 3 });
    const [s1, s2, s3] = seatIds as [string, string, string];

    await holdSeats(sql, {
      eventId,
      seatIds: [s2] as never,
      holdToken: token("alice"),
      ttlSeconds: 600,
    });

    const res = await holdSeats(sql, {
      eventId,
      seatIds: [s1, s2, s3] as never,
      holdToken: token("bob"),
      ttlSeconds: 600,
    });

    expect(res.kind).toBe("conflict");
    if (res.kind !== "conflict") return;
    expect(res.unavailableSeatIds).toEqual([s2]);

    // s1 and s3 must remain free: the failed attempt left no partial state.
    const locks = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM seat_locks WHERE event_id = ${eventId}
    `;
    expect(locks[0]?.n).toBe(1);
  });

  it("lets a lapsed hold be re-taken immediately", async () => {
    const { eventId, seatIds } = await seedEvent(sql, { seats: 1 });

    await holdSeats(sql, { eventId, seatIds, holdToken: token("alice"), ttlSeconds: 600 });
    // Fast-forward by editing the row rather than sleeping.
    await sql`UPDATE seat_locks SET expires_at = now() - interval '1 second'`;

    const res = await holdSeats(sql, {
      eventId,
      seatIds,
      holdToken: token("bob"),
      ttlSeconds: 600,
    });
    expect(res.kind).toBe("held");
  });

  it("refuses holds on an event that is not on sale", async () => {
    const { eventId, seatIds } = await seedEvent(sql, { seats: 1, status: "draft" });
    const res = await holdSeats(sql, {
      eventId,
      seatIds,
      holdToken: token("alice"),
      ttlSeconds: 600,
    });
    expect(res.kind).toBe("event_not_open");
  });
});
