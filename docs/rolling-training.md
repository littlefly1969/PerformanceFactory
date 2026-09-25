# Programmi con finestre adattive di 14 giorni

Il programma scelto dall'atleta resta di **4, 12 o 52 settimane**. Ogni release nuova copre 14 giorni: rispettivamente 2, 6 o 26 finestre per macroblocco. Al termine del macroblocco il percorso continua con un nuovo blocco della stessa durata, ricalcolando dal contesto aggiornato. Non vengono generati mesi di allenamenti in anticipo.

## Disponibilità e vincoli

La discovery configurabile aggiunge due domande: `training_days_available` (1–7 giorni) e `training_session_duration` (30, 45, 60, 90, 120+ minuti). 120+ viene trattato come limite conservativo di 120 minuti. La frequenza abituale rimane un dato distinto: `general_training_frequency` supporta i valori 0_1 / 2_3 / 4_5 / 6_PLUS e i valori testuali della discovery precedente.

`TrainingConstraintsService` legge profilo e `AthleteDiscovery.programDurationWeeks`. Non modifica la durata già scelta. Per atleti precedenti alla discovery usa l'orizzonte salvato nel profilo; non inventa durata o disponibilità mancanti. `/user/profile` permette di completare e aggiornare questi dati, mantenendo immutabile la configurazione accettata alla registrazione. Una richiesta già salvata riparte automaticamente dopo il completamento dei dati. API personali: GET/POST `/athlete/training/availability`.

Regola iniziale:

- massimo settimanale = min(giorni disponibili, massimo della frequenza abituale + 1, 7);
- minimo settimanale = min(massimo consentito, max(1, minimo della frequenza abituale));
- eventuali giorni preferiti ISO restringono ulteriormente il perimetro.

Nei successivi cicli rolling la policy considera quanto è stato realmente completato: aderenza sotto il 75% limita il massimo al numero medio di sessioni completate per settimana, arrotondato in alto e almeno 1. Rating medio ≤2/5 o check-in medio <50/100 riducono di uno il massimo della finestra precedente. Negli altri casi è consentito al massimo un incremento di una sessione settimanale, sempre entro disponibilità. Sono regole iniziali di prodotto, non prescrizioni cliniche: note, check-in, sport, obiettivo e stato di performance restano nel contesto AI per scegliere lavoro e distribuzione entro questi limiti.

Le modifiche al profilo valgono per le generazioni successive; non riscrivono i calendari già pubblicati.

## Contratto AI e calendario

`generateTrainingProposal()` usa un contratto, prompt e normalizzatore dedicati. OpenAI e Gemini condividono il trasporto già usato dalle proposte AREA. Il contratto AREA rimane a 1–3 item; quello TRAINING ammette fino a 14 sessioni, secondo i vincoli dell'atleta.

Ogni sessione richiede `dayOffset` 0–13 e `durationMinutes`. Attrezzatura, serie, ripetizioni e recupero opzionali vengono salvati nel `TrainingPlanItem.metadata` esistente. La validazione rifiuta giorni duplicati/fuori finestra, durata e carico eccessivi, dettagli invalidi e frequenze incoerenti. Il minimo vale per ciascuna delle due settimane relative alla finestra; il massimo anche per ogni intervallo di sette giorni consecutivi. Sono ammesse settimane diverse (ad esempio 3+4): `sessionsPerWeek` riporta il maggiore dei due conteggi.

`TrainingPlanRelease` aggiunge `startsOn`, `endsOn` (date senza orario) e `windowDays=14`. `previousReleaseId` e i vincoli di unicità provengono dalla slice lifecycle. Prima finestra: oggi in Europe/Rome, fino a oggi+13. Successiva: max(fine precedente+1, oggi), fino a partenza+13.

`createTrainingSessions()` continua a materializzare le sessioni, ma per le release rolling usa `startsOn + dayOffset`. Una schedule assente o invalida è un errore; non viene distribuito il lavoro automaticamente. Le release storiche senza `startsOn` conservano il precedente fallback su sette giorni e le sessioni già persistite.

Il calendario PF4 `/user/training` unisce `TrainingSession` e le sedute delle aree a calendario ([Aree a calendario](area-training-calendar.md)), che riusano la finestra del programma sportivo occupando i giorni liberi o, se mancano, affiancando brevemente le sessioni sportive. La home aggiunge intervallo corrente, numero finestra nel macroblocco e frequenza; i dettagli delle sessioni mostrano immediatamente i metadata utili.

## Rinnovo e recupero

`CycleCompletionService.reconcileTrainingLifecycle(userId)` è usato sia dagli eventi sessione/check-in sia dallo sweep persistente del lifecycle. Chiude solo quando:

1. tutte le sessioni sono COMPLETED o SKIPPED;
2. il check-in è CLOSED;
3. oggi in Europe/Rome è almeno `endsOn`.

Chi finisce prima vede una conferma con la data di fine finestra. Non inizia un nuovo carico in anticipo. Il worker esegue lo sweep ogni 15 secondi: il rinnovo non richiede che l'atleta ritorni sul sito o effettui un altro click. La release successiva può essere pronta il giorno `endsOn`, ma le sue sessioni iniziano dal giorno seguente o da oggi se la generazione è in ritardo.

Restano un'unica pipeline AUTO/MANUAL, assegnazione coach, retry persistenti, protezione dalle richieste concorrenti e audit. Un errore della nuova generazione lascia il ciclo precedente chiuso e il comando successivo salvato; un errore di pubblicazione riprende senza interrogare di nuovo l'AI. Il limite già documentato sulle chiamate esterne dopo un crash prima della persistenza rimane invariato.

## Migrazione e prove

`20260923090000_rolling_training` aggiunge tre colonne, un vincolo sulla finestra e un indice per lo sweep; inserisce le domande senza sovrascrivere configurazioni con le stesse chiavi. Non sposta le date dei calendari esistenti.

Test principali:

- `training-proposal.spec.ts`: frequenza/aderenza, 4/12/52 settimane, DST, avanzamento macroblocco, schema e output OpenAI/Gemini, sette sessioni, validazioni e separazione AREA;
- `training-lifecycle.integration-spec.ts`: richieste concorrenti, esecuzione/check-in anticipati senza rinnovo, sweep a fine finestra, seconda AI con feedback, AUTO/MANUAL, retry;
- `rolling-training.integration-spec.ts`: disponibilità mancante e recupero via HTTP, ownership, durata macro invariata, sette date reali fino al giorno 13, metadata e idempotenza del calendario;
- test discovery: i nuovi dati arrivano davvero nel profilo dopo l'onboarding;
- test PF4: attesa fine finestra, richiesta di completare il profilo e salvataggio della disponibilità.

Comandi: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:infra`; database isolato con `pnpm test:docker` oppure `TEST_DATABASE_URL=...performancefactory_test pnpm --filter api test:db`.

Verifica del 23 settembre 2026: lint e typecheck superati (due warning lint preesistenti), build API/web riuscite, 113 test unitari API, 68 e2e API, 72 frontend, 46 integrazioni PostgreSQL e 5 test infrastruttura superati. Controllo browser a 390 e 1440 px su home, calendario, sessione, profilo e attesa fine finestra: nessun errore, salvataggio disponibilità verificato. I controlli browser usano risposte HTTP simulate; i test database esercitano persistenza e API reali con provider AI controllato. Le chiamate OpenAI/Gemini sono verificate con trasporto simulato, senza generazioni a pagamento in produzione.
