# Calibrazione gratuita

## Risultato

Dopo la prima valutazione AI (vedi `assessment-ai-evaluation.md`) l'atleta entra
nella fase gratuita. Niente programma: solo round di domande scritte dall'AI sui
driver con la confidence più bassa. Ogni round rivaluta R e confidence con il prompt
di valutazione, salvando una nuova valutazione versionata. Quando la **regola di
consolidamento** in vigore è soddisfatta R è consolidata, ma la calibrazione resta
aperta e l'atleta può continuare a rispondere (decisione di Stefano, 28 ottobre
2026). Nessuna attesa fra i round (specifica PF-FS-PREPAYWALL §4.3).

La calibrazione si chiude solo in tre modi:

1. **lezione gratuita svolta e R consolidata**: il feedback del coach è valutato e
   la regola è soddisfatta (da sola, alla valutazione che lo verifica);
2. **scelta dell'atleta**: con R consolidata e nessuna lezione in attesa o da
   decidere, «Vai ai tuoi scenari» (`POST /athlete-journey/calibration/finish`);
3. **scadenza** (`deadlineAt`): chiude comunque, anche con R non consolidata o la
   lezione ancora da fare.

```
EVALUATION ──► FREE_CALIBRATING ──► FREE_LEVEL_ESTIMATED ──► CALIBRATION_COMPLETED
                 round adattivi       livello stimato          lezione svolta + R
                                                               consolidata, scelta
                                                               dell'atleta o scadenza
```

Dopo `CALIBRATION_COMPLETED` arrivano gli scenari P3/P6/P12 e la scelta del
percorso, che porta a `PAYWALL_READY` (vedi `scenari-orizzonte.md`).
`PAYWALL_READY` conta come calibrazione chiusa: niente più round.

Riferimenti: specifica PF-FS-PREPAYWALL v1.0 (§4.3, §6.4, §7.1, §7.2), Product
Blueprint A4.3 (stati del percorso), A4.4 (R con confidence, Spider «flebile →
consolidato»), A4.6 (AI_ASSESSMENT). Le soglie definitive sono ancora aperte
(A4-D01, OP-02, OP-03): sono regole versionate di back office.

## Regole di confidence

Due regole distinte, in `ConfidencePolicy` (`confidence-policy.ts`):

| Regola | Serve a |
|---|---|
| `R_CONSOLIDATION` | consolidare R e generare P3/P6/P12 |
| `LESSON_ELIGIBILITY` | rendere l'atleta eleggibile alla lezione gratuita |

Ogni regola combina in AND confidence complessiva minima, confidence minima per area
e numero di aree che devono raggiungerla (vuoto = tutte); un criterio vuoto non si
applica, almeno uno è obbligatorio. Le righe non si modificano: ogni cambio dal back
office è una nuova versione, quella in vigore è la più alta. Ogni valutazione salva
in `consolidationPolicyId` la versione applicata e la calibrazione chiusa la
versione che l'ha consolidata.

Versione iniziale, provvisoria e da approvare: consolidamento con confidence
complessiva ≥ 70 e tutte le aree ≥ 70 (la soglia precedente); lezione con
confidence complessiva ≥ 50.

## Regole

Tutte in `apps/api/src/discovery/calibration/calibration-rules.ts`, senza I/O:

- **Inizio**: alla prima visita dopo la valutazione nasce `AthleteCalibration`, con
  inizio pari alla data della prima valutazione e `deadlineAt` = inizio +
  `maxDays`. Alla scadenza la calibrazione si chiude (`expireIfDue`, controllata
  a ogni lettura del percorso e a ogni round) con motivo `DEADLINE_REACHED`.
- **Driver in focus** (`focusDrivers`): quelli sotto la soglia per area di
  `R_CONSOLIDATION`, dal meno affidabile; se manca solo la confidence complessiva
  (o la regola non ha soglia per area) sono in focus tutti. L'AI riceve tutti i
  driver con il loro focus e chiede solo su quelli in focus: un driver con
  evidenze sufficienti non riceve domande (AT-07). Con la regola già soddisfatta
  sono in focus tutti, dal meno affidabile: si continua ad approfondire. I round
  sono tutti `ADAPTIVE`.
- **Prossimo passo deciso dall'AI** (§4.2, scelta C; `calibration-questions.ts`):
  `ASK_SINGLE` (1 domanda, quando la risposta cambierà la successiva), `ASK_GROUP`
  (da 2 a 6 domande indipendenti), `REQUEST_CLARIFICATION` (1 domanda neutra su
  una contraddizione) o `PROPOSE_MICRO_TEST` (una prova pratica su un driver in
  focus, vedi sotto), con un motivo sintetico. Nessun numero di domande per
  driver; 6 è solo il limite di un passo a schermo. Il backend valida azione,
  numero di domande coerente con l'azione, driver in focus, da 3 a 5 opzioni con
  score nella scala attiva, nessuna domanda già fatta. Con `PROPOSE_MICRO_TEST`
  le domande che il motore scrive comunque (spesso il test stesso, in forma di
  domanda) si ignorano con l'avviso `MICRO_TEST_STEP_QUESTIONS_IGNORED`, senza
  scartare il passo: il test lo scrive il generatore. Azione, aree e motivo
  restano sul round (`action`, `targetAreas`, `rationale`, §10.2). Prontezza al
  reveal e alla lezione restano del server (regole versionate). All'atleta gli
  score delle opzioni e il motivo non arrivano mai.
- **Micro-test come passo del motore** (§4.4, AT-12, AT-13), sempre disponibile,
  senza flag. Decide sempre l'AI, passo per passo. Riceve `microTestBalance`:
  micro-test svolti e saltati, domande risposte in calibrazione e l'indicazione
  del back office `questionsPerMicroTest` (in media un micro-test ogni N domande,
  0 = nessuna indicazione, default). L'indicazione orienta il rapporto ma non è
  un vincolo: l'AI può discostarsene. Il motore sceglie il driver; il test lo
  scrive il generatore dedicato (`micro-test-generation.ts`, prompt `MICRO_TEST`)
  con il motivo del passo, la storia del driver, i titoli già proposti e le
  risposte del profilo che dichiarano dolori o limitazioni. Il backend valida:
  obiettivo informativo, istruzioni, durata da 1 a 30 minuti o assente, impegno
  fisico `NONE`/`LOW`/`MODERATE` (mai moderato con limitazioni dichiarate) con
  condizioni di sicurezza quando non è `NONE`, nessun contenuto sanitario o
  massimale, da 3 a 5 esiti crescenti nella scala, titolo mai proposto. Le
  parole vietate le gestisce l'amministratore in Calibrazione gratuita
  (`CalibrationConfig.unsafeMicroTestTerms`, iniziali: diagnosi, terapie,
  farmaci, integratori, diete, massimali, sprint, salti ripetuti…) e arrivano
  anche nel prompt; il controllo (`micro-test-safety.ts`) le cerca a inizio
  parola, senza maiuscole né accenti, e non conta quelle che la frase esclude
  davvero («non massimale», «senza sprint», «evita sforzi massimali»): fra la
  negazione e il termine sono ammessi solo articoli, preposizioni, poche parole
  ponte (sforzo, ritmo, intensità, arrivare…) e altri termini vietati, e una
  doppia negazione («non evitare gli sprint») non esclude. «Nessuna pausa tra
  sprint» resta vietata. Un test
  rifiutato non arriva all'atleta: si riscrive una volta con il motivo dello
  scarto, poi il passo fallisce con «Riprova», senza catalogo di riserva. Con la
  quota giornaliera del provider esaurita (429 «per day») non si ritenta e
  l'atleta riceve `503 AI_QUOTA_EXHAUSTED` con un messaggio leggibile. Il test validato diventa un `MicroTest` dell'atleta e
  l'unica voce del round, con provenienza (provider, modello, versione e hash del
  prompt). L'atleta vede istruzioni, durata e sicurezza e riporta l'esito; nella
  rivalutazione l'esito entra con `source: MICRO_TEST` e la dicitura «esito
  riportato dall'atleta» (self-report, non misura). «Non posso farlo ora»
  (`POST /athlete-journey/calibration/skip`) chiude il passo come `SKIPPED`,
  senza evidenza né confidence; il motore lo vede come «(saltato)» e sceglie un
  altro passo. Nessun limite giornaliero.
- **Eventi** (§11, senza testi): `ai_question_presented` e `ai_question_answered`
  (azione, numero di domande, sequenza del round), `ai_micro_test_presented`
  (area) e `ai_micro_test_completed`.
- **Segnalazioni riservate** (§5.3, AT-11, OP-08). La valutazione AI può
  restituire `anomaly` (di norma `null`): `CONTRADICTIONS`, `AUTOMATED_PATTERN` o
  `MICRO_TEST_MISMATCH`, priorità `LOW` o `HIGH` ed evidenze osservabili (massimo
  300 caratteri, senza accuse). Il backend la toglie dall'output salvato e la
  registra in `AssessmentAnomaly`, legata alla valutazione: la vede solo l'admin
  in `/admin/anomalies` (`GET` e `PATCH /admin/assessment-anomalies`, stati
  `OPEN`, `REVIEWED`, `ARCHIVED`, con chi e quando ha esaminato). L'evento
  `assessment_anomaly_flagged` porta solo tipo e priorità. All'atleta non arriva
  nulla: continua con domande e chiarimenti normali e la confidence non si alza
  per compensare. Una `HIGH` aperta sospende solo l'eleggibilità alla lezione
  gratuita (fase `LOCKED` con `PROFILE`, messaggio «Continuiamo a conoscere il tuo
  profilo»), mai un posto già richiesto o assegnato; con la lezione sospesa R
  segue la sola regola di consolidamento. Nessuna esclusione automatica.
- **Ritmo**: nessuno. Il round successivo si apre appena il precedente è valutato;
  restano solo il lease tecnico per atleta e il rate limit dell'API, mai mostrati
  come attese (§4.3, OP-09).
- **Rivalutazione**: le risposte dell'assessment (`source: ASSESSMENT`) e di tutti i
  round (`source: CALIBRATION`) tornano all'AI insieme a score e confidence
  precedenti di ogni driver. La nuova valutazione ha `sequence` successiva e
  `source = CALIBRATION_ROUND`.
- **Stato dopo la valutazione**:
  - feedback del coach valutato (lezione svolta) e regola soddisfatta →
    `CALIBRATION_COMPLETED`, motivo `CONFIDENCE_REACHED`;
  - altrimenti `FREE_LEVEL_ESTIMATED` appena la confidence del livello supera
    `levelConfidenceThreshold`;
  - con un posto richiesto o assegnato alla lezione gratuita, o un feedback del
    coach non ancora valutato, lo stato è `FREE_LESSON_VALIDATION`: la
    calibrazione resta aperta e si continua a rispondere anche con R consolidata,
    finché il feedback non è valutato o arriva la scadenza.
- **Scelta degli scenari** (`finishProblem`, `CalibrationService.finish`): con R
  consolidata l'atleta chiude la calibrazione quando vuole. Non con la lezione in
  attesa (`409 CALIBRATION_WAITING_LESSON`), con la lezione disponibile ma non
  ancora richiesta o rifiutata (`409 CALIBRATION_LESSON_CHOICE`), con R non
  consolidata (`409 CALIBRATION_NOT_READY`) o con una valutazione in corso. Senza
  lezione possibile (territorio senza circolo, flag spento, rinuncia, assenza) basta
  R consolidata (`lesson-gate.ts`, `docs/lezione-gratuita.md`).
  La chiusura consolida l'ultima valutazione nella stessa transazione
  (`calibration-completion.ts`): `CALIBRATION_COMPLETED` e
  `AssessmentEvaluation.status = CONSOLIDATED` non divergono mai. I round lasciati
  aperti scadono (`EXPIRED`). Le altre valutazioni restano `PROVISIONAL`.
- **Scadenza** (§7.2): alla data `deadlineAt` la calibrazione si chiude con
  `DEADLINE_REACHED` anche con R non consolidata. L'ultima valutazione diventa la
  base di P (`CONSOLIDATED`) ma l'evento `r_consolidated` registra `rule_met:
  false` e la vista restituisce `ruleMet: false`: profilo, calibrazione e scenari
  mostrano un avviso chiaro che R è una stima poco affidabile. Round aperti o in
  valutazione scadono. `CLOSING_ASSESSMENT` e i round `CLOSING` restano solo nello
  storico.
- **Programma prima del paywall**: per il Blueprint (A4.6, A3.9, A4.7) il programma
  arriva dopo calibrazione → P3/P6/P12 → Program Horizon → paywall. Per chi ha una
  valutazione AI, `POST /athlete-journey/submit` e `POST /onboarding/submit` (che
  creano la baseline da cui parte il piano) rispondono 409
  `PROGRAM_LOCKED_BEFORE_PAYWALL`, anche a calibrazione completata e a
  `PAYWALL_READY`, finché l'atleta non ha un abbonamento con entitlement attivo. La
  decisione 13 è aperta, quindi il parametro `programBeforePaywall` (spento di
  default) riapre il flusso precedente. Gli atleti senza valutazione AI (flusso
  precedente a #8) non sono toccati: li chiude il paywall (gap 1.10).

## Livello e commitment

Il formato della valutazione (`assessment-evaluation-model.ts`) aggiunge:

- `level`: `BEGINNER | INTERMEDIATE | ADVANCED | COMPETITIVE | PRO`, con
  `levelConfidence` 0–100;
- per driver `commitment`: `LOW | MEDIUM | HIGH | UNKNOWN`.

Il livello si mostra all'atleta solo da `FREE_LEVEL_ESTIMATED` in poi.

## Concorrenza

- Apertura e risposta passano da un lease su `AthleteCalibration.operationAt` (10
  minuti, protezione tecnica e non cadenza di prodotto): due richieste simultanee non creano due round. Il valore del lease fa da
  token: chi lo rilascia azzera solo il proprio, quindi una richiesta lenta con il
  lease scaduto non libera quello ripreso da un'altra.
- Le risposte di un round si fissano una sola volta, nel passaggio
  `OPEN → EVALUATING`. Chi trova il round già `EVALUATING` (lease scaduto durante
  una chiamata AI lenta) lo prende in carico con un nuovo `evaluationToken` e
  valuta le risposte salvate, senza riscriverle.
- Solo il proprietario del token collega la valutazione (`EVALUATING → EVALUATED`,
  nella stessa transazione che la salva) o riporta il round a `OPEN` dopo un
  errore. Chi ha perso il round annulla la propria transazione e restituisce lo
  stato attuale; il suo errore non riapre un round che un altro sta valutando.
  Il vincolo unico `(userId, sequence)` resta la garanzia finale.
- La risposta porta il round da `OPEN` a `EVALUATING`; se l'AI fallisce torna `OPEN`
  e l'atleta può riprovare. Un invio ripetuto dello stesso round restituisce lo
  stato attuale.
- Valutazione, collegamento al round e cambio di stato sono salvati in un'unica
  transazione; il vincolo unico `(userId, sequence)` resta la garanzia finale.

## Persistenza

| Tabella | Contenuto |
|---|---|
| `AthleteCalibration` | stato, inizio, scadenza indicativa, `levelEstimatedAt`, `completedAt`, `completionReason`, `consolidationPolicyId`, lease |
| `CalibrationRound` | `sequence`, `kind` (`ADAPTIVE`/`CLOSING`), `action`, `targetAreas`, `rationale`, stato (`OPEN`/`EVALUATING`/`EVALUATED`/`EXPIRED`), domande e risposte, `evaluationToken`, `evaluatedAt`, provider, modello, versione e hash del prompt, valutazione prodotta |
| `CalibrationConfig` | riga `default` con i parametri dei round, `initialQuestionsPerArea` (domande conoscitive iniziali per driver, default 2), `updatedById` con FK su `User` |
| `ConfidencePolicy` | regole versionate `R_CONSOLIDATION` e `LESSON_ELIGIBILITY`, autore e nota |
| `AssessmentEvaluation` | nuovi campi `level`, `levelConfidence` |
| `AssessmentEvaluationArea` | nuovo campo `commitment` |
| `AiAssessmentPromptConfig` | nuovo campo `kind` (`INITIAL_QUESTIONS`/`EVALUATION`/`CALIBRATION`/...) |

Migrazioni: `20261008090000_calibration_rounds`,
`20261011090000_confidence_policies` (regole, rimozione di soglia, giorno di chiusura
e ore fra round da `CalibrationConfig`, riapertura delle chiusure a tempo deboli),
`20261013090000_calibration_next_step` (decisione del passo sul round, via driver e
domande per round).

## Navigazione e riepilogo

`/journey/profilo` è il riepilogo della fase gratuita: ogni attività conclusa
ci riporta l'atleta con una conferma breve (`?esito=calibrazione`,
`micro-test`, `micro-test-rimandato`, `lezione`; altri valori si ignorano).
La conferma riceve il focus, non promette aumenti di affidabilità e sparisce
dall'indirizzo, così ricarica e indietro non la ripetono.

- **Round di domande**: dopo `calibration/answers` accettato e valutato si va al
  riepilogo, senza aprire un nuovo round. Se l'invio fallisce (errore HTTP o di
  rete) domanda, posizione e scelte restano e si può riprovare. Un round
  `EVALUATING` si completa con le risposte salvate; se un'altra richiesta lo
  sta valutando, la pagina aspetta e rilegge lo stato senza reinviarle.
- **Micro-test**: feedback, risultato e video restano; l'azione principale è
  «Torna al riepilogo», «Continua la calibrazione» compare solo se è ancora il
  passo consentito. Il risultato aperto da `?round=` o appena salvato si legge
  dalla sua API anche se nel frattempo c'è un nuovo round, senza reinviare la
  prova; rimandare il micro-test riporta al riepilogo.
- **Prossimo passo**: Home e profilo usano la stessa regola
  (`_account/next-step.ts`) su stato della calibrazione e fase della lezione:
  scenari a R chiusa, valutazione da completare, lezione richiesta o confermata,
  micro-test, domande aperte, lezione da scegliere, poi calibrazione.
- **Circolo**: richiesta, aggiornamento, ritiro e rinuncia mostrano l'esito e
  «Torna al riepilogo».
- **Attesa del pagamento** (`/abbonamento`): oltre a «Verifica di nuovo», «Torna
  al tuo percorso» senza nuovo checkout; l'attivazione resta del webhook.

## API

| Metodo e percorso | Ruolo | Effetto |
|---|---|---|
| `POST /athlete-journey/calibration/round` | atleta | apre il prossimo round (o restituisce quello aperto) |
| `POST /athlete-journey/calibration/answers` | atleta | `{ roundId, answers }`, tutte le domande, poi rivalutazione |
| `GET /admin/calibration-config` | `ADMIN` | parametri attuali |
| `PUT /admin/calibration-config` | `ADMIN` | modifica parziale dei parametri dei round |
| `GET /admin/confidence-policies` | `ADMIN` | regole in vigore e storico delle versioni |
| `POST /admin/confidence-policies/:kind` | `ADMIN` | `{ minOverallConfidence, minAreaConfidence, minAreasAtConfidence, note? }`: nuova versione |

`GET /auth/journey` aggiunge `calibration` (stato, regola di consolidamento in
vigore, `ruleMet`, `canFinish`, `deadlineAt`, `daysLeft`, round aperto senza score)
durante la fase `EVALUATION`. `POST /athlete-journey/calibration/finish` chiude la
calibrazione con R consolidata (vedi «Scelta degli scenari»).

## Back office e AI Tuner

- `/admin/calibration`: le due regole di confidence (pubblica nuova versione,
  storico) e i parametri della calibrazione. Default: soglia livello 50, 30 giorni
  alla scadenza (fissata all'avvio di ogni calibrazione), programma prima del
  paywall spento. Quanti driver e quante domande
  per passo lo decide l'AI.
- `/ai-tuner/prompts/calibrazione`: prompt delle domande, con le stesse regole di
  bozza, attivazione e versione del prompt di valutazione (`promptType =
  CALIBRATION_QUESTIONS`). **Prova la bozza** usa un caso sintetico con due driver a
  confidence bassa.
- `/ai-tuner/prompts/micro-test`: prompt del generatore dei micro-test proposti dal
  motore (`promptType = MICRO_TESTS`), stesso ciclo di vita; le regole di formato
  e sicurezza restano fisse.

## Sviluppo e test

Con `AI_PROVIDER=stub` le domande sono deterministiche e la confidence cresce di 15
per risposta fino a 90, quindi un driver supera la soglia di default dopo qualche
round. Test (casi di accettazione della specifica: AT-10, AT-11, AT-12, AT-13, AT-18, AT-19,
AT-25, AT-27): `calibration-rules.spec.ts`, `confidence-policy.spec.ts`, `calibration-questions.spec.ts`,
`micro-test-generation.spec.ts`, `test/db/discovery.integration-spec.ts`,
`test/db/micro-test-step.integration-spec.ts`, `app/journey/calibration-panel.test.tsx`,
`app/journey/_account/navigation.test.tsx`,
`app/admin/calibration/page.test.tsx`, `app/ai-tuner/prompts/calibrazione/page.test.tsx`.

## Aperto

- **Feature flag**: i flag della slice Ingresso (#10) sono su main; mettere la
  calibrazione dietro un flag è un passo successivo, non in questa PR.
- **Soglie definitive** (A4-D01, OP-02, OP-03): oggi regole versionate con valori
  provvisori.
- **Fase gratuita oltre i giorni indicativi con confidence bassa** (§7.2): R resta
  provvisoria e il percorso continua; la regola UX definitiva va formalizzata.
- **Training nella fase gratuita** (decisione 13): solo domande e micro-test.
- **Controllo di sicurezza dei micro-test**: lessico e impegno fisico dichiarato,
  non una revisione clinica; le limitazioni si riconoscono dalle risposte del
  profilo che parlano di dolori, infortuni o limitazioni.
- **Notifiche** per round disponibili e scadenza.
