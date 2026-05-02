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

- API: copia `apps/api/.env.example` e valorizza almeno `DATABASE_URL`, `SESSION_SECRET`, `REDIS_URL`, `WEB_ORIGIN`.
- Web: copia `apps/web/.env.example` e valorizza `NEXT_PUBLIC_API_BASE_URL`.
- AI: usa `AI_PROVIDER=stub` per fallback deterministico, `AI_PROVIDER=openai` con `OPENAI_API_KEY`, oppure `AI_PROVIDER=gemini` con `GEMINI_API_KEY`.

La nuova migrazione AI audit è:
`apps/api/prisma/migrations/20260427090000_ai_audit/migration.sql`.

Esempio Docker production:

```bash
docker compose -f infra/docker-compose.prod.example.yml up --build
```
