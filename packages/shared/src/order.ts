import { z } from "zod";
import { Cents, Currency, EventId, Instant, OrderId, SeatId, TicketId } from "./primitives.js";

export const PaymentFailure = z.enum([
  "card_declined",
  "insufficient_funds",
  "authentication_required",
  "expired_before_payment",
  "provider_error",
]);
export type PaymentFailure = z.infer<typeof PaymentFailure>;

export const Ticket = z.object({
  id: TicketId,
  seatId: SeatId,
  /** Opaque scan code. Deliberately not derivable from the ticket id. */
  code: z.string().min(16),
  checkedInAt: Instant.nullable(),
});
export type Ticket = z.infer<typeof Ticket>;

/**
 * The order state machine.
 *
 *   draft ──pay──▶ awaiting_payment ──webhook ok──▶ confirmed ──▶ refunded
 *     │                   │
 *     └──ttl──▶ expired   └──webhook fail──▶ failed ──retry──▶ awaiting_payment
 *
 * Every transition worth having is a function
 * `(Order & { status: X }) => Order`. If you need a field that only exists on
 * another branch, the model is wrong — fix the model, do not widen the type.
 */
export const Order = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("draft"),
    id: OrderId,
    eventId: EventId,
    seatIds: z.array(SeatId).min(1).max(10),
    subtotalCents: Cents,
    currency: Currency,
    holdExpiresAt: Instant,
  }),
  z.object({
    status: z.literal("awaiting_payment"),
    id: OrderId,
    eventId: EventId,
    seatIds: z.array(SeatId).min(1),
    subtotalCents: Cents,
    currency: Currency,
    holdExpiresAt: Instant,
    paymentIntentId: z.string().min(1),
  }),
  z.object({
    status: z.literal("confirmed"),
    id: OrderId,
    eventId: EventId,
    subtotalCents: Cents,
    currency: Currency,
    confirmedAt: Instant,
    tickets: z.array(Ticket).min(1),
  }),
  z.object({
    status: z.literal("expired"),
    id: OrderId,
    eventId: EventId,
    expiredAt: Instant,
  }),
  z.object({
    status: z.literal("failed"),
    id: OrderId,
    eventId: EventId,
    seatIds: z.array(SeatId).min(1),
    reason: PaymentFailure,
    /** Whether the hold survived the failure. Drives the whole retry UI. */
    holdExpiresAt: Instant.nullable(),
  }),
  z.object({
    status: z.literal("refunded"),
    id: OrderId,
    eventId: EventId,
    refundedAt: Instant,
    amountCents: Cents,
  }),
]);
export type Order = z.infer<typeof Order>;
export type OrderStatus = Order["status"];

/** Narrowing helper shared by the API and the web app. */
export const isActionable = (
  o: Order,
): o is Extract<Order, { status: "draft" | "awaiting_payment" | "failed" }> =>
  o.status === "draft" || o.status === "awaiting_payment" || o.status === "failed";
