# Dashboard registrazioni e log AI

Le nuove voci **Dashboard** e **Log chiamate AI** sono disponibili nel menu amministratore. Tutte le nuove API sono in sola lettura e richiedono il ruolo ADMIN; gli AI_TUNER non hanno accesso. Il percorso dell'atleta, i prompt, i criteri di valutazione, i timeout e la politica di retry non cambiano.

## Registrazioni

`GET /admin/analytics/registrations?days=30` (1–90 giorni) usa gli eventi AnalyticsEvent già esistenti. Il giorno corrente è incluso e tutti i giorni senza eventi sono restituiti con zero. I confini dei giorni seguono Europe/Rome, inclusa l'ora legale.

- Avviate: anonymousId distinti con registration_started CLIENT nel periodo, assegnati alla prima apertura del modulo nel periodo.
- Non completate: il sottoinsieme delle avviate senza registration_completed SERVER collegato allo stesso anonymousId, successivo o contemporaneo al primo avvio del periodo e precedente all'aggiornamento. Un completamento precedente a quel primo avvio non chiude un nuovo tentativo. La deduplica resta per browser e per periodo: più tentativi dello stesso browser non sono separati in sessioni. Sono aperture senza completamento osservato, non persone online o una misura certa di abbandono.
- Account creati: userId distinti per giorno sugli eventi registration_completed SERVER. Il completamento può provenire da un'apertura precedente al periodo o da un browser senza tracciamento; non si sottraggono semplicemente i due totali.

Browser diversi, storage cancellato, tracciamento bloccato e anonimato limitano il collegamento. Le cancellazioni degli utenti possono cancellare anche gli eventi collegati secondo le relazioni preesistenti. Non si ricostruiscono dati mancanti. La dashboard si aggiorna ogni minuto dopo il completamento della lettura; gli errori sono espliciti e i dati precedenti vengono marcati come tali.

## Chiamate AI

`GET /admin/ai-logs` accetta days (1–30), page, pageSize (25/50/100), provider, operation, status e id UUID. La paginazione e i filtri sono applicati dal server, i conteggi si riferiscono ai filtri attivi. `GET /admin/ai-logs/:id` restituisce i tentativi HTTP ordinati.

AiOperationLog registra l'esito dell'intera operazione, comprese lettura e validazione del risultato. AiHttpAttempt registra ciascuna richiesta al provider, compresi retry di trasporto e nuove generazioni per output non valido. HTTP 200 può quindi accompagnarsi a un'operazione fallita. Un'operazione riuscita può aver recuperato errori o output invalidi precedenti. Le simulazioni stub non producono richieste HTTP.

Sono coperti tutti i metodi di generazione/valutazione di AiProposalProviderService, inclusi domande iniziali e di calibrazione, micro-test, potenziale, valutazione, proposte, obiettivi, riepiloghi e test prompt. I contatori espliciti di output non valido coprono domande iniziali, calibrazione, micro-test e valutazione. Altri errori di elaborazione dopo HTTP riuscito sono indicati come OUTPUT_ERROR. Lo storico inizia dal rilascio: i fallimenti precedenti non sono recuperabili.

Si salvano ID tecnici di operazione, tipo, provider/modello, tempi, stato, codice di errore da elenco chiuso, HTTP status e conteggio degli output respinti e categorie fisse dei controlli falliti (JSON, opzioni, punteggi, duplicati, lunghezza, driver, numero di elementi o struttura). I messaggi di validazione grezzi non vengono salvati. Non si salvano URL del provider, header, chiavi, prompt, risposte, messaggi grezzi del provider, ID utente o dati dell'atleta. L'ID della singola operazione è ricercabile nella UI; tempo e tipo permettono di circoscrivere un problema senza esporre dati personali.

Un'operazione senza esito dopo un'ora è presentata come **Senza esito**, non come successo o fallimento confermato. Un arresto del processo può lasciare questi record. La persistenza è accodata in memoria, fuori dal percorso di risposta dell'atleta, in una FIFO con al massimo 500 scritture pendenti e una sola query in esecuzione. Creazione, tentativi e risultato sono scritti in ordine; i tempi salvati descrivono gli eventi applicativi, non il ritardo della coda. Nessuna richiesta AI attende le query della telemetria, anche se una promessa DB resta pendente. In caso di saturazione vengono scartate le scritture in eccesso; in caso di riavvio improvviso possono andare perse quelle non ancora persistite. Alla chiusura ordinata si attende lo svuotamento per al massimo un secondo. Errori, ritardi e saturazione della telemetria non cambiano il risultato AI: nel log del servizio compare AI_TELEMETRY_WRITE_FAILED. In questo caso lo storico può essere incompleto. Lo storico non sostituisce i log di avvio/infrastruttura del container.

## Rilascio e politica dei dati

Applicare la migrazione Prisma inclusa con il consueto deploy (`pnpm --filter api prisma:migrate:deploy`) prima di avviare la nuova API. La migrazione aggiunge solo le due tabelle operative e relativi indici, senza cancellare o riscrivere dati di dominio. Non serve azzerare gli utenti di collaudo né le lezioni.

Politica proposta e implementata: conservare gli ultimi **30 giorni** di log AI. La pulizia parte all'avvio del modulo e ogni ora, cancellando in cascata i tentativi; le API escludono comunque i dati scaduti. Nessuna nuova cancellazione automatica degli eventi di registrazione. Aggiornamento dei log manuale oppure ogni 15 secondi, attivabile dalla UI e senza richieste sovrapposte. Dopo il deploy verificare con un admin una generazione valida e un errore di collaudo e controllare il dettaglio. Non occorre provocare errori su account reali.
