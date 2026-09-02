import type { Sql } from "../db/index.js";
import {
  Cents,
  type EventId,
  type HoldSeatsResponse,
  type HoldToken,
  type OrderId,
  type SeatId,
} from "@ticketing/shared";

export interface HoldSeatsInput {
  eventId: EventId;
  seatIds: SeatId[];
  holdToken: HoldToken;
  ttlSeconds: number;
}

/**
 * Place a hold on a set of seats.
 *
 * Three things make this correct, and all three are easy to get wrong:
 *
 * 1. Expired holds are deleted inside the same transaction as the insert. A
 *    background sweeper alone is not enough — a seat whose hold lapsed one
 *    second ago must be buyable now, not whenever the sweeper next runs.
 *
 * 2. The insert is `ON CONFLICT DO NOTHING` against the partial unique index,
 *    returning the rows that actually landed. We never SELECT first to "check
 *    availability": that check would be stale by the time we INSERT.
 *
 * 3. It is all-or-nothing. If any requested seat loses, we roll back and report
 *    precisely which ones lost, so the client can un-highlight those seats and
 *    keep the rest of the basket.
 */
export async function holdSeats(
  sql: Sql,
  input: HoldSeatsInput,
): Promise<HoldSeatsResponse> {
  const { eventId, seatIds, holdToken, ttlSeconds } = input;

  return sql.begin(async (tx) => {
    const [event] = await tx<{ status: string }[]>`
      SELECT status FROM events WHERE id = ${eventId}
    `;
    if (!event || event.status !== "on_sale") {
      return { kind: "event_not_open" } as const;
    }

    // (1) Reap lapsed holds for exactly these seats, in-transaction.
    await tx`
      DELETE FROM seat_locks
      WHERE event_id = ${eventId}
        AND seat_id = ANY(${seatIds as unknown as string[]})
        AND status = 'held'
        AND expires_at < now()
    `;

    const [priced] = await tx<{ subtotal: number; n: number }[]>`
      SELECT COALESCE(SUM(price_cents), 0)::int AS subtotal, COUNT(*)::int AS n
      FROM seats
      WHERE event_id = ${eventId}
        AND id = ANY(${seatIds as unknown as string[]})
        AND blocked_reason IS NULL
    `;
    if (!priced || priced.n !== seatIds.length) {
      // A requested seat does not exist, or is blocked by the organizer.
      return { kind: "conflict", unavailableSeatIds: seatIds } as const;
    }

    const [order] = await tx<{ id: string; hold_expires_at: Date }[]>`
      INSERT INTO orders (event_id, status, hold_token, subtotal_cents, hold_expires_at)
      VALUES (${eventId}, 'draft', ${holdToken}, ${priced.subtotal},
              now() + make_interval(secs => ${ttlSeconds}))
      RETURNING id, hold_expires_at
    `;
    if (!order) throw new Error("order insert returned no row");

    // (2) Let the index arbitrate. Losers simply do not come back.
    const inserted = await tx<{ seat_id: string }[]>`
      INSERT INTO seat_locks (event_id, seat_id, order_id, status, expires_at)
      SELECT ${eventId}, s, ${order.id}, 'held',
             now() + make_interval(secs => ${ttlSeconds})
      FROM unnest(${seatIds as unknown as string[]}::uuid[]) AS s
      ON CONFLICT (event_id, seat_id) WHERE status IN ('held', 'sold')
      DO NOTHING
      RETURNING seat_id
    `;

    // (3) All-or-nothing.
    if (inserted.length !== seatIds.length) {
      const won = new Set(inserted.map((r) => r.seat_id));
      const lost = seatIds.filter((id) => !won.has(id));
      throw new HoldConflict(lost);
    }

    return {
      kind: "held",
      order: {
        status: "draft",
        id: order.id as OrderId,
        eventId,
        seatIds,
        subtotalCents: priced.subtotal as Cents,
        currency: "MYR",
        holdExpiresAt: order.hold_expires_at.toISOString(),
      },
    } as const;
  }).catch((e: unknown) => {
    if (e instanceof HoldConflict) {
      return { kind: "conflict", unavailableSeatIds: e.seatIds } as const;
    }
    throw e;
  });
}

/**
 * Thrown to force a rollback, caught immediately outside the transaction and
 * converted back into a value. The throw is a transaction-control mechanism,
 * not an error path — the conflict itself is an expected outcome.
 */
class HoldConflict extends Error {
  constructor(readonly seatIds: SeatId[]) {
    super("seat hold conflict");
    this.name = "HoldConflict";
  }
}
