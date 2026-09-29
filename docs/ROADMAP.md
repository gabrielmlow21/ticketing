# Roadmap

The build order for this project, broken into steps you can tick off. Each step
states four things:

- **Task** — what to build, and in which file
- **Invariant** — the rule the code must satisfy. This is the part worth
  remembering; the code is just how you satisfy it
- **Verify** — how you know it works
- **Watch for** — the mistake this step is designed to make you confront

Phases 1–6 come from `PROJECT.md`. Phase 0 is environment work that must exist
before any of them.

---

## Rules of engagement

**You write all the code.** Every line under `packages/shared/`, `apps/api/`,
`apps/web/`. No exceptions, including the parts that feel like boilerplate — the
strict-mode `tsconfig` and the migration are where two of the lessons live.

**Commit `1a51a09` is a reference, not a source.** It holds a previous, complete
phase 1 that you did not write. Read it only *after* you have finished a step and
your tests pass, as a diff against your own work — never before, and never while
stuck. Reading it first converts the exercise into transcription.

```
git show 1a51a09:apps/api/src/domain/holds.ts    # after, not before
```

That comparison is genuinely useful. Timing is the whole thing.

**A flaky concurrency test is a real bug.** Never add a retry, a `sleep`, or a
`--no-threads` flag to make it green. If it passes 9 times in 10, you have a race
in the code under test, not in the test.

**Success Criterion 1 governs everything.** From `PROJECT.md`: you can explain the
seat-conflict mechanism, and the alternatives you rejected, without opening the
code. If you finish a step and cannot explain *why* it works, the step is not
done — write the explanation into `docs/LEARNING-LOG.md` before moving on.

**Generate the boilerplate, hand-write the decisions.** "You write all the code"
means the decisions, not the skeletons. Real developers do not type a
`package.json` from memory — they run `pnpm init` and edit the result. The split:

| Generate it | Hand-write it |
|---|---|
| `package.json` skeleton — `pnpm init` | Scripts, workspace deps, `"type": "module"` |
| `packageManager` field — `corepack use pnpm@X` | — (the hash is why: typing it by hand loses integrity checking) |
| `tsconfig.json` — `tsc --init` | The strict flags. This is the curriculum |
| Lockfiles | Never edit one by hand |
| `.gitignore` | Project-specific additions |
| App scaffolds — `pnpm create vite` | Everything after the scaffold |
| Migrations in this project | All of it — `PROJECT.md` is explicit that you need to see the constraint |

A generated file you then edit is normal and correct. A hand-typed file a tool
would have produced is wasted effort and usually subtly wrong — missing fields,
wrong format, no integrity hash. Each step below says which mode it is in.

**Concepts come before tasks.** This is a frontend developer's project reaching
into backend and infrastructure territory. Any step involving something new —
containers, connection pools, transactions, isolation levels, webhooks, token
rotation — opens with a **Concepts first** section explaining what the thing is,
why it exists, and what breaks without it, before the task says what to write.

"Write a `docker-compose.yml` with one service and a healthcheck" is not an
instruction if you do not already know what a service or a healthcheck is. A step
that reads like that is a defect in this document, not a gap in you. Say so and
it gets rewritten.

The rule that does *not* bend: explanation is never implementation. Concepts get
explained in full; the code is still yours to write.

---

## Phase 0 — Environment

Nothing else can be verified until this is green. Aim to finish in one sitting.

### 0.1 — Toolchain pins

*Mode: generate, then edit.*

- [ ] **Task.** Generate the root `package.json` and `.nvmrc`, then edit.
  ```bash
  pnpm init                        # generates package.json
  corepack use pnpm@<your-version> # writes packageManager WITH an integrity hash
  node -v | sed 's/v//' > .nvmrc
  ```
  Then edit `package.json` by hand: add `"type": "module"`, confirm
  `"private": true`, add an `engines.node` floor.
- **Invariant.** The versions declared are the versions you actually have. A pin
  that lies is worse than no pin — CI will diverge from your machine and you will
  debug the wrong thing.
- **Verify.** `cat .nvmrc` matches `node -v`. `packageManager` has a `+sha512...`
  suffix — if it does not, you typed it instead of generating it, and you have no
  integrity checking.
- **Watch for.** `pnpm init` will not set `"type": "module"` — that is your edit,
  and it is not cosmetic: it decides whether your relative `import` statements
  need `.js` extensions. They will, including in TypeScript source, which
  surprises everyone the first time. If `corepack use` errors, run
  `corepack enable` first.

### 0.2 — Workspace and TypeScript base

*Mode: `pnpm-workspace.yaml` hand-written (4 lines, no generator). `tsconfig`
generated, then edited.*

- [ ] **Task.** Create `pnpm-workspace.yaml` covering `apps/*` and `packages/*`.
  For the TypeScript base, generate rather than type:
  ```bash
  pnpm dlx typescript tsc --init   # or: npx tsc --init
  ```
  It emits a heavily-commented file with most options off. Rename it to
  `tsconfig.base.json`, strip the commentary you do not need, and turn on the
  flags below deliberately — that editing pass is the point.
- **Invariant.** `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are all on. `PROJECT.md` calls these "the
  curriculum, not a preference" — the first time one of them rejects your code,
  that rejection *is* the lesson. Turning it off deletes the lesson.
- **Verify.** `pnpm install` completes. `pnpm -r typecheck` runs without error
  (it has nothing to check yet; that is fine).
- **Watch for.** You will also want `moduleResolution: "bundler"`,
  `verbatimModuleSyntax` and `isolatedModules`. Look up what each does before
  copying it in — `verbatimModuleSyntax` in particular will start demanding
  `import type` and you should know why.

### 0.3 — Postgres

*Mode: hand-written. There is no generator for compose files.*

#### Concepts first

**What a database server is.** Postgres is a separate program that runs
continuously, holds your data, and listens for connections. Your API is a
*client* that connects to it over the network. This is unlike a file you import
— nothing in your TypeScript "contains" the database. If the server is not
running, your code cannot talk to it, and every test fails.

**Why Docker.** You could install Postgres directly on your Mac, but then its
version, config and data live in your machine's global state and drift from what
CI runs. Docker runs it in a *container* — an isolated, disposable box built from
an *image* (a downloadable template). `postgres:16-alpine` names one: Postgres
version 16, built on Alpine Linux, which is a small base image. Everyone on the
project, and CI, gets a byte-identical server.

**What Docker Compose is.** Running a container by hand means a long
`docker run` command with a dozen flags, retyped every time. Compose lets you
write those settings once in `docker-compose.yml` and run `docker compose up`.
Each program you want to run is called a **service**. This project needs exactly
one service: the database.

**What a port mapping is.** The Postgres server inside the container listens on
port 5432, but the container is isolated — your Mac cannot reach inside it. A
port mapping punches one hole: `"5432:5432"` means "connections to port 5432 on
my Mac get forwarded to port 5432 inside the container." Left side is your
machine, right side is the container. Without it your test suite cannot connect.

**What a healthcheck is, and why this project needs one.** A container reports
"running" the moment its process starts — but Postgres takes a few hundred
milliseconds more to initialize and start accepting connections. That gap is a
trap: your tests connect during it, get refused, and fail. A **healthcheck** is a
command Docker runs repeatedly inside the container to ask "are you actually
ready yet?" Until it passes, the container's status is `starting`, not `healthy`.

Postgres ships a tool for exactly this, `pg_isready`, which exits 0 when the
server is accepting connections. You wire it as the healthcheck command with an
interval (how often to re-check) and a retry count (how many failures before
giving up).

Skipping this produces intermittent test failures that look *exactly* like race
conditions. In a project whose entire subject is race conditions, that is a
uniquely miserable thing to debug. Hence the invariant below.

**How the container gets configured.** The `postgres` image reads environment
variables on first start to decide the superuser name, its password, and the name
of an initial database to create. Those are documented on the image's Docker Hub
page under "Environment Variables" — look them up rather than guessing. Finding
config in an image's documentation is a skill you will reuse constantly.

#### The step

- [ ] **Task.** Write `docker-compose.yml` at the repo root. It needs:
  - a top-level `services:` key
  - one service under it (name it `postgres`)
  - `image:` set to `postgres:16-alpine`
  - `environment:` with the user, password and initial database name
  - `ports:` with the 5432 mapping, written as a quoted string
  - `healthcheck:` running `pg_isready`, with an interval and retries
- **Invariant.** The healthcheck genuinely gates readiness. Nothing should be
  able to observe the container as ready before it accepts connections.
- **Verify.**
  ```bash
  docker compose up -d      # -d = detached; runs in the background
  docker compose ps         # STATUS must say (healthy), not just Up
  docker compose exec postgres psql -U postgres -c "SELECT version()"
  ```
  The third command runs `psql` *inside* the container and prints the server
  version. If it prints, you have a working database.
- **Watch for.**
  - There is no `psql` installed on your Mac. Every database inspection goes
    through `docker compose exec postgres psql -U postgres`. Get comfortable with
    it now — you will use it constantly in 1.4 to test the constraint by hand.
  - Modern compose files do not need a `version:` key at the top. If a tutorial
    shows one, it is outdated and Docker will warn you.
  - Ports must be quoted (`"5432:5432"`). Unquoted, YAML reads `5432:5432` as a
    sexagesimal number. This is a genuine, famous YAML footgun.
  - By default the data disappears when you run `docker compose down`. Decide
    deliberately whether to add a named volume to persist it. For a test-focused
    project, a database that resets is arguably a feature.
  - `docker compose up -d` then `docker compose logs postgres` is how you debug a
    container that will not start. Learn that pair now.

### 0.4 — Test database and one green test

*Mode: scaffold generated, test hand-written.*

- [x] **Task.** Create a `ticketing_test` database. Scaffold `apps/api`:
  ```bash
  mkdir -p apps/api && cd apps/api
  pnpm init
  pnpm add -D vitest typescript tsx
  pnpm add postgres
  ```
  Its `tsconfig.json` should `extend` the base from 0.2 rather than repeat it —
  that inheritance is the reason `tsconfig.base.json` exists.
  Then hand-write exactly one test: connect to Postgres, `SELECT 1`, assert the
  result.
- **Invariant.** The test connects to real Postgres. Not a mock, not an in-memory
  fake, not pg-mem. The invariant this whole project turns on is enforced *by the
  database*, so a substitute database verifies nothing at all. Establish that
  habit here, on a trivial test, before it matters.
- **Verify.** `pnpm test` is green. Then stop the container and confirm the test
  *fails* — a test that passes without a database is testing nothing.
- **Watch for.** Close the connection pool in an `afterAll` hook, or Vitest will
  hang instead of exiting. Read the test database URL from an environment
  variable with a localhost default, so CI can point elsewhere.

### 0.5 — CI

- [x] **Task.** `.github/workflows/ci.yml` with two jobs: `typecheck` (no
  database) and `test` (Postgres service container).
- **Invariant.** The two jobs run in parallel, not in sequence. A type error and
  a failing test are independent facts — you want both reported in one run, not
  one hiding the other. Budget: under 6 minutes on a cold cache.
- **Verify.** Push. Both jobs green. Deliberately break a type, push, confirm
  `typecheck` fails while `test` still runs.
- **Watch for.** Add a `concurrency` block with `cancel-in-progress` — a newer
  push makes the running job pointless. Cache the pnpm store, and use
  `--frozen-lockfile` so CI fails on a stale lockfile instead of silently
  resolving different versions than you have.

**Phase 0 done when:** `pnpm test` green locally, both CI jobs green on a push.

---

## Phase 1 — Seat holds, order state machine

The core of the project. Take your time here; everything downstream assumes it.

### 1.1 — Branded primitives

- [ ] **Task.** `packages/shared/src/primitives.ts`. Zod schemas for every id
  type in the domain, a money type, a currency enum, an ISO-8601 instant, and a
  hold token.
- **Invariant.** Ids are branded. `EventId` and `SeatId` are both UUID strings at
  runtime, but passing one where the other belongs must be a compile error. Money
  is integer minor units end to end — never a float, never a preformatted string
  on the wire. Formatting happens in one UI leaf component and nowhere else.
- **Verify.** Write a `.ts` scratch file that assigns a `SeatId` to an `OrderId`.
  It must not compile. Delete the file after.
- **Watch for.** Look up `z.brand()`. Understand that the brand exists only in
  the type system — at runtime it is a plain string, so branding is not
  validation. Both jobs still need doing.

### 1.2 — Order as a discriminated union

- [ ] **Task.** `packages/shared/src/order.ts`. Model the six order states from
  `PROJECT.md`: draft, awaiting_payment, confirmed, expired, failed, refunded.
- **Invariant.** Each state carries exactly the fields that make sense in that
  state and no others. A `confirmed` order has tickets and a confirmation time
  but no hold expiry. A `draft` order has a hold expiry but no tickets. If you
  need a field from another branch, the model is wrong — fix the model, do not
  widen the type with an optional.
- **Verify.** Write the union, then try to access `.tickets` on an order you have
  only narrowed to `draft`. TypeScript must reject it.
- **Watch for.** This is the step that proves the `PROJECT.md` claim that "a set
  of booleans literally cannot express it". Before writing the union, spend five
  minutes actually trying it with `{ isPaid: boolean; isRefunded: boolean; ... }`
  and find the state that combination lets you represent but that cannot exist.
  Write that finding in the learning log — it is the argument you will want in
  Success Criterion 1.

### 1.3 — Seat state

- [ ] **Task.** `packages/shared/src/seat.ts`. A `SeatState` union (available,
  held, sold, blocked) and a `Seat` schema.
- **Invariant.** A held seat carries an expiry; an available seat cannot. A
  blocked seat carries a reason. The seat also carries grid coordinates — those
  drive rendering *and* keyboard navigation order in phase 3, so they are domain
  data, not presentation data.
- **Verify.** Typecheck passes; the impossible combinations are unrepresentable.
- **Watch for.** "Is this seat mine?" is a property of the *viewer*, not the
  seat. Decide now where that lives and why the server must be the one to
  determine it.

### 1.4 — The migration

- [ ] **Task.** `apps/api/src/db/migrations.sql`, written by hand. Tables for
  events, seats, orders, and seat locks. `PROJECT.md` is explicit that you write
  this yourself rather than generating it — you need to see the constraint.
- **Invariant.** *This is the step the project exists for.* One seat, one active
  lock, enforced by the database, not by application code. The lock table needs a
  unique constraint that applies only to rows that are currently active — so that
  a released or expired lock does not permanently poison a seat.
- **Verify.** Apply it, then in `psql` insert two active locks for the same seat
  by hand. The second insert must fail with SQLSTATE `23505`. Read the error.
- **Watch for.** Work out for yourself, before writing it, why a plain
  `UNIQUE (event_id, seat_id)` is wrong here, and what feature of Postgres lets
  you constrain only a subset of rows. Also decide whether a sold lock should
  carry an expiry, and express that decision as a `CHECK` constraint rather than
  a comment.

### 1.5 — ADR 0001

- [ ] **Task.** `docs/adr/0001-*.md`. Document how seat conflicts are arbitrated
  and — more importantly — the alternatives you rejected.
- **Invariant.** At minimum, consider and reject: check-then-insert in
  application code; serialising through an in-process lock or queue; Postgres
  advisory locks. For each, state precisely what breaks and under what conditions.
- **Verify.** Read it back a week later and see whether it still convinces you.
- **Watch for.** "Check-then-insert is racy" is not an explanation. Name the
  interleaving: which two statements from which two transactions, in what order,
  produce a double-sold seat. That specificity is what Success Criterion 1 asks
  for.

### 1.6 — `holdSeats`

- [ ] **Task.** `apps/api/src/domain/holds.ts`. One function: given an event, a
  set of seat ids, a hold token and a TTL, either place holds on all of them or
  report precisely which ones were unavailable.
- **Invariant.** Three rules, all easy to get wrong:
  1. **Never SELECT to check availability.** Any read you perform is stale by the
     time you write. Let the constraint from 1.4 arbitrate, and handle the
     failure.
  2. **All-or-nothing.** If any seat loses, no lock survives from that attempt.
     No partial baskets.
  3. **Expired holds are cleared in the same transaction as the insert.** A seat
     whose hold lapsed one second ago is buyable *now*, not whenever a background
     sweeper next runs.
- **Verify.** Covered by 1.7. Do not consider this step done until those tests
  pass.
- **Watch for.** A conflict is a normal outcome, not an exception — return it as
  a value the caller must handle, so the client can un-highlight exactly the
  seats that lost and keep the rest of the basket. You may still need to *throw*
  internally to force a transaction rollback; keep that mechanism clearly
  separate from the error path in your own head, and in a comment.

### 1.7 — Concurrency tests

- [ ] **Task.** `apps/api/tests/holds.concurrency.test.ts`. Cover at least:
  - a plain successful hold
  - two callers racing for one seat: exactly one wins, the loser is told which
    seat it lost
  - a partial overlap: three seats requested, one already held — the response
    names only that one, and the database ends up with exactly one lock
  - a lapsed hold being re-taken immediately
  - a hold refused on an event that is not on sale
- **Invariant.** From `PROJECT.md`: under 10 concurrent requests for one seat,
  exactly one succeeds. Always. Zero flaky tests.
- **Verify.** `pnpm test` green. Then run it 20 times in a row and confirm it is
  green 20 times.
- **Watch for.** Do not `sleep` to test expiry — update the row's expiry into the
  past instead. Reset the schema between tests rather than deleting rows, so no
  test can depend on another's leftovers. When you write the 10-way race, think
  about whether your connection pool is large enough to actually run 10
  concurrent transactions, or whether you are accidentally serialising them and
  testing nothing.

### 1.8 — README

- [ ] **Task.** Root `README.md`.
- **Invariant.** `PROJECT.md` Success Criterion 2: a reviewer skimming it learns
  three real decisions in under two minutes. Decisions, not features.
- **Verify.** Hand it to someone. Ask what the three decisions were.

**Phase 1 done when:** the race test passes 20 consecutive runs, and you can
explain the mechanism aloud without opening the code. Write the explanation into
`docs/LEARNING-LOG.md` — that entry is the actual deliverable of this phase.

---

## Phase 2 — Auth and RBAC

### 2.1 — Users, sessions, refresh token families

- [ ] **Task.** Schema and domain logic for email/password auth with refresh
  rotation.
- **Invariant.** Refresh token reuse invalidates the entire session family. If a
  token is presented twice, assume it was stolen and kill every descendant of it.
- **Watch for.** Store password hashes with a slow KDF. Look up why bcrypt or
  argon2 rather than SHA-256, and be able to say it in one sentence.

### 2.2 — The three roles, enforced server-side

- [ ] **Task.** Owner, staff, scanner. Authorization checks in the API.
- **Invariant.** Every authorization rule is enforced server-side and has a test
  proving the *negative* case. A scanner must not be able to reach the attendee
  list, and there must be a test that asserts it gets a 403.
- **Watch for.** `PROJECT.md` says the scanner role exists specifically to expose
  a lazy `if (user.role === 'admin')`. Authorization is per-resource, not
  per-role-name: staff can view attendees *for events they are staff on*, not for
  all events. Test that boundary too.

### 2.3 — Event creation and seat map layout

- [ ] **Task.** Owner-only endpoints: create an event, lay out sections/rows/
  seats, block seats, publish.
- **Invariant.** Publishing is a state transition with preconditions, not a
  boolean flip. An event with no seats cannot go on sale.

### 2.4 — Event timezone

- [ ] **Task.** Add an IANA timezone (e.g. `Australia/Sydney`) to the event
  schema in `packages/shared/src/`, alongside the start/end instants from 1.1.
  Store the instant as UTC, as already required — this step is about what you
  do with it on the way back out.
- **Invariant.** An event's start time is a fact about the venue, not about
  whoever is looking at it. Every buyer sees "8:00 PM" for an 8pm show,
  regardless of what timezone their browser is in. That means the API returns
  the UTC instant *and* the event's IANA zone, and formatting to venue-local
  happens in the same UI leaf component that already owns money formatting
  (1.1) — never a client-side guess from `Intl.DateTimeFormat().resolvedOptions().timeZone`,
  which gives you the *viewer's* zone, the one thing you must not use.
- **Verify.** Write a test that formats the same UTC instant with two different
  browser/system timezones forced (e.g. via `TZ=America/New_York` vs
  `TZ=Asia/Tokyo` in the test runner) and asserts the rendered string is
  identical both times.
- **Watch for.** Two mistakes this is designed to catch:
  1. Storing "8:00 PM local" as a naive timestamp with no zone attached, so it
     silently means different instants depending on who reads it back.
  2. An event scheduled across a DST transition: a hold TTL or countdown must
     still be computed from the UTC instant (real elapsed seconds), not by
     doing arithmetic on the venue-local wall-clock string, which is
     discontinuous twice a year (an hour that repeats, and — on the spring
     transition — an hour that doesn't exist at all). Confirm this by
     scheduling a test event whose sale window crosses a known DST change in
     `America/New_York` and asserting the hold TTL is still exactly the
     configured number of seconds, not off by an hour.

**Phase 2 done when:** every authorization rule has a passing negative test,
and the timezone test in 2.4 is green.

---

## Phase 3 — Web app: seat map

### 3.1 — Vite + React + TanStack Router scaffold

- [ ] **Task.** `apps/web`. Routing with typed search params.
- **Invariant.** URL is state, compiler-enforced. Selected seats and filters live
  in the URL, not in React state.

### 3.2 — Seat map rendering

- [ ] **Task.** Render the seat grid from the API response.
- **Invariant.** Hovering a seat re-renders that seat, not the map. Prove it with
  a React Profiler recording, not by assertion. 3,000 seats interactive in under
  2s on 4× CPU throttling.

### 3.3 — Keyboard navigation

- [ ] **Task.** 2D grid navigation with roving tabindex.
- **Invariant.** The full booking journey is completable by keyboard alone. One
  tab stop for the whole grid; arrow keys move within it.
- **Watch for.** This is why seat coordinates went into the domain model in 1.3.

### 3.4 — Optimistic selection with real rollback

- [ ] **Task.** TanStack Query mutation that selects seats optimistically and
  reconciles against the server's conflict response.
- **Invariant.** On conflict, exactly the seats that lost are un-highlighted. The
  rest of the basket survives. This is the payoff for modelling conflicts as
  values in 1.6.

### 3.5 — Hold countdown

- [ ] **Task.** Server-driven countdown to hold expiry.
- **Invariant.** The countdown is anchored to server time, never the client
  clock. Expiry is announced through a live region without stealing focus.

**Phase 3 done when:** you can book a seat end to end with the keyboard alone,
and the two-tab race visibly drops one seat from the loser's selection.

---

## Phase 4 — Payments

### 4.1 — Stripe test mode checkout

- [ ] **Task.** Payment intent creation, order transitions to
  `awaiting_payment`.
- **Invariant.** Test mode only, forever. No real credentials in this repo, ever.

### 4.2 — Webhooks

- [ ] **Task.** Receive and process Stripe webhooks.
- **Invariant.** The same webhook delivered N times yields one confirmed order.
  Webhooks are hostile input you do not control — validate the signature, then
  validate the shape with Zod before touching anything.
- **Watch for.** Real webhook semantics include retries, out-of-order delivery,
  and event types you have never seen. An unknown type must be a no-op with a
  200, not a crash.

### 4.3 — Confirmation and refunds

- [ ] **Task.** Issue tickets on confirmation. Owner-only refunds.
- **Invariant.** Ticket scan codes are not derivable from ticket ids.

**Phase 4 done when:** replaying the same webhook 5 times produces exactly one
confirmed order and one set of tickets.

---

## Phase 5 — Organizer console

### 5.1 — Attendee table at 20k rows

- [ ] **Task.** TanStack Table + TanStack Virtual.
- **Invariant.** Scrolling stays at 60fps. Virtualized rows remain keyboard
  reachable — virtualization must not break the accessibility from phase 3.
- **Watch for.** `PROJECT.md` warns that TanStack Table will fight you over who
  owns pagination state. That fight is the lesson: server owns the data, URL owns
  the query, the table owns nothing durable.

### 5.2 — URL-driven filters and bulk actions

- [ ] **Task.** Filters in typed search params. Bulk resend, bulk check-in.
- **Invariant.** Copy the URL, paste it in another tab, get the identical view.

### 5.3 — Check-in view

- [ ] **Task.** Scanner-role view. Enter a code, see valid / already-used /
  not-found.
- **Invariant.** Works on a phone. The scanner sees nothing else — not even the
  attendee list.

**Phase 5 done when:** 20k rows scroll at 60fps in a profile recording, and every
row is still tab-reachable.

---

## Phase 6 — Proof

### 6.1 — Playwright, two browser contexts

- [ ] **Task.** An E2E test where two browser contexts race for one seat.
- **Invariant.** One proceeds; the other sees exactly that seat drop out with the
  rest of the basket intact. This is the demo the whole project builds toward.

### 6.2 — Accessibility pass

- [ ] **Task.** WCAG 2.1 AA on the buyer flow.
- **Verify.** Keyboard-only journey recorded. Screen reader announces hold expiry
  without focus theft.

### 6.3 — Performance pass

- [ ] **Task.** Bundle and runtime budgets.
- **Invariant.** Public booking page under 150 kB gzipped initial JS. Enforce it
  in CI so it cannot regress.

### 6.4 — Secret scanning in CI

- [ ] **Task.** Fail the build if anything secret-shaped reaches the client
  bundle.

**Phase 6 done when:** all four `PROJECT.md` success criteria hold, especially
the first one.

---

## Learning log

`docs/LEARNING-LOG.md` gets one entry per phase, written by you. Not a changelog
— a record of what you got wrong first and what changed your mind. Success
Criterion 4 requires it, and phase 1's entry is the one that matters most.
