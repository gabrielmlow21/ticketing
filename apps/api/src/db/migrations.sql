-- 0001_init.sql
--
-- The seat_locks table is the heart of this project. Read the index at the
-- bottom before anything else.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  starts_at    timestamptz NOT NULL,
  status       text NOT NULL CHECK (status IN ('draft', 'on_sale', 'closed')),
  currency     text NOT NULL CHECK (currency IN ('MYR', 'USD', 'SGD')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section      text NOT NULL,
  "row"        text NOT NULL,
  number       integer NOT NULL,
  x            integer NOT NULL,
  y            integer NOT NULL,
  price_cents  integer NOT NULL CHECK (price_cents >= 0),
  blocked_reason text,
  UNIQUE (event_id, section, "row", number)
);

CREATE TABLE IF NOT EXISTS orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN
                  ('draft','awaiting_payment','confirmed','expired','failed','refunded')),
  hold_token    text,
  subtotal_cents integer NOT NULL DEFAULT 0,
  payment_intent_id text,
  failure_reason text,
  hold_expires_at timestamptz,
  confirmed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seat_locks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_id     uuid NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('held', 'sold')),
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- A sold lock is permanent; a held lock must expire.
  CONSTRAINT held_locks_expire CHECK (
    (status = 'held' AND expires_at IS NOT NULL) OR
    (status = 'sold' AND expires_at IS NULL)
  )
);

-- ---------------------------------------------------------------------------
-- THE constraint.
--
-- Two concurrent requests for the same seat are resolved here, by Postgres,
-- not by application code. No SELECT-then-INSERT check in TypeScript is safe:
-- between the read and the write another transaction can commit. The unique
-- index makes the losing INSERT fail atomically, and we surface that as a
-- typed `conflict` response.
--
-- The predicate is partial so that released/expired rows (deleted before the
-- insert, see holdSeats) do not permanently poison a seat.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS seat_locks_active_uniq
  ON seat_locks (event_id, seat_id)
  WHERE status IN ('held', 'sold');

CREATE INDEX IF NOT EXISTS seat_locks_expiry ON seat_locks (expires_at)
  WHERE status = 'held';
