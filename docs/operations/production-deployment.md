# Deploy Docker

Il deployment attuale usa container separati per frontend, backend, PostgreSQL
e Redis. Un quinto servizio esegue le migrazioni prima dell'avvio dell'API.
Le immagini applicative usano Node 26.8.2.

## Avvio locale completo

Dalla root:

```bash
pnpm docker:up
pnpm docker:ps
```

`docker:up` crea `.env.docker` solo se manca, con permessi `0600` e password e
segreti casuali. Alle esecuzioni successive conserva il file e i dati. Poi
costruisce le immagini, avvia i servizi ed attende i controlli di salute.

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:4000/api`
- PostgreSQL: `postgres:5432` nella rete Docker interna
- Redis: `redis:6379` nella rete Docker interna

Le porte di PostgreSQL e Redis non vengono pubblicate sull'host. Le porte web e
API sono esposte solo sul loopback per il deploy locale. In questo ambiente
HTTP locale `SESSION_COOKIE_SECURE=false`; il template di produzione usa HTTPS
e cookie secure.

Per caricare i dati demo sul database locale appena creato:

```bash
docker compose --env-file .env.docker -f infra/docker-compose.prod.example.yml exec -T api node dist/prisma/seed.js
```

Il seed è esplicito: non viene eseguito automaticamente durante il deploy.
Gli account demo sono descritti nel README.

Per fermare i servizi conservando tutti i dati:

```bash
pnpm docker:stop
```

## Architettura e ordine di avvio

```mermaid
flowchart LR
  postgres[PostgreSQL con volume] -->|healthy| migrate[Migrazioni Prisma]
  migrate -->|successo| api[Backend NestJS]
  redis[Redis con volume] -->|healthy| api
  api -->|healthy| web[Frontend Next.js standalone]
```

| Servizio | Immagine / build | Persistenza |
| --- | --- | --- |
| `web` | `apps/web/Dockerfile`, runtime standalone | Nessuna |
| `api` | `apps/api/Dockerfile`, runtime NestJS | Database e Redis |
| `migrate` | Stessa immagine API, `prisma migrate deploy` | Schema PostgreSQL |
| `postgres` | `postgres:16-bookworm` | Volume `postgres-data` |
| `redis` | `redis:7.4-alpine` | Volume `redis-data`, AOF |

Il nome progetto predefinito per il deploy locale è `performancefactory-local`.
Sviluppo e test usano rispettivamente `performancefactory-dev` e
`performancefactory-test`. Il progetto prefissa i nomi dei volumi, evitando
condivisioni accidentali tra ambienti.

`NEXT_PUBLIC_API_BASE_URL` è un parametro **di build**, letto dal browser:
deve contenere l'URL pubblico dell'API, non `http://api:4000`. Ricostruire il
frontend quando cambia. I nomi Docker `postgres` e `redis` servono invece alle
connessioni interne dell'API.

## Produzione attuale con PostgreSQL Docker

```bash
cp infra/.env.prod.example .env.production
chmod 600 .env.production
```

Configurare:

- `WEB_ORIGIN` e `NEXT_PUBLIC_API_BASE_URL` con i domini pubblici.
- `POSTGRES_PASSWORD`, `SESSION_SECRET` e `ACCESS_TOKEN_SECRET` con tre segreti
  distinti, per esempio generati con `openssl rand -hex 32`.
- `COMPOSE_PROFILES=local-db` per abilitare PostgreSQL Docker.
- `DATABASE_URL` può mantenere il valore del template, composto da utente,
  password e database locali. Una password personalizzata con caratteri speciali
  deve essere codificata correttamente se inserita direttamente nell'URL.

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml config --quiet
infra/scripts/deploy-prod.sh --env-file .env.production
```

Il deploy applica **automaticamente le migrazioni** prima dell'avvio dell'API;
se falliscono, il deploy fallisce. Per database già popolati verificare il backup
prima di distribuire nuove migrazioni. Il codice non copia né migra automaticamente
i dati di un precedente database remoto nel nuovo database locale.

Per usare immagini già pubblicate:

```bash
DEPLOY_MODE=pull infra/scripts/deploy-prod.sh --env-file .env.production
```

Sono configurabili `API_IMAGE`, `WEB_IMAGE`, `IMAGE_TAG`, `POSTGRES_IMAGE`,
`REDIS_IMAGE` e le porte/bind dell'host. Il server davanti a Docker deve gestire
HTTPS quando si usa il template di produzione.

## Database remoto opzionale

L'applicazione continua a usare `DATABASE_URL`. Per un database remoto impostare
nel file env:

```dotenv
COMPOSE_PROFILES=
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

Con il profilo disabilitato PostgreSQL locale non viene avviato. Le migrazioni
e l'API usano l'URL remoto; Redis, backend e frontend restano container Docker.
`migrate` accetta l'assenza del servizio PostgreSQL locale e dispone della rete
necessaria a raggiungere l'host esterno.

Le variabili già esportate nella shell hanno precedenza sui file env Compose:
rimuovere un eventuale `DATABASE_URL` esportato se si vuole usare quello del file.

## Test con PostgreSQL dedicato

```bash
pnpm test:docker
```

`infra/docker-compose.test.yml` costruisce lo stage `test` del Dockerfile API,
avvia PostgreSQL 16 in memoria (`tmpfs`), applica le migrazioni ed esegue i test
reali su `performancefactory_test`. Non pubblica porte e non utilizza i volumi
applicativi. Lo script restituisce l'esito del container di test e rimuove i
container e la rete di test al termine, anche in caso di errore.

Per esecuzioni simultanee scegliere un nome diverso:

```bash
TEST_COMPOSE_PROJECT_NAME=performancefactory-test-2 pnpm test:docker
```

La CI esegue questi test e avvia anche l'intero stack di deploy, verificando
runtime Node, `/api/health` e `/login`.

Per sviluppo con Node sull'host e solo servizi dati in Docker:

```bash
pnpm db:up
```

Il Compose di sviluppo espone PostgreSQL su `127.0.0.1:5432` e Redis su
`127.0.0.1:6379`, con volumi dedicati. `DEV_POSTGRES_PORT` e `DEV_REDIS_PORT`
permettono di risolvere conflitti di porte. Il precedente database di sviluppo
non viene copiato automaticamente nei nuovi volumi.

## Backup e ripristino PostgreSQL locale

Backup consistente in formato custom (usare l'utente/database configurati):

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml exec -T postgres pg_dump -U performancefactory -d performancefactory -Fc > performancefactory.dump
```

Conservare i backup fuori dal volume Docker. Provare il ripristino su un database
vuoto dedicato, con servizi applicativi fermi durante un ripristino operativo:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml exec -T postgres pg_restore -U performancefactory -d DATABASE_VUOTO --no-owner --exit-on-error < performancefactory.dump
```

Cambiare `POSTGRES_PASSWORD` nel file env non cambia la password di un database
che è già stato inizializzato. Pianificare la rotazione anche dentro PostgreSQL.
Non cambiare la major di `POSTGRES_IMAGE` su un volume esistente senza una
procedura di upgrade PostgreSQL.

## Stato, log e pulizia

```bash
docker compose --env-file .env.docker -f infra/docker-compose.prod.example.yml ps -a
docker compose --env-file .env.docker -f infra/docker-compose.prod.example.yml logs --tail=100 api web postgres redis migrate
curl -fsS http://127.0.0.1:4000/api/health
curl -fsSI http://127.0.0.1:3000/login
```

I log ruotano secondo `DOCKER_LOG_MAX_SIZE` e `DOCKER_LOG_MAX_FILE`. La pulizia
ordinaria mantiene i volumi:

```bash
DRY_RUN=true infra/scripts/cleanup-docker.sh --env-file .env.production
CONFIRM_DOCKER_CLEANUP=true infra/scripts/cleanup-docker.sh --env-file .env.production
```

Non usare `docker volume prune` o `docker compose down --volumes` sui progetti
applicativi. Il rollback delle immagini non annulla automaticamente le migrazioni.

## Accesso al daemon Docker

Se `docker info` restituisce `permission denied`, un amministratore può abilitare
l'utente del processo nel gruppo Docker:

```bash
sudo usermod -aG docker littlefly1
```

Riaprire la sessione dopo la modifica. L'appartenenza al gruppo permette di
controllare il daemon Docker e i container dell'host.
