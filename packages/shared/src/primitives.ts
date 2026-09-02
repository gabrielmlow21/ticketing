import { z } from "zod";

/**
 * Branded primitives.
 *
 * The point is not ceremony: `Cents` and `SeatId` are both numbers/strings at
 * runtime, but the compiler will refuse to let you pass an order total where a
 * seat id belongs. Every id in this codebase is branded for that reason.
 */
const brand = <B extends string>(b: B) => z.string().uuid().brand<B>();

export const EventId = brand("EventId");
export const SeatId = brand("SeatId");
export const OrderId = brand("OrderId");
export const UserId = brand("UserId");
export const TicketId = brand("TicketId");

export type EventId = z.infer<typeof EventId>;
export type SeatId = z.infer<typeof SeatId>;
export type OrderId = z.infer<typeof OrderId>;
export type UserId = z.infer<typeof UserId>;
export type TicketId = z.infer<typeof TicketId>;

/**
 * Money is always integer minor units. Never a float, never a formatted string
 * on the wire. Formatting happens at the very edge of the UI and nowhere else.
 */
export const Cents = z.number().int().nonnegative().brand<"Cents">();
export type Cents = z.infer<typeof Cents>;

export const Currency = z.enum(["MYR", "USD", "SGD"]);
export type Currency = z.infer<typeof Currency>;

/** ISO-8601 instant, always UTC, always a string on the wire. */
export const Instant = z.string().datetime({ offset: true });
export type Instant = z.infer<typeof Instant>;

/** A hold token identifies an anonymous basket. Not a session, not a user. */
export const HoldToken = z.string().min(16).max(64).brand<"HoldToken">();
export type HoldToken = z.infer<typeof HoldToken>;
