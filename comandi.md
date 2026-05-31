# PerformanceFactory - Comandi Operativi

Aggiornato al 31 maggio 2026.

Questo file contiene solo i comandi correnti. La documentazione completa dello
stato di sviluppo e' in [`sviluppo.md`](./sviluppo.md); la runbook produzione e'
in [`docs/operations/production-deployment.md`](./docs/operations/production-deployment.md).

## Toolchain

Il progetto usa Node.js 22 e pnpm 10.28.2.

Verifica:

```bash
pnpm run doctor
```

Se fallisce, correggere prima l'ambiente. Non usare Node 24/26 come workaround.

## Setup Locale

Installa dipendenze:

```bash
pnpm install
```

Prepara gli env locali:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Avvia PostgreSQL e Redis locali:

```bash
pnpm db:up
```

Ferma PostgreSQL e Redis locali:

```bash
pnpm db:down
```

Avvia API e web in sviluppo:

```bash
pnpm dev
```

Endpoint locali:

- Web: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:4000/api`
- Health API: `http://127.0.0.1:4000/api/health`
- Swagger locale: `http://127.0.0.1:4000/docs`

## Database

Valida Prisma:

```bash
pnpm db:check
```

Genera client Prisma:

```bash
pnpm --filter api prisma:generate
```

Applica migrazioni:

```bash
pnpm --filter api prisma:migrate:deploy
```

Seed:

```bash
pnpm --filter api prisma:seed
```

Primo bootstrap locale tipico:

```bash
pnpm db:up
pnpm --filter api prisma:migrate:deploy
pnpm --filter api prisma:seed
pnpm dev
```

## Quality Gate

Eseguire dalla root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Test DB espliciti:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/performancefactory_test pnpm --filter api test:db
```

`test:db` richiede PostgreSQL locale e rifiuta URL che non puntano a un database
locale dedicato con `test` nel nome.

## Account Seed

Account demo principali:

```text
admin@example.com / password123
user@example.com / password123
pro@example.com / password123
tuner@example.com / password123
```

## Flussi Manuali Da Provare

Registrazione atleta:

1. Apri `http://127.0.0.1:3000/login`.
2. Usa "Nuovo utente".
3. Compila nome, cognome, email e password.
4. Accetta privacy e assistente AI.
5. Verifica che l'account nasca sospeso.

Registrazione Google:

1. Apri `http://127.0.0.1:3000/register`.
2. Usa `Registrati con Google`.
3. Completa `/register/google/consents`.
4. Verifica che l'account nasca sospeso solo dopo i consensi.

Abilitazione admin:

1. Login admin.
2. Apri `/admin/cycles`.
3. Abilita l'atleta.
4. Assegna coach per area.

Onboarding atleta:

1. Login atleta abilitato.
2. Completa `/onboarding`.
3. Verifica baseline, snapshot e `CurrentState`.

Ciclo operativo:

1. Admin usa preview AI.
2. Admin genera proposta.
3. Coach approva piano e questionario.
4. Admin pubblica.
5. Atleta completa piano e questionario.
6. Verifica chiusura ciclo e aggiornamento performance.

AI tuning:

1. Login `AI_TUNER` o admin.
2. Apri `/ai-tuner`.
3. Verifica prompt, audit, replay, evaluation e monitoraggio.

## Variabili Ambiente Locali

API (`apps/api/.env`):

```text
DATABASE_URL
SHADOW_DATABASE_URL
API_HOST=127.0.0.1
API_PORT=4000
WEB_ORIGIN=http://127.0.0.1:3000
SESSION_SECRET
ACCESS_TOKEN_SECRET
REDIS_URL=redis://localhost:6379
AI_PROVIDER=stub
AI_MODEL_PROPOSAL
OPENAI_API_KEY
GEMINI_MODEL_PROPOSAL
GEMINI_API_KEY
AI_DEBUG_PROMPT_LOG=false
SWAGGER_ENABLED=true
GOOGLE_OIDC_CLIENT_ID
GOOGLE_OIDC_CLIENT_SECRET
GOOGLE_OIDC_REDIRECT_URI
GOOGLE_OIDC_HOSTED_DOMAIN
GOOGLE_OIDC_AUTO_LINK_VERIFIED_EMAIL=false
WEB_LOGIN_SUCCESS_URL
WEB_LOGIN_FAILURE_URL
```

Web (`apps/web/.env.local`):

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api
```

## Produzione Docker

Usare la runbook:

```text
docs/operations/production-deployment.md
```

File production correnti:

- `infra/docker-compose.prod.example.yml`
- `infra/.env.prod.example`
- `infra/scripts/deploy-prod.sh`
- `infra/scripts/cleanup-docker.sh`

Validazione config:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml config
```

Deploy sicuro. Se `IMAGE_TAG`, `API_IMAGE` e `WEB_IMAGE` non sono impostati,
Compose usa immagini locali `performancefactory-api:local` e
`performancefactory-web:local`.

```bash
infra/scripts/deploy-prod.sh --env-file .env.production
```

Deploy con immagini da registry:

```bash
DEPLOY_MODE=pull infra/scripts/deploy-prod.sh --env-file .env.production
```

Migrazioni production, solo come step esplicito e dopo backup/review:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy
```

Stato servizi:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml ps
```

Log:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 api
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 redis
```

Cleanup sicuro in dry-run:

```bash
DRY_RUN=true infra/scripts/cleanup-docker.sh --env-file .env.production
```

Cleanup confermato:

```bash
CONFIRM_DOCKER_CLEANUP=true infra/scripts/cleanup-docker.sh --env-file .env.production
```

Non eseguire routine distruttive sui volumi:

```bash
docker volume prune
docker compose down --volumes
```

## Note Operative

- Il deploy non esegue automaticamente migrazioni.
- Il cleanup non cancella volumi.
- Redis production usa il volume persistente `redis-data`.
- PostgreSQL production e' esterno via `DATABASE_URL`.
- `SWAGGER_ENABLED=false` in produzione salvo decisione esplicita diversa.
- `AI_DEBUG_PROMPT_LOG=false` in produzione.
