# ADR 0001 — The database arbitrates seat conflicts

**Status:** accepted

## Context

Two buyers can select the same seat within milliseconds of each other. Something
has to decide who gets it, and the decision has to be correct under real
concurrency, not just under a single-threaded test.

## Options considered

**Check-then-insert in application code.** Read the seat's current state, and if
it is free, insert a lock. This is wrong and the failure is not rare: between the
read and the write, another transaction can commit. Under load it sells the same
seat twice.

**Serialise through an in-process lock or a queue.** Correct on one instance,
incorrect the moment the API is scaled horizontally. It also converts a cheap
operation into a bottleneck.

**Advisory locks.** Correct, but it puts the invariant in code that a future
reader has to find and understand. The invariant becomes a convention.

**A partial unique index.** Correct by construction, enforced regardless of how
many API instances exist or which code path performs the write.

## Decision

`seat_locks` carries a unique index on `(event_id, seat_id)` restricted to rows
whose status is `held` or `sold`. The losing INSERT fails atomically; the API
catches that and returns a typed `conflict` response naming exactly which seats
were lost.

Expired holds are deleted inside the same transaction as the insert, so a lapsed
hold frees its seat immediately rather than at the next sweep.

## Consequences

- The invariant cannot be violated by new code paths, including future admin
  tooling that nobody has written yet.
- Conflicts are values (`{ kind: "conflict", unavailableSeatIds }`), not thrown
  errors. The client rolls back precisely the seats that lost and keeps the rest
  of the basket.
- Tests need real Postgres. A mocked or in-memory database would test nothing,
  since the constraint being verified is the database's.
- The optimistic UI is explicitly a lie. The server is the only source of truth
  about seat state; the client renders a prediction and reconciles.
