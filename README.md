# PerformanceFactory

Monorepo PNPM/Turbo con API NestJS, Web Next.js, PostgreSQL/Prisma e Redis per le sessioni di produzione.

## Database Dev

Docker Compose è previsto per sviluppo locale:

```bash
pnpm db:up
```

In ambienti sandbox dove Docker non è disponibile,
usa un Postgres managed (Supabase/Neon) e imposta DATABASE_URL.

## Produzione

La configurazione runtime è env-driven:

- API: valorizza `.env.production` sul server con almeno `DATABASE_URL`, `SESSION_SECRET`, `ACCESS_TOKEN_SECRET`, `REDIS_URL`, `WEB_ORIGIN`, eventuali chiavi AI e variabili Google OIDC.
- Web: valorizza `NEXT_PUBLIC_API_BASE_URL` in `.env.production`.
- AI: usa `AI_PROVIDER=stub` per fallback deterministico, `AI_PROVIDER=openai` con `OPENAI_API_KEY`, oppure `AI_PROVIDER=gemini` con `GEMINI_API_KEY`.

Il deploy server consigliato usa Git:

```bash
cd /opt/performancefactory
git fetch origin
git switch feature-goal-driven-ai-flow
git pull --ff-only origin feature-goal-driven-ai-flow
```

Poi build, migrazioni e restart:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml build --no-cache api web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml up -d
```

La documentazione operativa completa è in [`comandi.md`](./comandi.md).

## Privacy, AI e Google Identity

- Google OIDC è usato solo come identity provider. I dati applicativi restano nel database PerformanceFactory.
- La registrazione Google verifica prima l'identità, poi richiede accettazione privacy/AI su `/register/google/consents`; l'utente viene creato solo dopo i consensi.
- I documenti privacy e AI sono versionati in database, con hash server-side e gestione admin in `/admin/consents`.
- Se un documento attivo cambia versione/hash, l'utente viene bloccato su `/consents` fino a nuova accettazione.
