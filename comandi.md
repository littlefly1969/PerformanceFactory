# PerformanceFactory - Comandi Operativi

Aggiornato al 6 maggio 2026.

## Stato Server Attuale

In questa sessione i server locali sono stati fermati su richiesta. Ultimo stato verificato prima dello stop:

- Web Next.js dev: `http://127.0.0.1:3000`
- API NestJS: `http://127.0.0.1:4000/api`
- Health API verificato: `GET http://127.0.0.1:4000/api/health` restituisce `{"status":"ok"}`
- Database configurato da `apps/api/.env`; nell'ambiente corrente punta a Neon.
- Ultima migrazione creata: `20260505154000_consent_documents`
- Seed aggiornato: utenti demo, 6 aree, competenze coach, template anamnesi, prompt AI iniziali e configurazioni AI per area.

Account seed principali:

```text
admin@example.com / password123
user@example.com / password123
pro@example.com / password123
```

## Prerequisiti

Il progetto e' un monorepo con:

- API: NestJS, Prisma, PostgreSQL, sessioni cookie, bearer token breve.
- Web: Next.js App Router.
- Package manager dichiarato: `pnpm@10.28.2`.
- In questa workspace `pnpm` non e' nel PATH, quindi i comandi locali usano i binari in `node_modules/.bin`.

## Avvio Locale

API:

```bash
cd apps/api
./node_modules/.bin/nest start
```

Web:

```bash
cd apps/web
./node_modules/.bin/next dev -p 3000 -H 127.0.0.1
```

Health check:

```bash
curl -sS http://127.0.0.1:4000/api/health
curl -sS http://127.0.0.1:3000/login
```

Se `pnpm` e' disponibile:

```bash
pnpm dev
```

## Database

Avvio Postgres e Redis locali via Docker:

```bash
pnpm db:up
pnpm db:down
```

Con i binari locali, dalla root API:

```bash
cd apps/api
./node_modules/.bin/prisma validate
./node_modules/.bin/prisma generate --schema prisma/schema.prisma --generator client
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/ts-node prisma/seed.ts
```

Nota: `prisma generate` completo usa anche `prisma-erd-generator`; se il generatore ERD non e' nel PATH, usa:

```bash
cd apps/api
PATH=../../node_modules/.bin:$PATH ./node_modules/.bin/prisma generate
```

## Verifica Qualita'

API:

```bash
cd apps/api
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/nest build
./node_modules/.bin/jest
./node_modules/.bin/jest --config ./test/jest-e2e.json
```

Web:

```bash
cd apps/web
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/next build
```

Root monorepo, se `pnpm` e' disponibile:

```bash
pnpm typecheck
pnpm build
pnpm test
```

## Flussi Manuali Da Provare

Registrazione atleta:

1. Apri `http://127.0.0.1:3000/login`.
2. Usa "Nuovo utente".
3. Compila nome, cognome, email, password.
4. Leggi i documenti privacy e AI completi caricati dalla piattaforma.
5. Accetta separatamente privacy e utilizzo dell'assistente AI.
6. L'account nasce sospeso.

Registrazione atleta con Google:

1. Apri `http://127.0.0.1:3000/register`.
2. Usa `Registrati con Google`.
3. Google verifica identita' ed email.
4. La piattaforma mostra `/register/google/consents`.
5. Accetta privacy e AI; solo dopo viene creato l'account atleta sospeso.

Abilitazione admin:

1. Login admin.
2. Vai in `Operations`.
3. Apri "New athlete requests".
4. Abilita l'atleta.
5. Assegna un coach per area in "Athlete ownership".

Anamnesi atleta:

1. L'atleta abilitato fa login.
2. Se onboarding richiesto viene mandato su `/onboarding`.
3. Risponde a domande generali e specifiche per area.
4. Il sistema crea baseline, snapshot e `CurrentState`.

Configurazione AI:

1. Login admin.
2. Vai in `/admin/ai-config`.
3. Modifica prompt globali o specifici per area/livello.
4. Modifica, una volta per area, contesto iniziale AI, forma della risposta e layout JSON questionari.
5. Modifica domande di anamnesi generali o per area.
6. Le successive preview/generazioni AI includono anamnesi generale, anamnesi della sola area target, livello area, performance sintetica e storico utile della stessa area.
7. Gli ID tecnici non vengono passati al modello; restano solo nelle relazioni/audit del database.

Configurazione documenti privacy e AI:

1. Login admin.
2. Vai in `/admin/consents`.
3. Usa i documenti attivi come base.
4. Inserisci una nuova `version`, per esempio `privacy-v2-2026-05-06`.
5. Pubblica la nuova versione.
6. Il server calcola l'hash del documento e rende bloccante la nuova accettazione per gli utenti che non hanno ancora accettato quella versione/hash.

Generazione ciclo:

1. In `Operations`, verifica che l'atleta sia abilitato, abbia completato onboarding e abbia coach assegnato per l'area.
2. Usa `Preview AI`.
3. Genera la proposta.
4. Il coach approva piano e questionario.
5. L'admin pubblica il ciclo.

Riparazione questionari gia' risposti ma rimasti aperti:

1. Deploya il codice aggiornato sul server.
2. Login admin.
3. Apri `Operations`.
4. Usa `Close submitted questionnaires`.
5. Il backend chiude solo i questionari `PUBLISHED` che hanno gia' una risposta per ogni domanda, crea lo snapshot e aggiorna lo stato ciclo.

Endpoint equivalente:

```bash
POST /api/admin/maintenance/close-answered-questionnaires
```

## Variabili Ambiente Rilevanti

API (`apps/api/.env`):

```text
DATABASE_URL
SHADOW_DATABASE_URL
API_HOST=127.0.0.1
API_PORT=4000
WEB_ORIGIN=http://127.0.0.1:3000
SESSION_SECRET
ACCESS_TOKEN_SECRET
REDIS_URL
AI_PROVIDER=stub|openai|gemini
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

Web (`apps/web/.env.example`):

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api
```

## Produzione Docker

### Deploy con Git sul server

Il metodo consigliato e' usare una working copy Git in `/opt/performancefactory`.
Prima di fare pull verifica sempre lo stato:

```bash
cd /opt/performancefactory

git status --short --branch
git remote -v
git branch
```

Aggiornamento codice dal branch di lavoro:

```bash
cd /opt/performancefactory

git fetch origin
git switch feature-goal-driven-ai-flow
git pull --ff-only origin feature-goal-driven-ai-flow
git log -1 --oneline
```

`--ff-only` evita merge automatici sul server. Se fallisce, fermati e verifica
le modifiche locali con `git status` e `git diff`.

### Deploy con rsync

In alternativa, sincronizzazione codice verso il server:

```bash
rsync -az --delete \
  --exclude node_modules \
  --exclude 'apps/*/node_modules' \
  --exclude 'apps/web/.next' \
  --exclude 'apps/api/dist' \
  --exclude '.env' \
  --exclude '.env.production' \
  ./ stefano@192.168.1.105:/opt/performancefactory/
```

Questo comando e' adatto al deploy del sorgente quando non si usa Git sul
server: esclude dipendenze installate, output di build e file ambiente locali.
Dopo la sincronizzazione, build, migrazioni e variabili ambiente vanno gestite
sul server. Non e' perfettamente equivalente a `git pull`: `rsync --delete`
cancella file non presenti nella sorgente locale, mentre Git aggiorna solo file
tracciati.

Rigenerazione completa dei container Docker sul server:

Prima verifica che esista `/opt/performancefactory/.env.production`. Il file ambiente non viene copiato da `rsync` per scelta, quindi deve essere creato e mantenuto sul server.

Esempio per il deploy dietro proxy:

```bash
cd /opt/performancefactory
nano .env.production
chmod 600 .env.production
```

Contenuto minimo:

```text
WEB_ORIGIN=https://performancefactory.littlefly.it
NEXT_PUBLIC_API_BASE_URL=https://performancefactory.littlefly.it/api
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
SESSION_SECRET=metti-una-stringa-lunga-random
ACCESS_TOKEN_SECRET=metti-una-seconda-stringa-lunga-random
REDIS_URL=redis://redis:6379
AI_PROVIDER=stub
AI_MODEL_PROPOSAL=gpt-5.4-mini
GEMINI_MODEL_PROPOSAL=gemini-2.5-flash
GEMINI_API_KEY=
OPENAI_API_KEY=
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAME_SITE=lax
SWAGGER_ENABLED=false
API_HOST_PORT=4100
WEB_HOST_PORT=3100
GOOGLE_OIDC_CLIENT_ID=
GOOGLE_OIDC_CLIENT_SECRET=
GOOGLE_OIDC_REDIRECT_URI=https://performancefactory.littlefly.it/api/auth/google/callback
GOOGLE_OIDC_HOSTED_DOMAIN=
GOOGLE_OIDC_AUTO_LINK_VERIFIED_EMAIL=false
WEB_LOGIN_SUCCESS_URL=https://performancefactory.littlefly.it/
WEB_LOGIN_FAILURE_URL=https://performancefactory.littlefly.it/login
```

Controlla che Compose legga davvero le variabili:

```bash
cd /opt/performancefactory
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml config >/tmp/pf-compose.yml
grep -E "DATABASE_URL|WEB_ORIGIN|NEXT_PUBLIC_API_BASE_URL|REDIS_URL|GOOGLE_OIDC|WEB_LOGIN" /tmp/pf-compose.yml
```

Se vedi valori vuoti, fermati e correggi `.env.production`.

```bash
cd /opt/performancefactory

docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml down
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml build --no-cache api web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml up -d
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml ps
```

Se il server avvisa che `buildx` non e' installato, installa il plugin Docker Buildx e rilancia:

```bash
sudo apt update
sudo apt install -y docker-buildx-plugin
docker buildx version
```

Porte configurabili:

```text
API_HOST_PORT=4000
WEB_HOST_PORT=3000
```

Per deploy dietro proxy Apache/Nginx, imposta:

```text
WEB_ORIGIN=https://dominio-pubblico
NEXT_PUBLIC_API_BASE_URL=https://dominio-pubblico/api
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAME_SITE=lax
SWAGGER_ENABLED=false
```

Aggiornamento base dati dopo il deploy:

```bash
cd /opt/performancefactory

docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy

docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma generate --schema prisma/schema.prisma --generator client
```

Nota prompt AI: la migrazione `20260429123000_ai_prompt_uniqueness` normalizza eventuali duplicati preesistenti, poi applica i vincoli per impedire nomi prompt duplicati e piu' prompt attivi sulla stessa coppia area/livello. La migrazione `20260429142000_area_generation_config` aggiunge una configurazione unica per area con contesto iniziale, forma risposta e layout JSON questionari.
Nota consensi: la migrazione `20260505154000_consent_documents` aggiunge i
documenti consenso versionati e lo snapshot del testo accettato. Dopo questa
migrazione la pagina admin `/admin/consents` puo' pubblicare nuove versioni
privacy/AI; ogni nuova versione/hash richiede nuova accettazione bloccante.

Seed solo quando serve:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/ts-node prisma/seed.ts
```

Il seed non e' uno step obbligatorio a ogni deploy. Eseguilo solo in questi casi:

- primo bootstrap di un database vuoto;
- dati seed mancanti o corrotti;
- release che introduce nuovi dati iniziali, come template anamnesi o prompt base.

Il seed usa `upsert` per i dati principali, quindi e' pensato per essere idempotente, ma in produzione va comunque lanciato consapevolmente. Se l'immagine production non include `ts-node`, esegui il seed prima di ricostruire l'immagine oppure usa una shell del container costruita con le dipendenze dev.

Sequenza consigliata completa:

```bash
cd /opt/performancefactory

docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml down
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml build --no-cache api web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml up -d
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml ps
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=120 api
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=120 web
```

Health check post deploy:

```bash
curl -sS http://127.0.0.1:${API_HOST_PORT:-4000}/api/health
curl -I http://127.0.0.1:${WEB_HOST_PORT:-3000}/login
```

Verifica Google OIDC post deploy:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml exec api printenv | grep -E "GOOGLE_OIDC|WEB_LOGIN"

curl -sS -D - -o /dev/null "https://performancefactory.littlefly.it/api/auth/google/register"
```

Il redirect deve contenere `prompt=select_account` e `set-cookie: pf.sid=...`.
Il flusso corretto di registrazione Google termina su
`/register/google/consents`.

Restart rapido senza rebuild, utile solo dopo cambio `.env.production` gia'
supportato dall'immagine corrente:

```bash
cd /opt/performancefactory
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml up -d --force-recreate api web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=120 api
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=120 web
```
