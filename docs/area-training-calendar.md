# Aree a calendario

## Risultato

Un'area può ora produrre **sedute datate** invece di un elenco di attività senza
giorno. La preparazione atletica è la prima area configurata così: le sue sedute
compaiono in `/user/training` accanto alle sessioni sportive, con la stessa
scheda, lo stesso dettaglio e lo stesso flusso di completamento.

La proprietà non è cablata nel codice: deriva da
`SportSpecializationAreaPrompt.isScheduled`. L'AI Tuner la vede nella lista
prompt sport-area e la imposta con `POST /ai-tuning/sports`
(`specializations[].prompts[].isScheduled`). Un salvataggio che non include il
campo lascia il valore invariato, quindi modificare un prompt non spegne il
calendario di un'area.

Il seed imposta il flag solo nei database appena creati. I deploy eseguono
soltanto `prisma migrate deploy`, quindi la migrazione
`20260924150000_area_schedule_backfill` accende `isScheduled` sulla preparazione
atletica anche nei database esistenti.

## Finestra e rinnovo

L'area a calendario **non ha una finestra propria**: eredita quella del
programma sportivo. `ImprovementPlanRelease` porta `startsOn`, `endsOn`,
`windowDays` e `trainingReleaseId`, che punta alla release sportiva di
riferimento.

La generazione parte solo **dopo** la pubblicazione della finestra sportiva,
perché serve sapere quali giorni sono già occupati. Il lifecycle accoda una
richiesta per area a calendario subito dopo la pubblicazione, sia nel percorso
AUTO sia dopo l'approvazione manuale del coach. Ogni rinnovo del programma
sportivo genera così la finestra successiva dell'area, senza che l'atleta debba
chiedere nulla: il pulsante «Prepara i piani mancanti» riguarda le sole aree non
schedulate.

Un vincolo di unicità su `(userId, areaId, trainingReleaseId)` e la
`generationKey` `userId:areaId:window:releaseId` garantiscono una sola release
per area e finestra, anche con worker concorrenti o richieste ripetute.

Finché la finestra precedente dell'area è in corso non se ne genera una nuova.
Quando la finestra è conclusa la successiva parte comunque: le sedute non svolte
restano nello storico come non svolte e non bloccano il ciclo seguente. Le aree
senza `startsOn` conservano la regola precedente, che pretende attività
completate e questionario chiuso. Fa eccezione il passaggio a calendario:
un elenco senza date nato prima che l'area diventasse schedulata non blocca la
prima finestra, che alla pubblicazione lo archivia come ogni release sostituita.
Un atleta già attivo riceve la prima finestra al successivo rinnovo del programma
sportivo, perché l'accodamento parte solo dalla pubblicazione sportiva.

## Carico: giorni liberi, altrimenti accanto allo sport

Dove possibile le sedute di area non condividono la giornata con una sessione
sportiva. `freeDayOffsets()` parte dai 14 giorni della finestra e toglie:

- i giorni con una sessione sportiva già a calendario;
- i giorni fuori dai giorni preferiti dell'atleta, quando sono configurati;
- i giorni già passati.

`areaScheduleDays()` decide poi settimana per settimana. La capienza sui giorni
liberi è il minore fra i giorni liberi di quella settimana e i **giorni ancora
disponibili**, cioè `training_days_available` meno le sessioni sportive della
stessa settimana. Se è positiva, l'area usa i giorni liberi.

Se è zero, per esempio con due giorni dichiarati e due sedute di padel, l'area
**affianca le sessioni sportive** future della settimana (`sharedDayOffsets`),
con una seduta breve di attivazione o prevenzione di al massimo
`AREA_SHARED_DAY_MINUTES` (20 minuti). In entrambi i casi la preparazione
atletica non aggiunge giorni di allenamento oltre quelli dichiarati.
`areaPrescription()` ricava minimo e massimo settimanali dalla capienza di ogni
settimana.

Il tetto dell'area è di tre sedute a settimana (`AREA_FREQUENCY`), sempre entro
la capienza. Si applica la stessa politica di aderenza del programma sportivo:
sotto il 75% di completamento il massimo scende alla media di sedute realmente
svolte; rating medio ≤2/5 o check-in medio <50/100 tolgono una seduta.

Se una settimana della finestra non ha né giorni liberi utilizzabili né sessioni
sportive future, per esempio perché è già trascorsa, la richiesta fallisce con
`AREA_SCHEDULE_NO_FREE_DAYS` e non viene creato nulla. La richiesta resta in coda
e riparte: alla finestra successiva la distribuzione può essere diversa.

## Contratto AI e persistenza

`area-schedule-v2` è un contratto dedicato: stessa forma del contratto TRAINING
(`dayOffset`, `durationMinutes`, attrezzatura, serie, ripetizioni, recupero) ma
con i `dayOffset` ammessi ristretti per enum ai giorni liberi e ai giorni
condivisi della finestra. La validazione ripete i controlli condivisi — durata
entro la disponibilità, min e max per settimana relativa, massimo su ogni
intervallo di sette giorni, nessun giorno duplicato. In più rifiuta qualunque
altro giorno occupato dallo sport e, nei giorni condivisi, una durata oltre
`AREA_SHARED_DAY_MINUTES`, anche se il modello la proponesse comunque. La v1
ammetteva i soli giorni liberi.

La proposta viene normalizzata in un `CycleProposal` ordinario: la schedulazione
viaggia in `PlanItem.metadata.schedule.dayOffset`, come già fa il programma
sportivo. Persistenza, approvazione AUTO/MANUAL, pubblicazione, check-in e
assegnazione del professionista restano quelle AREA esistenti; non c'è un
secondo lifecycle da mantenere.

Alla pubblicazione, `createAreaSessions()` materializza un `AreaSession` per
attività, nella stessa transazione, con `skipDuplicates`: una ripubblicazione non
crea occorrenze doppie e non perde gli esiti già registrati.

## Calendario e completamento

`GET /athlete/training/calendar` unisce le due sorgenti e ordina per data, poi
per traccia, poi per sequenza. Ogni sessione porta `track` (`SPORT` o `AREA`) e
`areaName`, che il frontend mostra sulla scheda. Il dettaglio sessione e le
azioni di completamento usano le rotte esistenti: `GET`, `complete` e `skip`
cercano prima fra le sessioni sportive e poi fra quelle di area, quindi il
frontend non distingue i due casi.

Chiudere una seduta di area aggiorna l'occorrenza e la sua attività in una sola
transazione e scrive l'audit, **senza** toccare il ciclo sportivo: non anticipa
né ritarda il rinnovo della finestra. La pagina Abilità mostra per queste aree
l'intervallo della finestra, le sedute svolte sul totale e il collegamento
diretto al calendario.

## Verifica

`src/ai-orchestrator/area-schedule.spec.ts` copre:

- giorni liberi, esclusione dei giorni occupati e non preferiti e capienza residua;
- giorni condivisi quando i giorni dichiarati sono già allenati, anche misti
  settimana per settimana e senza giorni sportivi passati;
- tetto d'area e riduzione per bassa aderenza;
- rifiuto di una seduta in un giorno occupato, di una durata oltre la
  disponibilità e di una seduta lunga in un giorno condiviso;
- la generazione con provider controllato, anche sui giorni condivisi.

`test/db/area-schedule.integration-spec.ts` esercita su PostgreSQL reale:
accodamento solo dopo la pubblicazione sportiva, sedute nei soli giorni liberi,
calendario con entrambe le tracce, completamento che non tocca il ciclo sportivo,
assenza di doppioni con worker concorrenti, sedute brevi nei giorni sportivi
quando i giorni dichiarati sono tutti allenati e sostituzione dell'elenco nato
prima del passaggio a calendario.

I test frontend verificano la scheda di area nel calendario e, nella pagina
Abilità, la finestra con il collegamento al calendario e l'assenza della
richiesta manuale per le aree schedulate.

Comandi: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
`TEST_DATABASE_URL=...performancefactory_test pnpm --filter api test:db` oppure
`pnpm test:docker` per le integrazioni PostgreSQL.
