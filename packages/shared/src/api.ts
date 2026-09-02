import { z } from "zod";
import { EventId, HoldToken, OrderId, SeatId } from "./primitives.js";
import { Order } from "./order.js";
import { Seat } from "./seat.js";

/**
 * Request/response contracts. The API validates the request with these; the web
 * app validates the response with the same object. One definition, two sides —
 * that is the reason `packages/shared` exists at all.
 */

export const HoldSeatsRequest = z.object({
  eventId: EventId,
  seatIds: z.array(SeatId).min(1).max(10),
  holdToken: HoldToken,
});
export type HoldSeatsRequest = z.infer<typeof HoldSeatsRequest>;

/**
 * A conflict is a normal outcome, not an exception. Modelling it as a response
 * variant rather than a thrown error is what lets the client roll back an
 * optimistic selection precisely instead of dumping the whole basket.
 */
export const HoldSeatsResponse = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("held"), order: Order }),
  z.object({
    kind: z.literal("conflict"),
    /** Exactly which seats lost the race. The rest are untouched. */
    unavailableSeatIds: z.array(SeatId).min(1),
  }),
  z.object({ kind: z.literal("event_not_open") }),
]);
export type HoldSeatsResponse = z.infer<typeof HoldSeatsResponse>;

export const ReleaseHoldRequest = z.object({
  orderId: OrderId,
  holdToken: HoldToken,
});
export type ReleaseHoldRequest = z.infer<typeof ReleaseHoldRequest>;

export const SeatMapResponse = z.object({
  eventId: EventId,
  /** Server clock. The client must not trust its own for countdowns. */
  serverTime: z.string().datetime({ offset: true }),
  seats: z.array(Seat),
});
export type SeatMapResponse = z.infer<typeof SeatMapResponse>;

export const ApiError = z.object({
  error: z.object({
    code: z.enum(["bad_request", "unauthorized", "forbidden", "not_found", "internal"]),
    message: z.string(),
    /** Field-level detail, populated from Zod issues. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
