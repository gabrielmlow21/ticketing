# Progress

Read `docs/ROADMAP.md` for what each step requires. This file records only where
things currently stand and the local facts that are not derivable from the
roadmap. Update it whenever a step changes state.

## Current step: 1.1 — Branded primitives (Phase 0 complete)

### Done

- 0.1 Toolchain pins (Node, pnpm via corepack).
- 0.2 Workspace and TypeScript base — `pnpm-workspace.yaml` covers `apps/*` and
  `packages/*`; `tsconfig.base.json` has `strict`, `noUncheckedIndexedAccess`
  and `exactOptionalPropertyTypes` on.
- 0.3 Postgres — `docker-compose.yml` at the repo root, container reports
  `(healthy)`, `pg_isready` healthcheck wired.
- `apps/api` scaffolded with `pnpm init`; `vitest`, `typescript` and `tsx`
  installed as dev dependencies, `postgres` as a dependency.
- 0.4 Test database and one green test — `ticketing_test` created;
  `apps/api/tsconfig.json` extends `../../tsconfig.base.json`; `test`
  (`vitest run`) and `typecheck` (`tsc --noEmit`) scripts added, so
  `pnpm -r typecheck` and `pnpm -r test` both resolve; `apps/api/src/db.test.ts`
  connects to real Postgres, asserts `select 1`, and closes the pool in
  `afterAll`. Both commands verified green, and the test verified failing with
  the container stopped.

- 0.5 CI — `.github/workflows/ci.yml` with parallel `typecheck` and `test`
  jobs (no `needs:`, `concurrency` with `cancel-in-progress`, pnpm cache,
  `--frozen-lockfile`, Postgres service container), pushed in f6d8a1a. The
  GitHub Actions results — both jobs green, then a deliberate type error in
  8e89e74 failing `typecheck` while `test` still ran, then reverted in
  6ef1fd4 — were verified by Gabriel by hand; I could not query Actions from
  here. Locally re-run and green: `pnpm -r typecheck` and `pnpm -r test`
  (1 test passed).

Phase 0 is done.

## Local facts

These come from `docker-compose.yml` and are local-only development
credentials.

- Postgres superuser: `user` (not `postgres` — `psql -U postgres` fails with
  `role "postgres" does not exist`).
- Password: `password`. Initial database: `mydb`.
- Host port mapping: `5432:5432`.
- Inspect the database with
  `docker compose exec postgres psql -U user -d mydb`. There is no `psql`
  installed on the host.
- Test database URL default:
  `postgres://user:password@localhost:5432/ticketing_test`.
- `docker-compose.yml` declares no named volume, so `docker compose down`
  deletes the container's writable layer along with every database created by
  hand. On the next `up`, Postgres re-initializes and creates only `mydb` from
  `POSTGRES_DB`.
- Because of that, `PostgresError: database "ticketing_test" does not exist`
  after a `down`/`up` cycle is expected local state, not a code defect. The
  "test fails without the database" check in 0.4 instead expects a connection
  error (`ECONNREFUSED`), which only happens when the container is actually
  stopped — verify with `docker compose ps`.
- `ticketing_test` must therefore be creatable from an empty server, since CI
  starts a fresh container on every run. Postgres has no
  `CREATE DATABASE IF NOT EXISTS` and forbids `CREATE DATABASE` inside a
  transaction, so a setup step has to query `pg_database` first and issue the
  `CREATE DATABASE` outside any transaction.
- `docker compose down` accepts no `-d` flag; only `up` does.
- Stopping the database for the 0.4 "test must fail" check means
  `docker compose stop postgres`, never `down` — `down` deletes the writable
  layer and `ticketing_test` with it.
- `apps/api/tsconfig.json` includes a `test` directory that does not exist yet.
  Harmless today; it is the reason if `tsc` ever reports a missing include path.

## Toolchain notes

- `apps/api` is on TypeScript 7. If a base compiler flag behaves unexpectedly,
  check it against TS 7 rather than assuming TS 5 semantics.
- `verbatimModuleSyntax` is on, so type-only imports must be written as
  `import type`.
