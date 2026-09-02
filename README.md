# ticketing

Event ticketing with seat-level booking and an organizer console. Built to go
deep on the parts of frontend work that are hard to practise on CRUD apps:
concurrent state, runtime validation at trust boundaries, and accessibility
under virtualization.

## Status

Phase 1 of 6. The API's seat-hold core and its concurrency tests exist; the web
app does not yet.

## Why seat booking

Two people can want the same seat at the same instant. That single fact forces
optimistic updates with real rollback, a state machine that booleans cannot
express, and a conflict path that has to be designed rather than discovered.
See [ADR 0001](docs/0001-database-arbitrates-seat-conflicts.md).

## Layout

```
packages/shared    Zod schemas → z.infer types. One definition, both sides.
apps/api           Fastify + Postgres. Seat holds, orders, payments.
apps/web           (phase 2) Vite + React + TanStack Router/Query/Table.
```

## Running locally

```bash
pnpm install
docker compose up -d
createdb ticketing_test 2>/dev/null || \
  docker compose exec -T postgres createdb -U postgres ticketing_test
pnpm test
```

Tests need real Postgres — the invariant under test is a database constraint, so
mocking it would verify nothing.

## Conventions

- Schemas are written first; types come from `z.infer`. No hand-written
  interface ever describes something that crosses a process boundary.
- Money is integer minor units end to end. Formatting happens in the UI leaf.
- Expected failures are response variants, not thrown errors. Throwing is
  reserved for bugs and for forcing transaction rollback.
- Ids are branded. Passing an `OrderId` where a `SeatId` belongs is a type error.

## Roadmap

| Phase | Scope |
|-------|-------|
| 1 | Seat holds, order state machine, CI ✅ |
| 2 | Auth + RBAC (owner / staff / scanner), organizer event creation |
| 3 | Web app: seat map, keyboard-navigable selection, hold countdown |
| 4 | Stripe test mode, webhooks, confirmation and refunds |
| 5 | Console: virtualized attendee table, URL-driven filters, bulk actions |
| 6 | Playwright incl. a two-browser race test, a11y pass, perf pass |
