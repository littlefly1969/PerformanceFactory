# Calibrazione gratuita

## Risultato

Dopo la prima valutazione AI (vedi `assessment-ai-evaluation.md`) l'atleta entra
nella fase gratuita. Niente programma: solo round di domande scritte dall'AI sui
driver con la confidence più bassa. Ogni round rivaluta R e confidence con il prompt
di valutazione, salvando una nuova valutazione versionata, finché ogni driver
raggiunge la soglia o arriva l'assessment di chiusura.

```
EVALUATION ──► FREE_CALIBRATING ──► FREE_LEVEL_ESTIMATED ──► CALIBRATION_COMPLETED
                 round adattivi       livello stimato          soglia raggiunta
                                                               o assessment di chiusura
```

Riferimenti del Product Blueprint: A4.3 (stati del percorso), A4.4 (R con
confidence, Spider «flebile → consolidato»), A4.6 (AI_ASSESSMENT), A2.2 (~30
giorni). La soglia definitiva è ancora aperta (A4-D01): i valori sono parametri di
back office.

## Regole

Tutte in `apps/api/src/discovery/calibration/calibration-rules.ts`, senza I/O:

- **Inizio**: alla prima visita dopo la valutazione nasce `AthleteCalibration`, con
  inizio pari alla data della prima valutazione e scadenza dopo `maxDays` giorni.
- **Driver del round**: quelli sotto `confidenceThreshold`, dal meno affidabile. Un
  round normale (`ADAPTIVE`) ne prende `driversPerRound`; l'assessment di chiusura
  (`CLOSING`, dal giorno `closingDay`) tutti quelli ancora sotto soglia.
- **Domande**: l'AI scrive `questionsPerDriver` domande per driver partendo dalle
  lacune (`evidenceGaps`) dell'ultima valutazione. Il formato è validato
  (`calibration-questions.ts`): da 3 a 5 opzioni, score nella scala attiva, nessuna
  etichetta duplicata. All'atleta gli score delle opzioni non arrivano mai.
- **Ritmo**: un nuovo round si apre solo `minHoursBetweenRounds` ore dopo la
  risposta al precedente; prima risponde 409 `CALIBRATION_ROUND_NOT_YET` con
  `availableAt`.
- **Rivalutazione**: le risposte dell'assessment (`source: ASSESSMENT`) e di tutti i
  round (`source: CALIBRATION`) tornano all'AI insieme a score e confidence
  precedenti di ogni driver. La nuova valutazione ha `sequence` successiva e
  `source = CALIBRATION_ROUND` o `CLOSING_ASSESSMENT`.
- **Stato dopo la valutazione**:
  - tutti i driver ≥ soglia → `CALIBRATION_COMPLETED`, motivo `CONFIDENCE_REACHED`;
  - round di chiusura → `CALIBRATION_COMPLETED`, motivo `CLOSING_ASSESSMENT`: i
    driver ancora sotto soglia restano con la loro confidence reale, senza valori
    inventati;
  - altrimenti `FREE_LEVEL_ESTIMATED` appena la confidence del livello supera
    `levelConfidenceThreshold`.
  La valutazione che chiude la calibrazione è `CONSOLIDATED`, le altre restano
  `PROVISIONAL`.
- **Programma durante la calibrazione**: per il Blueprint (A4.6, A3.9) prima del
  paywall non c'è programma. Finché la calibrazione non è `CALIBRATION_COMPLETED`,
  `POST /athlete-journey/submit` e `POST /onboarding/submit` (che creano la baseline
  da cui parte il piano) rispondono 409 `CALIBRATION_IN_PROGRESS`. La decisione 13 è
  aperta, quindi la regola è il parametro `programBeforePaywall` (spento di
  default): acceso, il flusso precedente torna disponibile. Gli atleti senza
  valutazione AI (flusso precedente a #8) non sono toccati.
- **Chiusura pigra**: non c'è uno scheduler. Il round di chiusura si propone alla
  prima visita dell'atleta dal giorno `closingDay`; nessuna notifica in questa slice.

## Livello e commitment

Il formato della valutazione (`assessment-evaluation-model.ts`) aggiunge:

- `level`: `BEGINNER | INTERMEDIATE | ADVANCED | COMPETITIVE | PRO`, con
  `levelConfidence` 0–100;
- per driver `commitment`: `LOW | MEDIUM | HIGH | UNKNOWN`.

Il livello si mostra all'atleta solo da `FREE_LEVEL_ESTIMATED` in poi.

## Concorrenza

- Apertura e risposta passano da un lease su `AthleteCalibration.operationAt` (10
  minuti): due richieste simultanee non creano due round. Il valore del lease fa da
  token: chi lo rilascia azzera solo il proprio, quindi una richiesta lenta con il
  lease scaduto non libera quello ripreso da un'altra.
- Il round passa a `EVALUATED` solo se è ancora `EVALUATING`, nella stessa
  transazione che salva la valutazione: se due richieste valutano lo stesso round
  (lease scaduto durante una chiamata AI lenta) la seconda annulla la propria
  transazione e restituisce lo stato salvato dalla prima.
- La risposta porta il round da `OPEN` a `EVALUATING`; se l'AI fallisce torna `OPEN`
  e l'atleta può riprovare. Un invio ripetuto dello stesso round restituisce lo
  stato attuale.
- Valutazione, collegamento al round e cambio di stato sono salvati in un'unica
  transazione; il vincolo unico `(userId, sequence)` resta la garanzia finale.

## Persistenza

| Tabella | Contenuto |
|---|---|
| `AthleteCalibration` | stato, inizio, scadenza, `levelEstimatedAt`, `completedAt`, `completionReason`, lease |
| `CalibrationRound` | `sequence`, `kind` (`ADAPTIVE`/`CLOSING`), stato, domande e risposte, provider, modello, versione e hash del prompt, valutazione prodotta |
| `CalibrationConfig` | riga `default` con i parametri, `updatedById` con FK su `User` |
| `AssessmentEvaluation` | nuovi campi `level`, `levelConfidence` |
| `AssessmentEvaluationArea` | nuovo campo `commitment` |
| `AiAssessmentPromptConfig` | nuovo campo `kind` (`EVALUATION`/`CALIBRATION`) |

Migrazione: `20261008090000_calibration_rounds`.

## API

| Metodo e percorso | Ruolo | Effetto |
|---|---|---|
| `POST /athlete-journey/calibration/round` | atleta | apre il prossimo round (o restituisce quello aperto) |
| `POST /athlete-journey/calibration/answers` | atleta | `{ roundId, answers }`, tutte le domande, poi rivalutazione |
| `GET /admin/calibration-config` | `ADMIN` | parametri attuali |
| `PUT /admin/calibration-config` | `ADMIN` | modifica parziale; 400 se `closingDay > maxDays` |

`GET /auth/journey` aggiunge `calibration` (stato, giorno, round aperto senza score,
prossimo round) durante la fase `EVALUATION`.

## Back office e AI Tuner

- `/admin/calibration`: parametri della fase gratuita. Default: soglia 70, soglia
  livello 50, 30 giorni, chiusura dal giorno 25, 2 driver per round, 2 domande per
  driver, 20 ore tra due round, programma durante la calibrazione spento.
- `/ai-tuner/prompts/calibrazione`: prompt delle domande, con le stesse regole di
  bozza, attivazione e versione del prompt di valutazione (`promptType =
  CALIBRATION_QUESTIONS`). **Prova la bozza** usa un caso sintetico con due driver a
  confidence bassa.

## Sviluppo e test

Con `AI_PROVIDER=stub` le domande sono deterministiche e la confidence cresce di 15
per risposta fino a 90, quindi un driver supera la soglia di default dopo qualche
round. Test: `calibration-rules.spec.ts`, `calibration-questions.spec.ts`,
`test/db/discovery.integration-spec.ts`, `app/journey/calibration-panel.test.tsx`,
`app/admin/calibration/page.test.tsx`, `app/ai-tuner/prompts/calibrazione/page.test.tsx`.

## Aperto

- **`PAYWALL_READY`**: lo stato arriva con la slice 3, dopo il reveal di P3/P6/P12
  e la scelta del Program Horizon; qui il percorso si ferma a
  `CALIBRATION_COMPLETED`.
- **Feature flag**: i flag nascono con la slice Ingresso (PR #10), non ancora su
  main. Dopo il merge la calibrazione si potrà mettere dietro un flag.

- **Soglia definitiva** (A4-D01): oggi è il parametro di back office.
- **Training nella fase gratuita** (decisione 13): solo round di domande; i
  micro-test si possono aggiungere come nuovo `kind` di round.
- **Eventi analytics** della calibrazione: da aggiungere quando il tracciamento lato
  server della slice Ingresso è su main.
- **Notifiche** per round disponibili e scadenza.
