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

Verifica rapida dell'ambiente:

```bash
pnpm run doctor
```

Il progetto richiede Node.js 22 e pnpm 10.28.2. Se usi zsh con nvm, la shell
carica `.nvmrc` quando entri nella directory del progetto.

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

## CI

GitHub Actions esegue i gate deterministici su Node.js 22 e pnpm 10.28.2:

- `pnpm install --frozen-lockfile`
- `pnpm --filter api prisma:validate`
- `pnpm --filter api prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Un job separato avvia solo PostgreSQL 16 e lancia `pnpm --filter api test:db` con `TEST_DATABASE_URL` locale di test. Non usa staging e non richiede Redis.

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

- Usa Node.js 22. Verifica con `pnpm run doctor` prima dei gate locali.
- In sandbox ristrette, `pnpm build` puo fallire durante il build web perche Turbopack tenta un bind di porta. In un ambiente locale/CI non ristretto il build passa.
- `pnpm lint` passa con warning noti; i warning non bloccano ancora il gate.

## Produzione

La configurazione runtime e env-driven. Usa `infra/.env.prod.example` come base
per il file reale `.env.production`, senza committare segreti.

Il compose di produzione e `infra/docker-compose.prod.example.yml` e usa:

- immagini applicative configurabili (`IMAGE_TAG`, `API_IMAGE`, `WEB_IMAGE`);
- Redis self-hosted con volume persistente `redis-data`;
- PostgreSQL esterno via `DATABASE_URL`;
- healthcheck per API, web e Redis;
- log Docker con rotazione `json-file`;
- `restart: unless-stopped`;
- `up -d --remove-orphans` nello script di deploy.

Deploy:

```bash
infra/scripts/deploy-prod.sh --env-file .env.production
```

Cleanup sicuro, senza pruning dei volumi:

```bash
DRY_RUN=true infra/scripts/cleanup-docker.sh --env-file .env.production
CONFIRM_DOCKER_CLEANUP=true infra/scripts/cleanup-docker.sh --env-file .env.production
```

La documentazione operativa estesa e in
[`docs/operations/production-deployment.md`](./docs/operations/production-deployment.md).
Il riepilogo dei comandi correnti e in [`comandi.md`](./comandi.md).

## Privacy, AI e Google Identity

- Google OIDC e usato solo come identity provider. I dati applicativi restano nel database PerformanceFactory.
- La registrazione Google verifica prima l'identita, poi richiede accettazione privacy/AI su `/register/google/consents`; l'utente viene creato solo dopo i consensi.
- I documenti privacy e AI sono versionati in database, con hash server-side e gestione admin in `/admin/consents`.
- Se un documento attivo cambia versione/hash, l'utente viene bloccato su `/consents` fino a nuova accettazione.

## Flussi Funzionali

- Esperienza atleta attivita/check-in: [`docs/flows/athlete-activity-experience.md`](./docs/flows/athlete-activity-experience.md).
- Profilo performance professionista/allenatore: [`docs/flows/professional-athlete-profile.md`](./docs/flows/professional-athlete-profile.md).
