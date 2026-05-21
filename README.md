# PerformanceFactory

Monorepo TypeScript con pnpm e Turborepo.

## Stack

- `apps/web`: Next.js 16.1.6, React 19.2.3, TypeScript, Tailwind CSS 4, App Router in `apps/web/app`.
- `apps/api`: NestJS 11 con Fastify, Prisma, PostgreSQL, Swagger su `/docs` se `SWAGGER_ENABLED` non e `false`.
- Sessioni: cookie HTTP-only con Redis come session store quando `REDIS_URL` e configurato.
- Database: PostgreSQL con schema Prisma in `apps/api/prisma/schema.prisma`.
- Infra locale: `infra/docker-compose.dev.yml` avvia PostgreSQL 16 e Redis 7.

## Prerequisiti

- Node.js 22. Il repository include `.nvmrc` e `package.json` richiede `>=22 <23`; i Dockerfile usano `node:22-bookworm-slim`.
- pnpm 10.28.2, dichiarato in `packageManager`.
- Docker con Docker Compose per i servizi locali.

Con `nvm`:

```bash
nvm install
nvm use
corepack enable
pnpm --version
```

## Setup Locale

Installa le dipendenze dalla root:

```bash
pnpm install
```

Configura gli environment file locali:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Gli esempi puntano a:

- API: `http://127.0.0.1:4000/api`
- Web: `http://127.0.0.1:3000`
- PostgreSQL: `postgresql://postgres:postgres@localhost:5432/performancefactory`
- Redis: `redis://localhost:6379`
- AI: `AI_PROVIDER=stub` per sviluppo deterministico

Avvia PostgreSQL e Redis:

```bash
pnpm db:up
```

Ferma i servizi locali:

```bash
pnpm db:down
```

## Database e Prisma

Valida lo schema Prisma:

```bash
pnpm db:check
```

Comandi Prisma disponibili nel package API:

```bash
pnpm --filter api prisma:validate
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev
pnpm --filter api prisma:migrate:deploy
pnpm --filter api prisma:seed
```

Per un database locale nuovo, dopo `pnpm db:up` usa normalmente:

```bash
pnpm --filter api prisma:migrate:dev
pnpm --filter api prisma:seed
```

Account demo principali creati dal seed:

```text
admin@example.com / password123
user@example.com / password123
pro@example.com / password123
tuner@example.com / password123
```

## Sviluppo

Avvia web e API in modalita sviluppo:

```bash
pnpm dev
```

Endpoint locali predefiniti:

- Web: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:4000/api`
- Swagger: `http://127.0.0.1:4000/docs`

## Quality Gate

I comandi root sono quelli da usare per validazione locale e CI:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm lint` e read-only. Per applicare fix automatici in modo esplicito:

```bash
pnpm lint:fix
```

## Testing

- API: test Jest unitari ed e2e reali; al momento passano.
- Web: i test frontend non sono ancora configurati. Lo script `apps/web test` stampa `Frontend tests are not configured yet` e termina con successo per non rompere il gate root, ma non deve essere considerato copertura frontend.

Test PostgreSQL-backed espliciti:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/performancefactory_test pnpm --filter api test:db
```

`test:db` non fa parte di `pnpm test`: richiede PostgreSQL avviato con `pnpm db:up` e rifiuta URL che non puntano a un database locale dedicato con `test` nel nome.
Il database di test viene creato automaticamente se manca; le migrazioni non vengono applicate da questo smoke test iniziale.

## Caveat Locali

- Usa Node.js 22. Eseguire i comandi con Node 24/26 genera warning sugli `engines` e puo produrre differenze rispetto a Docker/CI.
- In sandbox ristrette, `pnpm build` puo fallire durante il build web perche Turbopack tenta un bind di porta. In un ambiente locale/CI non ristretto il build passa.
- `pnpm lint` passa con warning noti; i warning non bloccano ancora il gate.

## Produzione

La configurazione runtime e env-driven. Usa `.env.production.example` come base:

- API: `DATABASE_URL`, `SESSION_SECRET`, `ACCESS_TOKEN_SECRET`, `REDIS_URL`, `WEB_ORIGIN`, variabili AI e Google OIDC.
- Web: `NEXT_PUBLIC_API_BASE_URL`.

Build, migrazioni e restart con compose di produzione:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml build --no-cache api web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml up -d
```

La documentazione operativa estesa e in [`comandi.md`](./comandi.md).

## Privacy, AI e Google Identity

- Google OIDC e usato solo come identity provider. I dati applicativi restano nel database PerformanceFactory.
- La registrazione Google verifica prima l'identita, poi richiede accettazione privacy/AI su `/register/google/consents`; l'utente viene creato solo dopo i consensi.
- I documenti privacy e AI sono versionati in database, con hash server-side e gestione admin in `/admin/consents`.
- Se un documento attivo cambia versione/hash, l'utente viene bloccato su `/consents` fino a nuova accettazione.
