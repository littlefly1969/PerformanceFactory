# Specifica: ritorno al riepilogo dopo la calibrazione

Stato: incarico concordato per l'agente; questa PR contiene soltanto la
specifica. Implementazione e test applicativi devono essere aggiunti prima
del merge della funzionalità.

Analisi del 28/10/2026 su `main` al commit
`bf4b9d0968dfd6004a29741c1ca702de818f3273`, dopo il merge della gestione account.

## Problema e obiettivo

Dopo le attività che affinano la valutazione prima dell'attivazione degli
allenamenti, l'atleta resta dentro la calibrazione o nel risultato del
micro-test. Deve ritrovare manualmente la vista generale per capire come
sono cambiati valutazione e affidabilità, se la lezione gratuita è sbloccata
e quale passo può fare ora.

Rendere il completamento di ogni attività un ritorno comprensibile alla
situazione generale, con dati aggiornati e un prossimo passo coerente con
lo stato restituito dal backend. Conservare schermate, componenti e stile
Performance Factory esistenti: il lavoro riguarda navigazione, conferme,
azioni e gestione degli stati, non una riprogettazione grafica.

## Rilievi e file da esaminare

| Flusso | File | Comportamento attuale |
| --- | --- | --- |
| Round di domande | `apps/web/app/journey/calibrazione/page.tsx` | Dopo `calibration/answers` chiude il questionario con `setAnswering(false)` e resta nello stato di calibrazione. |
| Errore nell'invio | stesso file; `apps/web/app/journey/use-journey.ts` | `action()` restituisce `false` quando fallisce, ma il `.then()` chiude comunque il questionario: alla riapertura si perdono le selezioni locali non salvate. |
| Micro-test | `apps/web/app/journey/coach/page.tsx`, `apps/web/app/journey/coach/micro-test.tsx` | Dopo l'invio resta su `/journey/coach?round=...`; il risultato propone come azione principale «Continua la calibrazione». |
| Home gratuita | `apps/web/app/journey/_account/account-home.tsx` | Distingue calibrazione chiusa e micro-test aperto, altrimenti propone calibrazione. Non rappresenta direttamente l'attesa della lezione. |
| Riepilogo più completo | `apps/web/app/journey/profilo/page.tsx`, `apps/web/app/journey/_account/lesson-card.tsx` | Contiene R, intervallo, affidabilità, Spider e stato della lezione gratuita: è la vista generale più completa già disponibile. |
| Lezione e circolo | `apps/web/app/journey/circolo/page.tsx` | Aggiorna lo stato dopo richiesta o rinuncia, ma manca un ritorno conclusivo evidente alla vista generale. |
| Scenari e piano | `apps/web/app/journey/scenari/page.tsx`, `apps/web/app/journey/piano/page.tsx` | Sequenza sostanzialmente coerente; «Non ora» torna già al profilo sportivo. |
| Checkout e attesa | `apps/web/app/journey/checkout/page.tsx`, `apps/web/app/abbonamento/page.tsx` | Checkout torna al piano; dopo il timeout del pagamento si può riprovare la verifica, ma manca un'uscita chiara per consultare il percorso senza avviare un nuovo pagamento. |
| Controlli di fase | `apps/web/app/journey/_account/calibration-state.ts`, `apps/web/app/journey/page.tsx` | Autenticazione, benvenuto, fase gratuita e avvio programma hanno già controlli e destinazioni da conservare. |

Riferimenti di comportamento già coerente nell'area abbonato:
`apps/web/app/user/check-in/page.tsx` offre «Torna alla Home» dopo il
salvataggio; `apps/web/app/user/training/sessions/[id]/esegui/session-player.tsx`
torna alla Home dopo la conclusione. Non occorre riscrivere questi flussi.

## Vista generale e prossimo passo

Usare `/journey/profilo` come riepilogo canonico della fase gratuita: è la
pagina esistente che già riunisce i dati richiesti. Non creare una nuova
dashboard e non trasferire nuovamente gli editor personali fuori dal menu
avatar. La Home `/journey` mantiene il suo ruolo di ingresso sintetico e
deve indicare un passo compatibile con il medesimo stato.

Al ritorno, rileggere i dati necessari: valutazione, affidabilità, stato di
calibrazione e lezione. Evitare che una vista aggiornata mostri una scheda
lezione o un prossimo passo rimasti allo stato precedente. Mostrare una
conferma breve e accessibile del completamento senza inventare incrementi
di affidabilità: il valore può anche restare invariato o diminuire.

Le destinazioni devono seguire i dati del backend, comprese le combinazioni
di stato della calibrazione e della lezione:

- Calibrazione aperta e prossima attività disponibile: accesso esplicito a
  domande o micro-test; non aprire automaticamente un nuovo round.
- Lezione sbloccata: accesso alla scelta del circolo quando consentito.
- Lezione richiesta, confermata o in attesa di validazione: spiegare lo
  stato e offrire la gestione della lezione; non presentare la calibrazione
  come attività immediata se il backend la blocca in quella fase.
- R consolidata: accesso agli scenari quando disponibili, con attesa e
  riprova se sono ancora in preparazione.
- Lezione disabilitata, indisponibile, rifiutata o ritirata: rispettare le
  regole esistenti e proporre soltanto le azioni realmente consentite.

Non dedurre l'eleggibilità della lezione dal solo punteggio o dalla sola
confidenza; utilizzare lo stato e i permessi effettivi delle API esistenti.

## Completamento dei round di domande

- Al termine del round, attendere la conferma del salvataggio e il risultato
  della valutazione prima di dichiarare l'attività completata.
- Quando il risultato aggiornato è disponibile, tornare al riepilogo
  `/journey/profilo`, con conferma dell'aggiornamento.
- Applicare la stessa regola al recupero di un round rimasto `EVALUATING`.
- Se l'elaborazione è ancora in corso, mantenere uno stato di attesa
  comprensibile e recuperabile; non avviare un altro round o reinviare
  automaticamente risposte già fissate dal server.
- Se l'invio fallisce prima del salvataggio, mantenere aperto il
  questionario, la posizione e tutte le risposte locali; mostrare l'errore
  e consentire di riprovare. Non eseguire una transizione di successo quando
  `action()` restituisce `false`.
- Distinguere un invio non riuscito da risposte salvate la cui valutazione
  deve essere ripresa. Conservare lease, idempotenza e recupero già previsti.

## Micro-test e feedback

Conservare l'intero flusso attuale: prova pratica o situazioni, feedback
intermedi, spiegazione finale, confronto di affidabilità e video quando
presenti. Non saltare questi contenuti con un redirect immediato.

Dopo il risultato finale, l'azione principale diventa «Torna al riepilogo»
verso `/journey/profilo`. L'eventuale prosecuzione della calibrazione resta
un'azione esplicita compatibile con lo stato aggiornato; non proporla se
la calibrazione è chiusa o richiede prima una scelta relativa alla lezione.

Gestire coerentemente rinuncia al micro-test, recupero `EVALUATING`, errore
di salvataggio e caricamento del risultato: mantenere i dati già acquisiti,
offrire riprova e un ritorno chiaro. Un risultato consultato tramite URL
diretto deve restare consultabile e non deve reinviare la prova.

## Lezione, scenari e pagamento

Dopo richiesta, aggiornamento o rinuncia al posto mostrare l'esito effettivo
e un'azione evidente di ritorno al riepilogo, che rilegge lo stato corrente.
Conservare il consenso alla condivisione col coach e tutti i vincoli esistenti.

Mantenere la sequenza scenari → piano → checkout e i ritorni già coerenti.
«Non ora» torna al riepilogo, conservando le scelte valide salvate.

Nell'attesa prolungata della conferma del pagamento, aggiungere un'uscita
esplicita verso il percorso/riepilogo consentito dalla fase attuale, senza
creare un nuovo checkout né dichiarare un pagamento annullato o riuscito.
Resta possibile verificare nuovamente. Il webhook e il diritto di accesso
continuano a essere l'autorità per l'attivazione; a conferma avvenuta resta
il percorso previsto per creare il programma e arrivare all'area abbonato.

## Navigazione, compatibilità e limiti

- Rendere espliciti i ritorni; non dipendere soltanto dalla cronologia del
  browser, perché le pagine possono essere aperte direttamente o dalla PWA.
- Se servono parametri di ritorno, ammettere soltanto destinazioni interne
  note, come nel modello già usato dalle pagine `/account`.
- Indietro, ricarica e riapertura non devono reinviare attività concluse,
  creare round duplicati o mostrare un successo dopo un errore.
- Conservare lo stato del percorso per chi interrompe e riprende, rispettando
  i dati confermati sul server e le risposte ancora locali.
- Conservare consensi, benvenuto iniziale, autenticazione e controlli di fase;
  i ritorni non devono saltarli o riaprire il benvenuto a chi l'ha completato.
- Usare testi, pulsanti e componenti esistenti, con focus e annunci accessibili
  dopo conferme, errori e cambio pagina, su mobile e desktop.
- Non cambiare algoritmi di valutazione, soglie, punteggi, regole della lezione,
  prezzi, pagamenti o contenuti dei micro-test per ottenere la navigazione.
- Nessuna riprogettazione di allenamenti, check-in, back office o account
  personale. Correggere solo i raccordi necessari al perimetro descritto.

## Criteri di accettazione e verifiche dell'agente

- [ ] Round completato e valutato → riepilogo aggiornato, senza nuovo round automatico.
- [ ] Risposta HTTP di errore o errore di rete → domande, posizione e selezioni locali conservate.
- [ ] Risposte già salvate con valutazione interrotta → recupero coerente senza duplicazioni.
- [ ] Micro-test pratico e situazionale conservano feedback, risultato e video, con ritorno al riepilogo.
- [ ] Consultazione diretta di un risultato e rinuncia a un micro-test hanno uscite comprensibili.
- [ ] Home e profilo concordano sul prossimo passo nei diversi stati di calibrazione e lezione.
- [ ] Richiesta, conferma, attesa validazione, rinuncia e indisponibilità della lezione rappresentate correttamente.
- [ ] Chiusura della calibrazione e preparazione degli scenari non lasciano CTA di calibrazione incoerenti.
- [ ] Scenari, piano, «Non ora» e checkout mantengono scelte e ritorni corretti.
- [ ] Pagamento in attesa: uscita sicura e riprova, senza doppio checkout o attivazione anticipata.
- [ ] Back, ricarica, accessi diretti e riapertura PWA non causano loop o invii duplicati.
- [ ] Consensi, onboarding, passaggio all'area abbonato e gestione account invariati.
- [ ] Verifica mobile/desktop e accessibilità delle transizioni, mantenendo l'aspetto delle schermate.
- [ ] Test di regressione pertinenti, lint, typecheck e build secondo `AGENTS.md`; documentazione aggiornata.

Partire dai test esistenti in `apps/web/app/journey/_account/account-area.test.tsx`,
`account-recovery.test.tsx`, `apps/web/app/journey/page.test.tsx`, dai test del
ritorno pagamento e dalle fixture dell'area atleta. I test devono verificare
destinazioni, stato e conservazione delle risposte, non soltanto i testi.

L'analisi iniziale ha eseguito 17 test con dati simulati: 14 esistenti e tre
controlli temporanei che confermano permanenza nella calibrazione, perdita
della selezione dopo errore e CTA della Home durante l'attesa della lezione.
Questi risultati descrivono lo stato iniziale e non certificano la futura
implementazione. Questa PR documentale non modifica il codice applicativo.
