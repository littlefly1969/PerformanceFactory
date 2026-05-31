# AGENTS.md

Guidance for agents working in this repository.

## Repository Structure

This is a TypeScript monorepo using pnpm and Turborepo.

- `apps/web`: Next.js 16.1.6, React 19.2.3, TypeScript, Tailwind CSS 4. The App Router lives under `apps/web/app`, with standalone build configured in `apps/web/next.config.ts`.
- `apps/api`: NestJS 11 API using the Fastify adapter. Swagger is available at `/docs` unless `SWAGGER_ENABLED=false`.
- `apps/api/prisma`: Prisma 6.19.2 schema, migrations, seed, and ERD generator setup.
- `infra`: local and production infrastructure examples. `infra/docker-compose.dev.yml` provides PostgreSQL 16 and Redis 7.
- `packages`: shared package workspace area. Inspect before assuming anything is available.

## Tooling

- Use `pnpm`, not `npm` or `yarn`.
- Use Node.js 22, matching `.nvmrc` and the Docker base images.
- Run `pnpm run doctor` first if the shell appears to use a different Node or pnpm.
- Inspect the relevant `package.json` scripts before inventing commands.
- Root scripts include `dev`, `build`, `lint`, `lint:fix`, `test`, `typecheck`, `db:up`, and `db:down`.
- Backend scripts include Prisma commands for validate, generate, migrate, and seed.

## Change Policy

- Make small, reviewable changes.
- Do not rewrite the architecture unless explicitly requested.
- Preserve public API behavior unless the task explicitly asks for a behavior change.
- Do not change production behavior just to satisfy tests.
- Prefer existing local patterns, modules, DTOs, guards, services, and Prisma access style.
- Add or update tests when behavior changes.

## Backend Notes

- Auth is session-based with `passport`, `passport-local`, `express-session`, and HTTP-only cookies.
- Roles are `USER`, `PROFESSIONAL`, `ADMIN`, and `AI_TUNER`.
- Request validation uses `class-validator`, `class-transformer`, and global `ValidationPipe`.
- Redis is used as the production session store when `REDIS_URL` is configured; development can fall back to memory store.

## Validation

When feasible, validate changes with the narrowest relevant command first, then broader checks. `pnpm lint` is a read-only check; use `pnpm lint:fix` only when automatic fixes are explicitly intended.

- Lint
- Typecheck
- Tests
- Build

Backend tests use Jest, Supertest, ts-jest, and e2e tests. Frontend tests are not configured yet; the web test script reports that gap explicitly and should not be treated as frontend coverage.

PostgreSQL-backed integration tests are explicit and separate from the root test gate. Run them with `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/performancefactory_test pnpm --filter api test:db` after `pnpm db:up`; the guard requires a local database name containing `test`.

## Definition of Done

A change is done when:

- Code compiles.
- Relevant tests pass.
- Lint and typecheck pass where possible.
- Documentation is updated if behavior or setup changed.
- The final response lists files changed, commands run, results, and remaining risks.
