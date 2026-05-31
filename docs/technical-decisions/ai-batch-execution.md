# Esecuzione batch AI per generazione cicli

## Scopo

Questo documento descrive come evolvere `OrchestratorService.runProposalBatch` da esecuzione sincrona e sequenziale dentro la richiesta HTTP a un modello più sicuro basato su job.

La decisione qui proposta è solo progettuale: non cambia route, schema Prisma, comportamento runtime o dipendenze.

## Contesto attuale

### Entry point

Il batch ordinario parte da `POST /admin/orchestrator/run`, definito in `AdminController`.

Il controller:

- richiede `AuthenticatedGuard` e `RolesGuard`;
- consente solo ruolo `ADMIN`;
- riceve `RunCycleDto` con `userIds`, `areaId` opzionale e `runAllAreas` opzionale;
- chiama `runProposalBatch(body.userIds, actorId, body.areaId, body.runAllAreas ?? true)`;
- restituisce direttamente il risultato del service.

`POST /admin/orchestrator/preview` resta sincrono e richiede un solo utente e una sola area. Non crea dati persistenti.

### Sequenza corrente

`runProposalBatch` oggi:

1. valida `actorId`;
2. valida che `userIds` non sia vuoto;
3. rifiuta la combinazione `areaId + runAllAreas`;
4. se `areaId` è presente, carica quella singola area;
5. itera i `userIds` con `for ... of`;
6. per ogni utente, determina le aree:
   - area singola se passata;
   - aree abilitate da `UserSportSelection`/`SportSpecializationAreaPrompt` se `runAllAreas = true`;
   - tutte le aree se l'utente non ha selezione sport;
7. itera le aree con `for ... of`;
8. chiama `await runCycleForArea(userId, area, actorId)`;
9. accumula e restituisce `{ userId, areaId, planReleaseId, questionSetId }`.

Non c'è parallelismo esplicito. Ogni utente/area viene completato prima di passare al successivo.

### Confini transazionali

`runCycleForArea` divide il lavoro in due fasi:

1. Preparazione e generazione fuori transazione:
   - valida utente, pending esistenti, ciclo precedente e consenso AI;
   - costruisce contesto;
   - chiama `AiProposalProviderService.generateCycleProposal`.

2. Persistenza in una transazione Prisma per singola area:
   - ricontrolla utente valido;
   - ricontrolla pending esistente;
   - ricontrolla completamento ciclo precedente;
   - legge snapshot e versione precedente;
   - crea `ImprovementPlanRelease`;
   - crea `PlanItem`;
   - crea `QuestionSet`, `Question` e `QuestionSetAreaApproval`;
   - crea `AiContextSummary`;
   - crea `AiProposalAudit`;
   - crea `CycleAuditLog` con azione `PROPOSAL_RUN`.

Il batch completo non è racchiuso in una singola transazione. La granularità atomica è l'area.

### Persistenza parziale

Il comportamento attuale consente persistenza parziale.

Esempio: con `runAllAreas = true`, se la prima area viene generata e persistita correttamente e la seconda fallisce, la prima proposta resta nel database. La chiamata HTTP fallisce, ma lo stato persistito non viene annullato per le aree già completate.

Questo comportamento deriva dal fatto che:

- il loop batch è sequenziale;
- `runCycleForArea` apre una transazione per singola area;
- non esiste un record batch/job che descriva quali elementi siano riusciti o falliti;
- non esiste una compensazione automatica per le proposte già create.

### Failure behavior

I principali fallimenti osservabili sono:

- payload non valido: `BadRequestException` prima del loop;
- area non valida: `BadRequestException` prima del loop o prima della generazione;
- nessuna area configurata per utente: `BadRequestException`;
- utente non valido o inattivo: `BadRequestException`;
- consenso AI mancante per provider esterni: `BadRequestException`;
- proposta pending già presente per utente/area: `BadRequestException`;
- ciclo precedente non completato: `BadRequestException`;
- errore provider AI prima della transazione;
- errore durante la transazione Prisma.

Se il provider fallisce prima della transazione, non viene creato `AiProposalAudit` per quel tentativo nel percorso ordinario. `AiProposalAudit` viene creato dopo una risposta provider riuscita e dentro la transazione di persistenza della proposta.

Se la transazione Prisma fallisce, la singola area non viene persistita, ma le aree precedenti nello stesso batch restano persistite.

### Retry behavior

Non c'è retry applicativo esplicito in `runProposalBatch`.

Un retry manuale dell'admin può:

- fallire su aree già persistite perché esiste un piano `PENDING_APPROVAL`;
- riuscire solo sulle aree non ancora persistite se l'admin rilancia una singola area o un batch compatibile;
- produrre una nuova chiamata provider anche per combinazioni che falliranno poi sui controlli transazionali, perché alcuni controlli sono ripetuti prima e dentro la transazione.

Non esiste idempotency key, stato tentativo, contatore retry, backoff o dead-letter queue.

### Copertura test corrente

I test principali sono in `apps/api/test/ai-orchestrator.e2e-spec.ts`.

Coprono:

- generazione indipendente per area con `runAllAreas = true`;
- generazione di una singola area senza toccare le altre;
- pubblicazione dopo approval;
- archiviazione piano attivo precedente;
- blocco publish se mancano approval;
- blocco nuova proposta se il ciclo attivo precedente non è completato;
- reject della proposta e rilascio del blocco pending.

Non emerge una copertura dedicata a partial failure in mezzo a `runAllAreas`, retry, idempotenza batch o ripresa dopo crash processo.

## Modelli dati coinvolti oggi

| Modello | Uso nel batch corrente |
| --- | --- |
| `ImprovementPlanRelease` | Record principale della proposta/piano. Nasce `PENDING_APPROVAL` e `WAITING_APPROVALS`. |
| `PlanItem` | Attività generate dal provider, inizialmente `PROPOSED`. |
| `QuestionSet` | Questionario collegato al piano, inizialmente `PENDING_APPROVAL`. |
| `Question` / `AnswerOption` | Domande e opzioni generate. |
| `QuestionSetAreaApproval` | Approval professionale per area. |
| `AiContextSummary` | Riepilogo e metadati del ciclo generato. |
| `AiProposalAudit` | Audit input/output provider per proposta riuscita. |
| `CycleAuditLog` | Evento `PROPOSAL_RUN`. |
| `UserSportSelection` | Determina le aree abilitate quando `runAllAreas = true`. |
| `SportSpecializationAreaPrompt` | Driver area/prompt per specializzazione. |
| `ProfessionalUserLink` / competenze | Usati indirettamente per creare/verificare approval e ABAC. |

Non esiste oggi un modello persistente per `AiBatchJob`, `AiBatchJobItem`, attempt o queue.

## Obiettivi del modello futuro

Un modello job-based dovrebbe:

- restituire rapidamente una conferma di accettazione batch;
- rendere visibile stato e avanzamento per utente/area;
- distinguere successo, fallimento recuperabile e fallimento definitivo;
- preservare atomicità per singola area;
- evitare duplicati in caso di retry;
- registrare errori provider e errori di persistenza;
- supportare ripresa dopo restart processo;
- mantenere guard e autorizzazioni admin;
- non rendere il provider AI parte di transazioni lunghe;
- permettere test deterministici.

## Opzioni

### A. Mantenere esecuzione sincrona e documentare i limiti

Descrizione:

Continuare con `runProposalBatch` sincrono/sequenziale, migliorando solo documentazione operativa, messaggi UI e procedure manuali di retry.

Pro:

- Nessuna migrazione DB.
- Nessuna dipendenza o infrastruttura nuova.
- Nessun cambio API.
- Minima complessità.
- Comportamento attuale preservato integralmente.

Contro:

- La richiesta HTTP resta lunga e fragile.
- Timeout e disconnessioni client possono lasciare esito ambiguo.
- Persistenza parziale non è tracciata come batch.
- Nessun retry automatico.
- Nessuna ripresa dopo crash.
- Audit dei fallimenti provider non strutturato.
- Esperienza admin difficile per batch multiutente/multiarea.

Complessità di migrazione:

Bassa. È una scelta di non intervento tecnico.

Impatto operativo:

Basso nel breve periodo, ma resta alto il rischio operativo su batch grandi o provider lenti.

Strategia di test:

- Continuare con i test esistenti.
- Aggiungere, in futuro, test documentali o e2e per partial failure se il comportamento deve restare esplicitamente accettato.

### B. Tabella job interna persistente

Descrizione:

Introdurre tabelle applicative dedicate, per esempio `AiProposalBatchJob` e `AiProposalBatchJobItem`, elaborate da un worker interno al processo API o da un comando worker NestJS separato ma nello stesso codice.

Schema concettuale:

- `AiProposalBatchJob`
  - `id`
  - `requestedByAdminId`
  - `status`: `PENDING`, `RUNNING`, `PARTIAL_SUCCESS`, `COMPLETED`, `FAILED`, `CANCELLED`
  - `inputJson`
  - `createdAt`, `startedAt`, `completedAt`
  - conteggi: `totalItems`, `succeededItems`, `failedItems`

- `AiProposalBatchJobItem`
  - `id`
  - `jobId`
  - `userId`
  - `areaId`
  - `status`: `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `SKIPPED`
  - `attemptCount`
  - `lastError`
  - `planReleaseId`
  - `questionSetId`
  - `createdAt`, `startedAt`, `completedAt`

Il controller admin creerebbe un job e restituirebbe `jobId`. Un worker processerebbe item per item, chiamando una variante di `runCycleForArea` o un metodo dedicato che mantiene transazione per singola area.

Pro:

- Stato batch persistito e interrogabile.
- Ripresa possibile dopo restart.
- Partial success esplicito.
- Retry controllabile per item.
- Idempotenza più semplice tramite vincoli su `jobId/userId/areaId` e controlli pending esistenti.
- Nessuna infrastruttura esterna obbligatoria.
- Coerente con PostgreSQL già necessario all'app.
- Buona base per passare poi a Redis o worker esterni.

Contro:

- Richiede migrazione Prisma.
- Richiede nuovi endpoint di stato job.
- Richiede runner interno o processo worker.
- Serve attenzione a concorrenza e locking.
- Se eseguito nello stesso processo API, un restart interrompe il lavoro in corso anche se poi è riprendibile.

Complessità di migrazione:

Media. Si aggiungono modelli, endpoint e un worker semplice, ma senza introdurre nuova infrastruttura.

Impatto operativo:

Medio-basso. Richiede procedure per osservare job bloccati e un meccanismo di ripresa. Non richiede Redis se non già disponibile.

Strategia di test:

- Unit test su normalizzazione input in job/item.
- E2e su creazione job da endpoint admin.
- Test worker con provider stub:
  - job completato;
  - item fallito e job `PARTIAL_SUCCESS`;
  - retry item fallito;
  - idempotenza se lo stesso item viene riprocessato;
  - nessun duplicato se esiste già pending per utente/area.
- Test di recovery simulando item `RUNNING` vecchi riportati a `PENDING` o `FAILED` secondo policy.
- Test autorizzazione su endpoint stato job.

### C. Queue Redis-backed/job runner

Descrizione:

Usare Redis come coda persistente o semi-persistente, con job runner dedicato. Redis è già previsto per session store/rate limit in produzione, ma il progetto non usa ancora una libreria queue per la generazione cicli.

Pro:

- Buona separazione tra richiesta HTTP e lavoro.
- Retry, backoff e concorrenza sono concetti naturali.
- Throughput controllabile per provider AI.
- Possibilità di worker multipli.
- Redis è già previsto nell'infrastruttura production.

Contro:

- Richiede dipendenza/libreria queue o implementazione custom non banale.
- Richiede disciplina operativa su Redis, retention, retry e dead-letter.
- Stato business va comunque persistito in PostgreSQL per audit e UI.
- Se Redis viene usato come fonte primaria dello stato job, si rischia perdita o incoerenza rispetto al DB.
- Più complesso da testare in CI senza servizi esterni.

Complessità di migrazione:

Medio-alta. Richiede infrastruttura runtime, configurazione, worker e test con Redis.

Impatto operativo:

Medio-alto. Serve monitorare coda, worker, retry, latenza, backlog, dead-letter e disponibilità Redis.

Strategia di test:

- Unit test su producer/consumer.
- Integration test con Redis locale o test container.
- Test di retry/backoff e dead-letter.
- Test di idempotenza lato DB, perché la coda può consegnare più volte.
- Test di concorrenza con più worker sullo stesso utente/area.
- Test di recovery dopo restart worker.

### D. Worker system esterno

Descrizione:

Spostare la generazione in un sistema esterno dedicato, per esempio container worker separati orchestrati, servizio queue/cloud, o workflow engine.

Pro:

- Massima scalabilità.
- Separazione forte tra API e workload AI.
- Buona base per scheduling, retry avanzati, cancellazione, rate limit per provider e osservabilità.
- Meno rischio di saturare il processo API.

Contro:

- Architettura più ampia.
- Nuova infrastruttura e nuove responsabilità operative.
- Maggior lavoro di deployment e sicurezza.
- Maggior latenza di sviluppo.
- Richiede contratti stabili tra API, job store, worker e provider.
- Probabilmente prematuro rispetto allo stato attuale del prodotto.

Complessità di migrazione:

Alta.

Impatto operativo:

Alto. Richiede monitoraggio, deployment worker, gestione segreti AI, scaling e failure policy fuori dal processo API.

Strategia di test:

- Contract test tra API e worker.
- Integration test end-to-end con queue reale.
- Test di idempotenza e concorrenza.
- Test di osservabilità e failure injection.
- Test di compatibilità deploy/rollback tra versioni API e worker.

## Raccomandazione

Raccomandazione: scegliere l'opzione B, tabella job interna persistente, come primo passo.

Motivazione:

- Risolve il problema principale: stato batch persistito e leggibile.
- Rende esplicita la persistenza parziale invece di lasciarla implicita.
- Introduce retry e recovery senza imporre subito Redis queue o worker esterni.
- È coerente con l'architettura attuale basata su NestJS, Prisma e PostgreSQL.
- Mantiene la complessità proporzionata al rischio attuale.
- Lascia aperta una migrazione futura verso Redis o worker esterni usando lo stesso modello dati come fonte di verità.

Redis-backed queue o worker esterni diventano più sensati dopo aver chiarito:

- volume reale dei batch;
- durata media e p95 delle chiamate provider;
- frequenza dei fallimenti;
- necessità di concorrenza;
- requisiti di osservabilità e cancellazione.

## Piano di implementazione proposto

### Fase 0. Documentazione e metriche

Nessun cambio comportamento.

- Documentare limiti attuali.
- Misurare durata batch, numero utenti/aree, errori provider e timeout.
- Esporre agli operatori che `runAllAreas` può persistere risultati parziali.

### Fase 1. Job store persistente

Introdurre modelli Prisma per job e item.

- Creare job da input admin.
- Espandere `userIds + areaId/runAllAreas` in item deterministici.
- Salvare snapshot dell'input originale in `inputJson`.
- Aggiungere endpoint admin read-only:
  - lista job;
  - dettaglio job;
  - dettaglio item.

In questa fase il processing può ancora essere sincrono dietro feature flag interno, ma scrivendo stato job/item.

### Fase 2. Worker interno controllato

Spostare il processing fuori dal ciclo HTTP.

- Endpoint `POST /admin/orchestrator/run` crea job e restituisce `jobId`.
- Worker interno prende item `PENDING`.
- Ogni item chiama la logica per singola area.
- Ogni item mantiene transazione area-scoped.
- Stati item aggiornati a `RUNNING`, `SUCCEEDED`, `FAILED`.
- Job aggrega stato finale.

Policy iniziale consigliata:

- concorrenza bassa, anche `1`, per preservare comportamento attuale;
- nessun retry automatico per errori business;
- retry limitato per errori provider/transienti;
- errori e stack normalizzati in `lastError` senza esporre segreti.

### Fase 3. Idempotenza e recovery

Rendere sicura la ripresa.

- Vincolo logico su item `jobId/userId/areaId`.
- Prima di eseguire item, ricontrollare pending esistente.
- Se `planReleaseId` e `questionSetId` sono già salvati sull'item, non rigenerare.
- Gestire item `RUNNING` vecchi dopo restart:
  - riportarli a `PENDING` se non hanno effetti persistiti;
  - marcarli `FAILED` se lo stato è ambiguo e richiedere retry manuale;
  - ricostruire successo se esiste una proposta collegata univoca.

### Fase 4. Retry e controlli operativi

Aggiungere strumenti operativi.

- Retry manuale di singolo item fallito.
- Retry automatico con massimo tentativi per errori classificati transienti.
- Cancellazione job solo per item non iniziati.
- Rate limit per provider.
- Dashboard admin con progresso, errori e link ai cicli creati.

### Fase 5. Eventuale queue esterna

Valutare Redis queue o worker esterno solo se emergono colli di bottiglia.

Il DB job store deve restare fonte di verità. La coda deve essere meccanismo di consegna, non unico archivio dello stato.

## Invarianti da preservare

- Non chiamare provider AI dentro una transazione lunga.
- Conservare atomicità per singola area.
- Non generare due pending per stesso utente/area.
- Non indebolire controlli su utente attivo, ruolo, consenso AI e ciclo precedente.
- Non pubblicare automaticamente una proposta generata dal job.
- Continuare a richiedere approval professionale e publish secondo le regole attuali.
- Non esporre dettagli sensibili del provider negli errori UI.

## Domande aperte

- Il batch deve essere considerato riuscito se alcuni item falliscono e altri riescono?
- Quali errori sono retryable: timeout provider, rate limit, rete, validazione output AI?
- Quanti tentativi massimi sono accettabili per provider esterno?
- Serve cancellazione job da UI?
- Serve priorità tra batch o tra utenti?
- Quanta concorrenza è consentita senza violare limiti provider/costi?
- Gli audit dei fallimenti provider devono usare `AiProposalAudit` anche senza `planReleaseId`?
- Serve una retention policy per job/item completati?
- Quale ruolo oltre `ADMIN`, se presente, può vedere job e dettagli errore?
- L'auto-publish da `refreshCycleReadiness` dopo approval professional è intenzionale o va separato prima di introdurre worker?

## Decisione proposta

Adottare un percorso incrementale:

1. mantenere temporaneamente il comportamento sincrono corrente;
2. introdurre job store persistente come fonte di verità;
3. spostare l'esecuzione su worker interno con concorrenza iniziale pari a uno;
4. aggiungere retry/recovery;
5. valutare Redis o worker esterni solo dopo dati operativi reali.

Questa scelta riduce il rischio senza anticipare infrastruttura non ancora necessaria.
