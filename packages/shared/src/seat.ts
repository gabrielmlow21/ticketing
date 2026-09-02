import { z } from "zod";
import { Cents, Instant, OrderId, SeatId } from "./primitives.js";

/**
 * Seat state as a discriminated union.
 *
 * Note what is impossible to express here: a seat that is both `available` and
 * carries an `expiresAt`, or one that is `sold` without an order behind it.
 * That is the whole argument against
 * `{ isHeld: boolean; isSold: boolean; expiresAt?: string }`.
 */
export const SeatState = z.discriminatedUnion("status", [
  z.object({ status: z.literal("available") }),
  z.object({
    status: z.literal("held"),
    expiresAt: Instant,
    /** True only for the caller that owns the hold. The server decides this. */
    mine: z.boolean(),
  }),
  z.object({ status: z.literal("sold") }),
  z.object({ status: z.literal("blocked"), reason: z.string().max(200) }),
]);
export type SeatState = z.infer<typeof SeatState>;

export const Seat = z.object({
  id: SeatId,
  section: z.string().min(1).max(40),
  row: z.string().min(1).max(8),
  number: z.number().int().positive(),
  /** Grid coordinates: drive rendering AND keyboard navigation order. */
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  priceCents: Cents,
  state: SeatState,
});
export type Seat = z.infer<typeof Seat>;

/** Server-internal row shape. Never serialised to a public client. */
export const SeatLock = z.object({
  seatId: SeatId,
  orderId: OrderId,
  status: z.enum(["held", "sold"]),
  expiresAt: Instant.nullable(),
});
export type SeatLock = z.infer<typeof SeatLock>;
