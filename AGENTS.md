# Ticket Booking repository instructions

## Repository shape

- This is an npm monorepo: `be/` is a NestJS 12 modular monolith; `fe/` is a React 19/Vite SPA. Each package has its own lockfile and scripts; root scripts orchestrate both.
- Backend bootstrap/configuration lives in `be/src/main.ts` and `be/src/config/app.config.ts`; API modules are under `be/src/modules/`, persistence is Prisma/PostgreSQL, and seat locking uses Redis.
- Frontend entrypoints are `fe/src/main.tsx` and `fe/src/App.tsx`; HTTP/auth behavior is centralized in `fe/src/api.ts` and generated API types are in `fe/src/generated/openapi.d.ts`.
- `README.md` is the canonical detailed source for domain flows, database invariants, API behavior, and runtime architecture.
- Whenever a new feature changes system behavior, architecture, API, database, runtime configuration, infrastructure, testing, or operational flows, update `README.md` in the same change. Keep the documentation aligned with the current source and include any new setup, migration, API, or verification requirements.

## Setup and runtime

- First setup from the repository root: copy `be/.env.example` to `be/.env` and `fe/.env.example` to `fe/.env`, run `npm install` and `npm run install:all`, then `npm run infra:up`, `npm run prisma:generate`, `npm run prisma:deploy`, and `npm run prisma:seed`.
- `npm run infra:up` starts PostgreSQL on `5432` and Redis on `6379` from `be/docker-compose.yml`; stop them with `npm run infra:down`.
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
