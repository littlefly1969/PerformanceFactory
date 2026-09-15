# PerformanceFactory - Stato Di Sviluppo

Aggiornato al 31 maggio 2026.

Questo documento descrive lo stato operativo del progetto e il modo corretto di
sviluppare senza cambiare toolchain a ogni sessione.

## Toolchain Standard

Usare sempre:

- Node.js 26.8.2, come indicato da `.nvmrc` e `package.json`.
- pnpm 10.28.2, come indicato da `packageManager`.
- Docker con Docker Compose plugin.

La macchina di sviluppo e' stata allineata cosi':

- `nvm alias default 22`
- Corepack attivo su Node 22
- `pnpm@10.28.2` preparato con Corepack
- zsh configurato per caricare nvm e usare la versione del progetto

Verifica ambiente:

```bash
pnpm run doctor
```

Se `pnpm run doctor` fallisce, correggere prima la toolchain. Non usare Node 24/26
come workaround per i gate del progetto.

## Comandi Quotidiani

Installazione dipendenze:

```bash
pnpm install
```

Servizi locali PostgreSQL e Redis:

```bash
pnpm db:up
pnpm db:down
```

Sviluppo applicazione:

```bash
pnpm dev
```

Quality gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Validazione Prisma:

```bash
pnpm db:check
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
```

Test DB espliciti:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/performancefactory_test pnpm --filter api test:db
```

## Architettura

PerformanceFactory e' un monorepo pnpm + Turborepo.

- `apps/api`: NestJS 11 con Fastify, Passport session, Prisma, PostgreSQL,
  Redis per sessioni/rate limiter in produzione, Swagger disattivabile con
  `SWAGGER_ENABLED=false`.
- `apps/web`: Next.js 16 App Router, React 19, build standalone.
- `infra`: Compose locale e Compose production di esempio.
- `docs`: decisioni tecniche, flussi e runbook operative.
- `packages`: spazio workspace condiviso.

Ruoli applicativi:

- `USER`: atleta.
- `PROFESSIONAL`: coach/professionista.
- `ADMIN`: operations e configurazione.
- `AI_TUNER`: workspace AI tuning.

## Stato Funzionale

Funzionalita' consolidate:

- Login locale email/password.
- Registrazione atleta pubblica con account sospeso.
- Google OIDC come identity provider.
- Consensi privacy e assistente AI versionati, con hash server-side.
- Blocco utente quando i consensi attivi cambiano.
- Abilitazione/disabilitazione atleta da admin.
- Collegamento coach-atleta per area.
- Competenze coach per area.
- Onboarding dinamico da template DB.
- Baseline iniziale per area e `CurrentState`.
- Prompt AI configurabili e versionati in modo immutabile.
- Preview prompt AI prima della generazione.
- Generazione ciclo per area.
- Approvazione coach per piano e questionario.
- Pubblicazione admin.
- Esecuzione piano e questionario lato atleta.
- Chiusura questionario/ciclo e aggiornamento performance.
- Workspace AI tuning con prompt, audit, replay, evaluation e monitoraggio.

## Aree Performance

Il catalogo seed include:

- Technical-Tactical
- Athletic Preparation
- Equipment
- Physiotherapy
- Nutrition
- Mental Training

Il flusso operativo e' area-scoped: piano, questionario, owner coach,
approvazione, audit e stato sono collegati alla singola area.

## AI E Prompt

Provider supportati:

- `stub`: deterministico per sviluppo e test.
- `openai`: richiede `OPENAI_API_KEY`.
- `gemini`: richiede `GEMINI_API_KEY`.

I provider esterni richiedono consenso AI valido e aggiornato.

La configurazione AI usa record correnti piu' storico immutabile:

- `AiGoalPromptConfig`
- `AiAreaGenerationConfig`
- `SportSpecializationAreaPrompt`
- `AiPromptVersion`
- prompt training collegati a sport/specializzazione
- istruzioni utente area-specifiche

Il contesto passato al modello evita UUID e campi tecnici non necessari. Gli
identificativi restano nelle relazioni DB e negli audit.

Output atteso:

- summary testuale
- piano operativo
- domande di monitoraggio
- audit completo in `AiProposalAudit`

## Ciclo Operativo

1. Admin sceglie atleta, area e configurazione pronta.
2. Preview mostra provider, modello, prompt, schema e contesto.
3. Generazione crea release ciclo, plan item, question set, audit e task coach.
4. Coach approva o rifiuta piano e questionario.
5. Admin pubblica quando le approvazioni sono complete.
6. Atleta esegue il piano e compila il questionario.
7. La chiusura aggiorna snapshot, ranking e storico.

Il ciclo successivo della stessa area resta bloccato finche' il precedente non
e' completo o risolto.

## Modelli Prisma Centrali

Utenti e accesso:

- `User`
- `Consent`
- `ProfessionalUserLink`
- `ProfessionalAreaCompetence`
- `DataAccessAudit`

Onboarding e AI:

- `UserOnboardingAssessment`
- `OnboardingQuestionTemplate`
- `AiGoalPromptConfig`
- `AiAreaGenerationConfig`
- `SportSpecializationAreaPrompt`
- `AiPromptVersion`
- `AiPromptReplay`
- `AiEvaluationRun`
- `AiEvaluationResult`

Performance e cicli:

- `CurrentState`
- `KpiDaily`
- `PerformanceProfileSnapshot`
- `PerformanceProfileSnapshotArea`
- `ImprovementPlanRelease`
- `PlanItem`
- `QuestionSet`
- `Question`
- `AnswerOption`
- `UserAnswer`
- `QuestionSetAreaApproval`
- `AiContextSummary`
- `AiProposalAudit`
- `CycleAuditLog`
- `PerformanceScaleConfig`

Legacy deprecati:

- `GuidanceContent`
- `UserAssignment`

## Migrazioni

Le migrazioni Prisma sono in `apps/api/prisma/migrations`.

Ultime aree coperte:

- registrazione atleta e onboarding dinamico;
- unicita' e storico prompt AI;
- configurazioni AI area/sport/specializzazione/training;
- Google OIDC;
- consensi privacy/AI obbligatori e versionati;
- workspace AI tuner;
- storico prompt immutabile.

Ultima migrazione presente:

```text
20260531120000_ai_prompt_immutable_versions
```

Non modificare schema DB dentro task infrastrutturali o documentali.

## Web App

Route principali:

- `/login`
- `/register`
- `/register/google/consents`
- `/consents`
- `/onboarding`
- `/user`
- `/user/plan`
- `/user/questions`
- `/user/performance`
- `/professional`
- `/professional/approvals`
- `/admin/cycles`
- `/admin/consents`
- `/ai-tuner`
- `/ai-tuner/prompts`
- `/ai-tuner/anamnesi`
- `/ai-tuner/audits`
- `/ai-tuner/replays`
- `/ai-tuner/evaluations`
- `/ai-tuner/monitoring`

La navigazione e' role-aware. Gli utenti con onboarding o consensi pendenti sono
reindirizzati ai flussi bloccanti.

## Produzione Docker

La produzione e' documentata in:

```text
docs/operations/production-deployment.md
```

File principali:

- `infra/docker-compose.prod.example.yml`
- `infra/.env.prod.example`
- `infra/scripts/deploy-prod.sh`
- `infra/scripts/cleanup-docker.sh`

Principi:

- nessun bind mount del sorgente applicativo;
- immagini taggate tramite `IMAGE_TAG`, `API_IMAGE`, `WEB_IMAGE`;
- Redis self-hosted con volume persistente `redis-data`;
- PostgreSQL esterno via `DATABASE_URL`;
- reti Compose esplicite;
- healthcheck per API, web e Redis;
- log Docker ruotati;
- cleanup separato, opt-in e senza pruning dei volumi.

Non eseguire:

```bash
docker volume prune
docker compose down --volumes
```

## Stato Qualita'

Ultima validazione eseguita:

- `docker compose --env-file infra/.env.prod.example -f infra/docker-compose.prod.example.yml config`
- `sh -n infra/scripts/deploy-prod.sh`
- `sh -n infra/scripts/cleanup-docker.sh`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Risultato: OK.

Note:

- `shellcheck` non e' installato.
- Il web non ha ancora una suite test frontend reale; lo script segnala
  esplicitamente che i test frontend non sono configurati.
- `pnpm lint` passa con warning noti, non bloccanti.

## Rischi Residui

- Test frontend assenti.
- Alcuni warning lint sono ancora presenti.
- I DTO non sono uniformemente validati con `class-validator`; parte delle
  validazioni vive nei service.
- Manca runbook di backup/restore DB production.
- Le operazioni DB distruttive richiedono sempre task separato, backup e
  conferma esplicita.
- Le risorse CPU/memoria non sono ancora codificate nel Compose production,
  per evitare una configurazione fuorviante fuori da Swarm/Kubernetes.

## Regole Di Lavoro

- Usare `pnpm`, non npm/yarn.
- Usare Node 22, non versioni piu' nuove.
- Prima di investigare problemi strani di build, eseguire `pnpm run doctor`.
- Tenere dev e produzione separati.
- Non cambiare business logic in task infrastrutturali.
- Non cambiare schema DB senza richiesta esplicita.
- Non fare cleanup Docker distruttivo dentro deploy.
- Non cancellare volumi Redis/DB.
- Aggiornare la documentazione quando cambia setup, deploy o workflow.
