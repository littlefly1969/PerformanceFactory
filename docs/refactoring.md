# Modularità, Node e CI

## Runtime

Node **26.8.2 Current** è la versione scelta per soddisfare l'aggiornamento
all'ultima release disponibile il 15 settembre 2026. Non è la linea LTS:
[release ufficiali Node](https://nodejs.org/en/download).
`.nvmrc`, engines, doctor e immagini Docker devono restare coerenti.
La versione pnpm resta 10.28.2 e i tipi Node sono aggiornati alla serie 26.
I Dockerfile installano il pacchetto pnpm con checksum SHA-256, senza dipendere
dalla presenza di Corepack. Puppeteer non viene scaricato per build e test;
la generazione del diagramma ERD rimane un'operazione separata.

## Backend

I servizi NestJS mantengono constructor, dependency injection e metodi pubblici.
Delegano il lavoro a moduli con dipendenze esplicite, richiamabili anche nei test:

| Area | Responsabilità separate |
| --- | --- |
| `ai-orchestrator` | Contratti, configurazione provider, trasporto OpenAI/Gemini, schema JSON, prompt, normalizzazione, audit, storia, scoring, generazione e pubblicazione |
| `admin` | Dashboard, gestione atleti, sport, onboarding, configurazioni AI e versioni prompt |
| `ai-tuning` | Export prompt, audit/costi, replay, cataloghi e valutazioni |
| `onboarding` | Risposte e punteggi, questionari, sport, obiettivi e completamento |
| `professional` | Inbox e revisioni separate per cicli e allenamenti |
| `inspect` | Letture cicli/utenti/professionisti e assegnazioni |

Le transazioni Prisma restano negli stessi confini. Non sono cambiate route,
DTO, schema del database, regole di pubblicazione o protocolli dei provider AI.
I modelli esportati dai servizi restano disponibili per compatibilità.

## Frontend

Le schermate prompt, casi di test, cicli amministrativi, onboarding, approvazioni
e piano atleta separano pagina, stato, azioni e modelli. Le schermate maggiori
hanno componenti dedicati a liste, editor, selettori e dialoghi.

Le azioni ricevono esplicitamente i valori e le callback necessari: possono
quindi essere testate con risposte HTTP simulate, senza montare l'intera pagina.
I test della pagina prompt esercitano anche l'integrazione reale fra hook,
navigazione, editor e salvataggio della bozza.

`globals.css` importa fogli in `app/styles` nell'ordine originario. Le regole e
le sovrascritture del tema mantengono la stessa sequenza per preservare la cascata.

## Dimensione dei file

`pnpm check:size`, incluso in `pnpm lint`, verifica che i file TypeScript, TSX e
CSS sotto `apps/api/src` e `apps/web/app` non superino **650 righe**. Schema Prisma,
migrazioni e artefatti generati non rientrano nel limite. Il controllo impedisce
che nuove modifiche ricreino i moduli monolitici appena separati.

## Verifiche e limiti

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` sono i gate generali.
- `pnpm --filter api test:cov` e `pnpm --filter web test:cov` producono report
  completi e applicano soglie ai moduli critici coperti.
- `TEST_DATABASE_URL=... pnpm --filter api test:db` usa un database locale
  dedicato, applica le migrazioni e verifica vincoli e transazioni reali.
- I test non richiedono chiamate a provider AI esterni.
- La coverage dell'intero repository resta parziale; le soglie non certificano
  copertura completa di tutti i flussi.
- La CI costruisce e avvia lo stack Docker completo con PostgreSQL e Redis;
  verifica Node e gli endpoint HTTP. I test DB usano container separati.
- `pnpm test:infra` verifica le configurazioni locali/remoto e gli script senza
  richiedere un daemon Docker, ma richiede il comando Docker Compose.
- Rendere il check `CI required` obbligatorio richiede una ruleset di GitHub:
  aggiungere un workflow non modifica da solo la protezione del branch.
