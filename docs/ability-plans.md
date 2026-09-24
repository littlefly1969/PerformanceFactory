# Slice: piani per tutte le abilità

## Risultato

La richiesta «Prepara il mio piano» accoda ora, nella stessa transazione del programma sportivo, un piano AREA per ciascuna abilità attiva e abilitata della specializzazione scelta. Un atleta con programma già presente può usare «Prepara i piani mancanti» in `/user/abilities`. La navigazione PF4 espone **Abilità** su desktop e mobile.

La pagina mostra lo stato di ogni area, gli esercizi pubblicati e i collegamenti alle attività con feedback e al relativo questionario. Ogni piano diventa visibile appena pubblicato: un errore su una singola area non nasconde le altre. I piani in review non espongono esercizi non approvati.

Per Padel/STANDARD le aree attualmente configurate sono allenamento mentale, equipaggiamento, fisioterapia, nutrizione, preparazione atletica e tecnico-tattica. La lista non è codificata nel frontend: deriva da `SportSpecializationAreaPrompt.isActive` e `isEnabledDriver`. Nessuna area disabilitata o appartenente solo ad altri sport viene aggiunta tramite fallback.

## Pipeline e compatibilità

`AbilityPlansService` salva un `AbilityPlanOperation` per atleta/area/ciclo precedente. La tabella è una coda di richieste, non un nuovo modello di piano. `ImprovementPlanRelease`, `PlanItem`, `QuestionSet`, il contratto AREA da 1–3 attività e il provider AI esistente restano le fonti di verità. La persistenza comune è estratta in `cycle-persistence.ts` e viene usata anche dai comandi amministrativi preesistenti.

Il worker esegue un massimo di due operazioni contemporaneamente, con lease di 90 secondi, heartbeat ogni 10 secondi, sweep ogni 15 secondi e retry progressivo fino a cinque minuti. Verifica profilo completo, obiettivo, consensi correnti e abilità ancora abilitata prima della generazione. Il salvataggio controlla la proprietà della lease; richiesta ripetuta, worker concorrente o riavvio non producono due piani persistiti per la stessa operazione. Un errore dopo la persistenza riprende approvazione/pubblicazione senza un'altra chiamata AI.

Un crash dopo la risposta esterna ma prima della persistenza può comportare una nuova chiamata al provider. L'unicità garantita riguarda i risultati persistiti.

Le aree usano `ProfessionalUserLink` e `ProfessionalAreaCompetence`, distinti dalle competenze del coach sportivo. Si conserva un collegamento valido; in sua assenza si sceglie il professionista attivo competente con meno atleti attivi distinti, poi data creazione e ID. Un collegamento invalido richiede correzione esplicita. Se manca un professionista la richiesta resta salvata e riparte quando la configurazione è disponibile. Non vengono inventate nuove competenze.

## Approvazione

- `ABILITY_APPROVAL_MODE=AUTO` (default): approvazione e pubblicazione automatiche mediante la pubblicazione AREA esistente; `approvalSource=SYSTEM`, data e audit, senza attribuire una firma umana fittizia.
- `ABILITY_APPROVAL_MODE=MANUAL`: review mediante gli strumenti professionali esistenti e la stessa pubblicazione. La policy viene fissata all'accodamento.
- `ABILITY_PLANS_WORKER=false`: sospende il worker; le richieste restano persistite.

Un piano già attivo o in revisione viene preservato, anche quando viene richiesta nuovamente la preparazione. Una proposta rifiutata rimane da rivedere col professionista e non viene automaticamente rigenerata. Le scritture professionali verificano ancora lo stato pending per impedire che una review iniziata prima della pubblicazione sovrascriva il risultato automatico.

## API e scope

- `POST /athlete/abilities/request` (202): atleta autenticato, accoda o riprende le aree mancanti usando esclusivamente il proprio ID.
- `GET /athlete/abilities`: stato personale per area (`EMPTY`, `PREPARING`, `READY`, `REVIEW`, `ERROR`, `COMPLETED`, `REJECTED`), piano pubblicato ed eventuale retry.

La migrazione aggiunge la coda e due campi di provenienza approvazione su `ImprovementPlanRelease`; non modifica piani preesistenti. Nessun backfill globale a pagamento durante il deploy: gli utenti esistenti attivano la preparazione dalla pagina Abilità.

Questa slice prepara tutte le abilità e ne rende accessibili attività e check-in. Le aree con `isScheduled` producono invece sedute datate nel calendario dell'atleta, sulla finestra del programma sportivo e nei soli giorni liberi: si veda [Aree a calendario](area-training-calendar.md). Per tutte le altre aree resta vero quanto sopra: nessuna data, nessuna finestra di 14 giorni e il workflow di rinnovo esistente. Il carico non viene comunque sommato in silenzio, perché le sedute di area restano dentro i giorni settimanali dichiarati dall'atleta.

## Verifica

`test/db/ability-plans.integration-spec.ts` usa PostgreSQL reale per richieste concorrenti, sei aree abilitate e una disabilitata, pubblicazione AUTO, review MANUAL, unicità, retry isolati, ripresa della pubblicazione senza AI, lease persa, professionisti mancanti, consensi e ownership. I test frontend verificano navigazione, esercizi, check-in dell'area corretta e richiesta dei soli piani mancanti. Il provider è controllato nei test, senza consumi esterni.

Comandi: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `TEST_DATABASE_URL=...performancefactory_test pnpm --filter api test:db`, `pnpm build`, `pnpm test:infra`.

Verifica del 23 settembre 2026: lint e typecheck passati (due warning lint preesistenti); 113 test unitari API, 68 e2e API, 74 frontend, 56 integrazioni PostgreSQL e 5 infrastruttura superati. Build API/web riuscite. Browser Chromium a 390 e 1440 px: sei abilità, apertura esercizi, link al check-in corretto e una sola richiesta POST; nessun errore JavaScript o overflow. Le prove browser usano risposte HTTP simulate, mentre le integrazioni database esercitano i servizi reali con provider controllato.
