# Ciclo continuo di allenamento

L'atleta completa discovery, consensi e onboarding, poi usa **Prepara il mio piano** in `/user`. La richiesta HTTP viene salvata subito; il worker API la elabora entro il prossimo intervallo (15 secondi). Il coach vede piani e feedback in `/professional/training`.

## Un'unica pipeline

`TrainingLifecycleOrchestrator` usa assegnazione coach, `TrainingContextService`, l'esistente `AiProposalProviderService`, persistenza proposta, approvazione e pubblicazione. Il comando iniziale e quello successivo percorrono la stessa `generateAndPublishCycle`. Anche il comando amministrativo di generazione training passa da questa pipeline; ora accoda la richiesta e restituisce lo stato, anziché aspettare il provider.

`TrainingPlanRelease.cycleStatus` rimane l'unico stato del piano: PROPOSED, WAITING_APPROVALS, READY_TO_PUBLISH, PUBLISHED, CLOSED. `TrainingLifecycleOperation` è una coda persistente di comandi con chiave univoca, lease e prossimo tentativo; non rappresenta un secondo piano. Consente di registrare richieste ed errori prima che esista una proposta valida. Le operazioni possono essere elaborate da più repliche API: il claim atomico impedisce elaborazioni concorrenti della stessa richiesta.

Il coach attivo e competente già assegnato viene mantenuto. Altrimenti si sceglie il coach competente con meno atleti attivi distinti, poi data di creazione e ID. Un'associazione già presente ma non più valida richiede una sostituzione esplicita. In assenza di coach compatibili la richiesta rimane salvata con `COACH_ASSIGNMENT_UNAVAILABLE`; aggiungere una competenza a un coach attivo permette al prossimo tentativo di proseguire senza un'altra richiesta atleta.

## Configurazione

| Variabile | Default | Effetto |
| --- | --- | --- |
| TRAINING_LIFECYCLE_AUTOMATION | true | Abilita richieste, worker e chiusura automatica |
| TRAINING_APPROVAL_MODE | AUTO | AUTO oppure MANUAL, fissato quando si accoda il comando |
| TRAINING_SESSION_APPROVAL_MODE | INHERIT_PLAN | Unica policy sessioni supportata in questa slice |
| COACH_AUTO_ASSIGNMENT | true | Consente nuove assegnazioni, mantiene comunque quelle valide |
| NEXT_CYCLE_AUTO_GENERATION | true | Accoda automaticamente il successore alla chiusura |
| TRAINING_LIFECYCLE_WORKER | true | Esegue i comandi e recupera chiusure interrotte; false per pausa operativa |

In AUTO le approvazioni riportano `approvalSource=SYSTEM`, data e approvatore utente nullo. Non viene inventata un'identità professionale. In MANUAL il coach assegnato o un amministratore approva da `POST /training/lifecycle/releases/:id/approve`; restano disponibili anche le review esistenti. Entrambi i percorsi usano la medesima pubblicazione transazionale. Cambiare la policy non modifica le richieste già accodate.

La pubblicazione verifica il numero di sessioni del calendario, pubblica il questionario e completa il comando nella stessa transazione. Tutte le sessioni ereditano l'approvazione del piano. Una ripetizione non duplica sessioni o audit.

## Chiusura e contesto

Ogni sessione deve essere completata o esplicitamente saltata. Quando anche il check-in di training è stato inviato, `CycleCompletionService` chiude il ciclo e accoda il successivo nella stessa transazione. Non chiama l'AI nel controller né durante questa transazione. Il worker riprende anche una chiusura mancata a causa di un riavvio fra salvataggio del feedback e valutazione del ciclo.

Il secondo prompt contiene contesto iniziale, obiettivo, onboarding, ultimo snapshot disponibile, stato corrente, metriche disponibili, storico e sintesi AI, insieme a tutte le sessioni del ciclo chiuso, relativi esiti/feedback e risposte del check-in. Il contesto viene riletto dopo la chiusura. Il check-in training non modifica arbitrariamente i punteggi del profilo: restano quelli effettivamente persistiti dal sistema di scoring esistente.

## API e ripresa

- `POST /training/lifecycle/request`: solo atleta autenticato, risposta 202, richiesta idempotente. Richiede onboarding completo, obiettivo e consensi correnti.
- `GET /training/lifecycle/current`: solo stato personale, `EMPTY`, `PREPARING`, `READY`, `IN_PROGRESS`, `COMPLETED`, `ERROR`; include `cycleId`, `preparingNext`, `retryScheduled`, `requestAllowed` e codice errore diagnostico. L'interfaccia non mostra codici interni.
- `GET /training/lifecycle/coach/plans`: piani e feedback degli atleti assegnati; amministratori possono vedere tutti i piani.

Gli errori sono persistiti e riprovati con intervallo crescente da 15 secondi a 5 minuti. `resumeLifecycle(operationId)` riprende dall'ultimo risultato salvato. Un fallimento della pubblicazione non richiama il provider. Una lease scade dopo 90 secondi senza heartbeat; la persistenza della proposta verifica che la lease appartenga ancora al worker.

Vincoli DB: un comando per `userId + previousReleaseId` (INITIAL per il primo), un successore per release, un solo ciclo gestito non chiuso per atleta, una sessione per item. Lock PostgreSQL e transazioni proteggono assegnazione, generazione, approvazione, pubblicazione e chiusura.

Un crash dopo la risposta del provider ma prima del salvataggio può richiedere una nuova chiamata esterna. È garantita l'unicità dei risultati persistiti, non l'esecuzione esattamente una volta del servizio esterno. Le risposte AI invalide non diventano piani parziali.

## Migrazione e verifica

`20260922090000_training_lifecycle` aggiunge metadati approvazione, relazione fra cicli, coda e audit. Include l'ultimo piano ACTIVE/PUBLISHED già esistente nel lifecycle, preservando contenuto e approvazioni. I piani preesistenti in attesa vengono adottati quando viene richiesta la loro preparazione.

Test PostgreSQL in `apps/api/test/db/training-lifecycle.integration-spec.ts`: percorso HTTP autenticato completo fino alla seconda AI, selezione coach, doppie richieste/worker/completamenti/pubblicazioni, ownership, check-in obbligatorio, contesto aggiornato, AUTO/MANUAL, errori provider/output/pubblicazione e lease scadute. Il provider è quello esistente in modalità stub deterministica; i test non consumano un servizio AI esterno.

Esecuzione consigliata: `pnpm test:docker`. Con un PostgreSQL locale dedicato: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/performancefactory_test pnpm --filter api test:db`. Completare con `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Verifica della slice (22 settembre 2026): lint e typecheck riusciti; 90 test unitari API, 68 test API e2e, 69 test web e 39 verifiche PostgreSQL (29 preesistenti + 10 lifecycle); build API/web e 5 test infrastruttura riusciti. Browser Chromium: home EMPTY/PREPARING/ERROR e portale coach a 390 e 1440 px, nessun errore JavaScript o overflow, una sola richiesta POST dalla CTA. Restano due avvisi lint preesistenti in onboarding web e nel helper Google dei test.
