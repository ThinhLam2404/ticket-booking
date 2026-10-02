# Ticket Booking repository instructions

## Repository shape

- This is an npm monorepo: `be/` is a NestJS 12 modular monolith; `fe/` is a React 19/Vite SPA. Each package has its own lockfile and scripts; root scripts orchestrate both.
- Backend bootstrap/configuration lives in `be/src/main.ts` and `be/src/config/app.config.ts`; API modules are under `be/src/modules/`, persistence is Prisma/PostgreSQL, and seat locking uses Redis.
- Frontend entrypoints are `fe/src/main.tsx` and `fe/src/App.tsx`; HTTP/auth behavior is centralized in `fe/src/api.ts` and generated API types are in `fe/src/generated/openapi.d.ts`.
- `README.md` is the canonical detailed source for domain flows, database invariants, API behavior, and runtime architecture.
- Whenever a new feature changes system behavior, architecture, API, database, runtime configuration, infrastructure, testing, or operational flows, update `README.md` in the same change. Keep the documentation aligned with the current source and include any new setup, migration, API, or verification requirements.

## Setup and runtime

- First setup from the repository root: copy `be/.env.example` to `be/.env` and `fe/.env.example` to `fe/.env`, run `npm install` and `npm run install:all`, then `npm run infra:up`, `npm run prisma:generate`, `npm run prisma:deploy`, and `npm run prisma:seed`.
- `npm run infra:up` starts PostgreSQL on `5432` and Redis on `6379` from `be/docker-compose.yml`; these defaults match `be/.env.example`. Stop both with `npm run infra:down`. Developers may instead point `DATABASE_URL` at Prisma Cloud without changing application code.
- Run both applications with `npm run dev`; use `npm run dev:be` or `npm run dev:fe` for one side. The backend API is `http://localhost:3000/api/v1`, Swagger is `/api/docs`, and readiness is `/api/v1/health/ready`.
- The frontend reads `VITE_API_URL` and defaults to `http://localhost:3000/api/v1`. Backend environment validation requires database/Redis URLs and distinct JWT secrets; production secrets must be at least 32 characters.
- Never commit `.env` files, `.stitch-key`, generated build output, or local graft cache.

## Verification commands

- Standard order: `npm run lint`, `npm run typecheck`, `npm run build`, then `npm test`; `npm test` runs backend Vitest unit/spec tests only.
- `npm run check` runs lint, typecheck, build, unit tests, and e2e tests. `npm run check:ci` also checks OpenAPI artifacts and runs integration tests.
- Backend e2e tests use mocked Prisma/Redis providers and run with `npm run test:e2e`; a focused test can be run with `npm --prefix be run test -- src/path/to/file.spec.ts` or `npm --prefix be run test:e2e -- test/path/to/file.e2e-spec.ts`.
- `npm run test:integration` is the required integration-test entrypoint. It starts the isolated Docker stack in `be/docker-compose.integration.yml` on PostgreSQL `55432` and Redis `56379`, deploys migrations, runs the serial integration suite, and removes containers/volumes afterward. Set `KEEP_INTEGRATION_INFRA=1` only when intentionally keeping that stack alive.
- Do not run integration specs against the development database. The wrapper intentionally requires `NODE_ENV=test`, `ALLOW_INTEGRATION_DB_RESET=1`, the local test database, and the isolated ports.

## API contract and database changes

- `fe/src/generated/openapi.d.ts` is generated; do not edit it manually. After changing controller DTOs, routes, or response decorators, run `npm run api:generate` and review both `openapi/ticket-booking.openapi.json` and the generated TypeScript. Verify with `npm run api:check`.
- `npm run api:generate` builds the backend, exports the OpenAPI document, then regenerates frontend types. Keep the committed spec and generated types synchronized.
- For Prisma schema or migration changes, regenerate the client and apply the appropriate migration before seeding or exercising booking flows. Use `npm run prisma:migrate -- --name <name>` for local development and `npm run prisma:deploy` for an existing migration set.

## Frontend and visual work

- For UI changes, read `DESIGN.md` and use the `design` skill configured through `opencode.json`; the source UI uses plain CSS in `fe/src/App.css`/`fe/src/index.css`, Space Grotesk + Inter, CineBook Cobalt Editorial semantic tokens, and Vietnamese copy.
- For new or substantially redesigned UI, use the Inspo MCP first to find relevant visual references and composition guidance, then create or update the matching reference screen in Stitch before implementing the FE code.
- Preserve loading, empty, error, hover, focus, and disabled states. Verify visual changes in a real browser at desktop and at widths of `720px` or less; do not introduce Tailwind or a second UI library/font.
- When creating or substantially redesigning a FE screen, create or edit its matching reference screen in Stitch project `projects/5412677534890310186` first/alongside the implementation, using the CineBook Cobalt Editorial design system asset created for this redesign; record the resulting screen ID and Inspo references in the work notes.
- Admin routes use the standalone `/admin/login` and Admin Shell/sidebar rather than the customer `Layout`; keep the desktop sidebar stable and mobile drawer restrained, with no unnecessary animation.

## Repository investigation

- Use the graft graph before broad source searches: `graft map` for orientation, `graft ask "..." --source` for behavior, `graft skeleton <file>` for APIs, and `graft callers <symbol>` for dependencies. Use `graft grep` when every occurrence is required.
- After substantial code changes, run `graft build`; `/graft/` is ignored and must not be committed.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
