# Architettura backend

## Runtime

Il backend e un'applicazione NestJS 11 su adapter Fastify. Espone API JSON con
prefisso `/api`, usa Prisma 6 per PostgreSQL e Passport per l'autenticazione.
Redis fornisce session store e storage distribuito del rate limiter in
produzione.

```text
Browser / client API
        |
        | HTTPS, JSON, cookie o bearer
        v
NestJS + Fastify
  |-- CORS e security headers
  |-- sessione Passport / AuthenticatedGuard
  |-- RolesGuard e policy ABAC
  |-- ValidationPipe
  |-- controller per dominio
        |
        +--> servizi applicativi --> Prisma --> PostgreSQL
        +--> orchestratore AI --> provider configurato
        +--> sessioni/rate limit --> Redis
```

## Bootstrap e pipeline HTTP

`src/main.ts` configura, nell'ordine:

1. adapter Fastify con `trustProxy` in produzione;
2. middleware compatibility, CORS e header di sicurezza;
3. cookie parser e sessione Passport;
4. validazione globale dei DTO;
5. prefisso globale `/api`;
6. OpenAPI/Swagger, se abilitato;
7. bind su `API_HOST` e `API_PORT`.

L'ordine tra prefisso e generazione OpenAPI e intenzionale: garantisce che i
path della specifica coincidano con quelli realmente esposti.

## Moduli applicativi

| Modulo                       | Responsabilita                                           |
| ---------------------------- | -------------------------------------------------------- |
| `auth`                       | credenziali locali, Google OIDC, sessioni e token brevi  |
| `consents`                   | documenti versionati, hash e accettazioni                |
| `onboarding`                 | profilazione atleta, obiettivi, sport e specializzazione |
| `relationships` / `guidance` | rete professionale e contenuti assegnati                 |
| `questions` / `answers`      | questionari, risposte e revisione per area               |
| `plans` / `user-plan`        | piani generali e allenamenti specifici                   |
| `performance`                | snapshot aggregati del profilo atleta                    |
| `professional`               | inbox e decisioni di approvazione                        |
| `admin` / `inspect`          | operazioni privilegiate e configurazione                 |
| `ai-orchestrator`            | costruzione contesto, generazione e pubblicazione cicli  |
| `ai-tuning`                  | audit pseudonimizzati, replay, golden ed evaluation      |
| `prisma`                     | accesso condiviso e lifecycle del client database        |

I controller traducono HTTP in chiamate applicative; la logica di dominio e le
query risiedono nei service. Le autorizzazioni sensibili devono restare nei
guard/policy e nei service, non affidarsi alla sola visibilita del frontend.

## Persistenza

Lo schema autorevole e `apps/api/prisma/schema.prisma`; le modifiche strutturali
passano da migrazioni versionate in `apps/api/prisma/migrations`. Non usare
`db push` per aggiornare ambienti condivisi o produzione. I seed forniscono dati
locali dimostrativi e non sono una migrazione.

## AI e privacy

L'orchestratore supporta provider configurabili e uno stub deterministico. Gli
audit per AI tuning sono pseudonimizzati, ma possono comunque contenere
combinazioni re-identificabili. `AI_DEBUG_PROMPT_LOG` deve restare disabilitato
fuori da ambienti controllati. Prompt attivi e versioni immutabili hanno flussi
distinti; consultare i documenti in `docs/flows` e `docs/technical-decisions`.

## Osservabilita e operazioni

`GET /api/health` verifica la disponibilita del processo, non la raggiungibilita
completa di PostgreSQL, Redis o provider AI. Il deployment deve quindi affiancare
monitoraggio delle dipendenze e metriche infrastrutturali. La guida operativa e
in [production-deployment.md](../operations/production-deployment.md).

## Test

- unit test Jest per servizi e componenti isolati;
- e2e Supertest per contratti HTTP;
- suite PostgreSQL separata tramite `test:db`;
- test OpenAPI per invarianti della specifica.

La suite frontend non costituisce copertura del backend. Le modifiche di
contratto richiedono almeno typecheck, test e2e interessati e verifica della
specifica generata.
