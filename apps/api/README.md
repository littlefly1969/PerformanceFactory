# PerformanceFactory API

Backend NestJS 11 con adapter Fastify, Prisma/PostgreSQL, sessioni Passport e
Redis. Il prefisso HTTP applicativo e `/api`.

## Avvio locale

Dalla root del monorepo:

```bash
pnpm db:up
pnpm --filter api prisma:migrate:dev
pnpm --filter api prisma:seed
pnpm --filter api start:dev
```

Endpoint predefiniti:

- API: `http://127.0.0.1:4000/api`
- health check: `http://127.0.0.1:4000/api/health`
- Swagger UI: `http://127.0.0.1:4000/docs`
- OpenAPI JSON: `http://127.0.0.1:4000/docs-json`
- OpenAPI YAML: `http://127.0.0.1:4000/docs-yaml`

Swagger e disabilitabile con `SWAGGER_ENABLED=false`; questa e
l'impostazione raccomandata e predefinita negli esempi di produzione.
`SWAGGER_PATH` cambia il percorso della UI e `API_VERSION` la versione esposta
nella specifica.

## Documentazione

- [Architettura backend](../../docs/backend/architecture.md)
- [Guida API e OpenAPI](../../docs/api/README.md)
- [Autenticazione e autorizzazione](../../docs/api/authentication.md)
- [Errori e validazione](../../docs/api/errors.md)
- [Google OIDC](docs/google-oidc.md)
- [Consensi](docs/consents.md)
- [Riallineamento dominio V2+](docs/v2-domain-realignment.md)

La specifica OpenAPI generata a runtime e la fonte primaria per endpoint,
parametri e payload. I documenti Markdown descrivono invece contratti
trasversali, architettura e flussi che non sono rappresentabili in OpenAPI.

## Comandi di qualita

```bash
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api build
pnpm --filter api prisma:validate
```

I test PostgreSQL-backed sono separati:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/performancefactory_test pnpm --filter api test:db
```
