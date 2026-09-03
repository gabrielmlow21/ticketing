# Project specification

## One line

An event ticketing platform with seat-level booking, real payment handling, and
an organizer console for managing events and attendees.

## What it actually is

A learning vehicle disguised as a product. Nobody will use it. It is chosen
because the domain generates hard problems for free — concurrency, money,
large data sets, and accessibility constraints that cannot be faked — rather
than because the world needs another ticketing site.

Everything in this spec is subordinate to that. If a feature is realistic but
teaches nothing, it is out of scope. If a feature is unrealistic but forces a
concept, it stays.

### Why seat-level booking specifically

Two people can want the same seat at the same instant. That single fact drags in
almost everything on the learning list at once:

- The conflict is real, reproducible, and cannot be designed away, so optimistic
  updates need genuine rollback rather than a hopeful `.catch()`.
- Order lifecycle has six states with different data in each — a set of booleans
  literally cannot express it.
- Payment webhooks are hostile input you do not control, which is where runtime
  validation stops being ceremony.
- A seat map is a 2D grid, which makes keyboard navigation and focus management
  a design problem instead of an afterthought.
- Attendee lists get large, which forces virtualization, and virtualization
  breaks the accessibility you just built.

A CRUD app can simulate none of this honestly.

---

## Actors

| Actor | Authenticated | Can |
|---|---|---|
| **Buyer** | No (guest checkout) | Browse events, hold seats, pay, receive tickets |
| **Owner** | Yes | Everything for events they own: create, publish, refund, manage staff |
| **Staff** | Yes | View attendees, resend tickets, block seats. No refunds, no staff management |
| **Scanner** | Yes | Check in a ticket by code. Nothing else — not even the attendee list |

The scanner role exists specifically to force real server-side authorization.
It is the role most likely to expose a lazy `if (user.role === 'admin')`.

---

## Core journeys

**Buy a ticket.** Browse events → open one → seat map → select seats (held, with
a visible countdown) → checkout → pay → tickets. Must be completable end to end
with a keyboard alone.

**Lose a race.** Two buyers select the same seat within the same second. One
proceeds. The other sees exactly that seat drop out of their selection, with the
rest of their basket intact and an announcement a screen reader will read.

**Run an event.** Owner creates an event → lays out sections, rows and seats →
publishes → watches sales → refunds an order → exports the attendee list.

**Check in.** Scanner opens the check-in view, enters or scans a code, sees
valid / already-used / not-found. Works on a phone.

---

## Scope

### In

- Events with a seat map: sections, rows, per-seat pricing, blocked seats
- Event timezone as venue-local truth: stored as an IANA zone plus a UTC
  instant, displayed identically to every buyer regardless of their own
  timezone, correct across DST transitions
- Seat holds with TTL, server-driven countdown, precise conflict reporting
- Guest checkout, Stripe test mode, webhooks, refunds
- Email/password auth for organizers, with refresh rotation
- Three roles enforced server-side
- Organizer console: attendee table at 20k+ rows, URL-driven filters, bulk actions
- Check-in view
- Light/dark theming through a semantic token layer

### Out — permanently

- General admission (no seats) — removes the entire concurrency problem
- Real payment credentials. Stripe test mode only, forever
- Real email delivery. Log to console or a local catcher
- Multi-tenancy, billing, subscriptions
- Mobile apps
- Recommendations, search ranking, social features
- Anything requiring a third-party API you cannot get access to

### Deferred — nice, not necessary

- Seat map import/export
- Waitlists
- Discount codes
- Multi-currency display (the data model supports it; the UI need not)

---

## Stack

Fixed. The point of fixing it is to stop relitigating tooling instead of
building.

| Layer | Choice | Why this one |
|---|---|---|
| Monorepo | pnpm workspaces | One Zod schema used by both client and server is the core idea; a monorepo is the cheapest way to get it |
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | The strict flags are the curriculum, not a preference. Turning them off removes the lesson |
| Validation | Zod | Schema and type from one definition |
| API | Fastify | Small, fast, good TS story, no opinions to unlearn |
| Database | Postgres | The concurrency invariant is enforced by a database constraint. This is not swappable |
| DB access | `postgres.js` or Drizzle | Your call. Drizzle if you want typed queries; `postgres.js` if you want to stay close to SQL. Phase 1 involves SQL an ORM would hide, so lean raw |
| Build | Vite | — |
| UI | React 19 | — |
| Routing | TanStack Router | Typed search params make "URL is state" compiler-enforced instead of a convention |
| Server state | TanStack Query | Caching, invalidation, cancellation, optimistic mutations — four of your gaps in one library |
| Tables | TanStack Table | Headless, and it will fight you over who owns pagination state. That fight is the lesson |
| Virtualization | TanStack Virtual | — |
| Styling | Tailwind v4 + shadcn/ui | Market-relevant, and shadcn's copy-into-repo model forces you to build the token discipline yourself |
| Unit/component | Vitest + Testing Library | — |
| Network mocking | MSW | Mocks at the network layer, so your code never knows it is under test |
| E2E | Playwright | Two browser contexts in one test is how you prove the race is handled |
| Payments | Stripe test mode | Real webhook semantics — retries, out-of-order, unknown event types |
| CI | GitHub Actions | — |
| Hosting | Neon (Postgres) + Fly/Railway (API) + Vercel (web), all free tiers | Optional. Phase 6 |

### Deliberately absent

**Next.js.** Server components would blur the client/server boundary that this
project is specifically about making visible. Learn it after, not during.

**Redux/Zustand.** If server state, URL state and client state are separated
properly, there is very little left for a global store to do. Discovering that
is the lesson; reaching for the store first prevents it.

**An ORM's migration tooling, at first.** Write the phase 1 migration by hand.
You need to see the constraint.

---

## Repository layout

```
packages/shared/        Zod schemas, inferred types, shared domain helpers
apps/api/               Fastify, Postgres, domain logic, integration tests
apps/web/               Vite + React, buyer flow and organizer console
docs/                   ROADMAP, DOMAIN, CONVENTIONS, LEARNING-LOG
docs/adr/               Architecture decision records
.github/workflows/      CI
```

`packages/shared` has no dependency on either app. Both apps depend on it. If
you ever find yourself wanting shared → api, the abstraction is in the wrong
place.

---

## Non-functional requirements

These are the acceptance bar, and several are deliberately aggressive so that
you have to actually work for them.

**Correctness**
- Under 10 concurrent requests for one seat, exactly one succeeds. Always.
- The same payment webhook delivered N times yields one confirmed order.
- No partial state survives a failed multi-seat hold.

**Performance**
- Public booking page: under 150 kB gzipped initial JS.
- Seat map with 3,000 seats: interactive in under 2s on a throttled 4× CPU.
- Attendee table at 20k rows: scrolling stays at 60fps.
- Hovering a seat re-renders that seat, not the map. Prove it with a profile.

**Accessibility**
- WCAG 2.1 AA on the buyer flow.
- Full booking journey completable by keyboard alone.
- Seat map navigable as a 2D grid, with roving tabindex.
- Hold expiry announced via live region without stealing focus.
- Virtualized table rows remain keyboard reachable.

**Security**
- Every authorization rule enforced server-side, each with a test.
- Refresh token reuse invalidates the session family.
- No secrets in the client bundle. Enforce it in CI.

**Operational**
- CI on a clean cache under 6 minutes.
- Zero flaky tests. A flaky concurrency test is a real bug, never a retry.

---

## Success criteria

The project is finished when all six phases in `docs/ROADMAP.md` are checked and:

1. You can explain the seat-conflict mechanism, and the alternatives you
   rejected, without opening the code.
2. A reviewer skimming the README learns three real decisions in under two
   minutes.
3. The keyboard-only booking demo and the two-browser race test both run on
   demand.
4. `docs/LEARNING-LOG.md` has an entry per phase, written by you.

Criterion 1 is the actual goal. The rest are evidence for it.

---

## Explicit non-goals

- Being usable by real people
- Feature parity with any real ticketing product
- Finishing quickly
- Avoiding rewrites. Rewriting something because the model turned out wrong is a
  successful outcome, not wasted work
