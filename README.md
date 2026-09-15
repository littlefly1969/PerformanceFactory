# PerformanceFactory

Monorepo TypeScript con pnpm e Turborepo.

## Stack

- `apps/web`: Next.js 16.1.6, React 19.2.3, TypeScript, Tailwind CSS 4, App Router in `apps/web/app`.
- `apps/api`: NestJS 11 con Fastify, Prisma, PostgreSQL, Swagger su `/docs` se `SWAGGER_ENABLED` non e `false`.
- Sessioni: cookie HTTP-only con Redis come session store quando `REDIS_URL` e configurato.
- Database: PostgreSQL con schema Prisma in `apps/api/prisma/schema.prisma`.
- Infra locale: `infra/docker-compose.dev.yml` avvia PostgreSQL 16 e Redis 7.

## Prerequisiti

- Node.js 26.8.2. Il repository include `.nvmrc` e `package.json` richiede `>=26.8.2 <27`; i Dockerfile usano `node:26.8.2-bookworm-slim`.
- pnpm 10.28.2, dichiarato in `packageManager`.
- Docker con Docker Compose per i servizi locali.

Con `nvm`:

```bash
nvm install
nvm use
# Installa pnpm 10.28.2 con il metodo standalone ufficiale:
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=10.28.2 sh -
# Riapri la shell per caricare PNPM_HOME, poi verifica:
pnpm --version
```

Verifica rapida dell'ambiente:

```bash
pnpm run doctor
```

Il progetto richiede Node.js 26.8.2 e pnpm 10.28.2. Con nvm esegui `nvm use`
dalla directory del progetto per caricare `.nvmrc`.

## Deploy locale completamente Docker

```bash
pnpm docker:up
pnpm docker:ps
pnpm test:docker
```

Frontend, backend, PostgreSQL e Redis sono container separati. `.env.docker`
viene inizializzato con segreti casuali, PostgreSQL ha un volume persistente e le
migrazioni vengono applicate prima dell'avvio dell'API. I test usano un altro
container PostgreSQL effimero. Frontend su `http://127.0.0.1:3000`, API su
`http://127.0.0.1:4000/api`. Per fermare lo stack: `pnpm docker:stop`.

La possibilità di usare PostgreSQL remoto resta configurabile tramite
`DATABASE_URL` e disabilitazione del profilo `local-db`.
Vedi [deploy Docker e backup](docs/operations/production-deployment.md).

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
pnpm --filter api prisma:erd
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

Documentazione tecnica:

- [architettura backend](docs/backend/architecture.md);
- [API e OpenAPI](docs/api/README.md);
- [autenticazione e autorizzazione](docs/api/authentication.md);
- [errori e validazione](docs/api/errors.md).

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

[GitHub Actions](.github/workflows/ci.yml) parte su **ogni pull request**, su ogni push, sulla merge queue e manualmente. Tutti i job usano Node.js da `.nvmrc`
e pnpm da `packageManager`, con installazione `--frozen-lockfile`.

- **Lint and types**: validazione Prisma, lint e TypeScript per API e web.
- **Tests (api/web)**: test unitari e di interazione con coverage; anche e2e API.
- **PostgreSQL Docker integration**: container PostgreSQL 16 dedicato, migrazioni e test reali
  di persistenza, relazioni, unicità e rollback.
- **Production build**: build NestJS e Next.js standalone.
- **Docker full stack**: build e avvio di PostgreSQL, Redis, migrazioni, API e web,
  con verifica runtime e degli endpoint HTTP.
- **CI required**: fallisce se un job necessario fallisce, viene cancellato o saltato.

I report HTML, LCOV e JSON sono allegati alle esecuzioni per 14 giorni. I nuovi
commit interrompono le esecuzioni precedenti della stessa PR. I job non richiedono
chiavi AI o altri segreti applicativi e possono verificare anche PR da fork.

Per impedire il merge con controlli falliti, aggiungere **CI required** ai check
obbligatori della ruleset/branch protection di `main`. Questa impostazione di
GitHub è distinta dal workflow versionato nel repository.

## Testing

- API: test Jest unitari, e2e HTTP e integrazione PostgreSQL separata. Gli e2e
  HTTP usano i fake di persistenza esistenti; solo `test:db` usa un database reale.
- Web: test Vitest sulle funzioni di dominio e test d'interazione React con
  Testing Library. La copertura iniziale protegge chiavi, parsing e validazione
  delle bozze prompt, il flusso di modifica e salvataggio dei prompt, il rinnovo
  dei token e gli errori di rete.

`prisma:generate` genera soltanto Prisma Client, così non richiede un browser nei
runner CI. Il diagramma `prisma/erd.svg` si aggiorna esplicitamente con
`pnpm --filter api prisma:erd`.

Test PostgreSQL-backed espliciti:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/performancefactory_test pnpm --filter api test:db
```

`test:db` non fa parte di `pnpm test`: richiede PostgreSQL avviato con `pnpm db:up` e rifiuta URL che non puntano a un database locale dedicato con `test` nel nome.
Il database di test viene creato automaticamente se manca e tutte le migrazioni
vengono applicate prima dei test. I dati di prova sono racchiusi in transazioni
che vengono annullate; non usare database applicativi.

Coverage:

```bash
pnpm --filter api test:cov
pnpm --filter web test:cov
```

I report includono anche i file non esercitati. Le soglie bloccanti proteggono
scoring performance, risposte onboarding e storage bozze. Non equivalgono a una
copertura completa di tutte le schermate o integrazioni esterne.

Vedi [struttura del refactoring e verifiche](docs/refactoring.md).

## Caveat Locali

- Usa Node.js 26.8.2. Verifica con `pnpm run doctor` prima dei gate locali.
- In sandbox ristrette, `pnpm build` puo fallire durante il build web perche Turbopack tenta un bind di porta. In un ambiente locale/CI non ristretto il build passa.
- `pnpm lint` passa con warning noti; i warning non bloccano ancora il gate.

## Produzione

La configurazione runtime e env-driven. Usa `infra/.env.prod.example` come base
per il file reale `.env.production`, senza committare segreti.

Il compose di produzione e `infra/docker-compose.prod.example.yml` e usa:

- immagini applicative configurabili (`IMAGE_TAG`, `API_IMAGE`, `WEB_IMAGE`);
- Redis self-hosted con volume persistente `redis-data`;
- PostgreSQL in container con volume persistente `postgres-data` (remoto opzionale via `DATABASE_URL`);
- migrazioni automatiche e healthcheck per PostgreSQL, Redis, API e web;
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
