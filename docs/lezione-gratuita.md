# Lezione gratuita e crediti di interazione

## Risultato

Dall'inizio della calibrazione l'atleta vede la lezione gratuita al circolo come
obiettivo: un'ora di padel in gruppo da 4, con un coach. È il premio per
l'interesse dimostrato (PF-FS-PREPAYWALL §6): la sblocca un profilo abbastanza
attendibile, secondo la regola di eleggibilità `LESSON_ELIGIBILITY` del back
office, con il livello stimato e almeno un circolo che offre la lezione. I crediti
di interazione restano solo come barra di progresso (OP-01). L'atleta richiede il
posto; l'admin compone i gruppi per livello; il coach dà il suo feedback, che entra
nella valutazione successiva come fonte distinta e chiude R e P.

```
FREE_CALIBRATING ──► FREE_LEVEL_ESTIMATED ──► FREE_LESSON_VALIDATION ──► CALIBRATION_COMPLETED
                      lezione possibile:        posto richiesto o           regola di consolidamento
                      R aspetta la richiesta    assegnato: R non si         soddisfatta dopo il
                      o la rinuncia             consolida fino al feedback  feedback (o la rinuncia)
```

**Quando la lezione chiude R** (decisione di Stefano, 8 ottobre 2026): il paywall
arriva solo dopo la lezione, che chiude R e P con affidabilità. Se la lezione è
possibile, R non si consolida finché il feedback non è valutato, o finché l'atleta
non sceglie esplicitamente di non farla. Se la lezione non è possibile (territorio
senza circolo, flag spento, livello non stimato, beneficio già usato), basta la
regola di consolidamento.

Tutto è dietro il feature flag `free_lesson` (spento di default, come
`referral_share`).

Riferimenti del Product Blueprint: A4.8 e A7.2 (lezione, 1 posto per atleta in un
gruppo da 4, prima della chiusura di R, feedback del coach come fonte autorevole),
A4.6 e A3.9 (prima del paywall solo domande, micro-test e tips), A7 event map,
A8-D02 (gamification aperta), A4-D04 e A7-D01 (regole operative aperte).
L'analisi completa delle coincidenze e divergenze con il Blueprint è nella nota di
progetto `notes/slice4-lezione-gratuita.md`.

## Scelte

- **Crediti ≠ Token PF.** Un ledger proprio (`InteractionCreditEntry`): non si
  comprano, non si spendono e non sbloccano nulla, mostrano il percorso fatto. Il wallet Token PF
  (A4.11) resta separato e non è toccato.
- **Micro-test, non allenamenti.** In calibrazione l'atleta riporta l'esito di
  esercizi brevi (A4.6): scritti dall'AI sulla sua storia con il flag
  `ai_micro_tests`, altrimenti dal catalogo del back office. Il programma resta
  dietro `programBeforePaywall` (decisione 13 aperta).
- **Due verifiche distinte (§6.2).** Eleggibilità dell'atleta: livello stimato con
  R aperta e regola `LESSON_ELIGIBILITY` soddisfatta sull'ultima valutazione.
  Erogabilità: almeno un circolo attivo con `freeLessonsEnabled`; il posto e la
  capienza si verificano quando l'admin assegna. La richiesta registra versione
  della regola e valutazione usate (`eligibilityPolicyId`,
  `eligibilityEvaluationId`, §10.3).
- **R aspetta la lezione** (`discovery/calibration/lesson-gate.ts`). Con la lezione
  possibile o in corso la regola di consolidamento non chiude la calibrazione; un
  nuovo round a regola soddisfatta risponde `409 CALIBRATION_LESSON_CHOICE` (lezione
  da richiedere o rifiutare) o `409 CALIBRATION_WAITING_LESSON` (posto in attesa).
  Rinuncia, ritiro e assenza riesaminano subito la calibrazione
  (`settleCalibration`): con la regola soddisfatta R si consolida. Il tempo non
  chiude R e la data della lezione non ha vincoli di scadenza.
- **Rinuncia reversibile** (`POST /athlete-journey/free-lesson/decline`, AT-18).
  Solo in fase `ELIGIBLE`; salva `AthleteCalibration.lessonDeclinedAt`. Finché R è
  aperta l'atleta può ancora richiedere il posto, e la richiesta annulla la
  rinuncia.
- **Crediti, confidence ed engagement sono misure diverse.** La confidence resta
  della valutazione AI; lo stato di engagement (A8) non è in questa slice. I
  crediti si alimentano degli stessi eventi.

## Regole

In `apps/api/src/free-lessons/free-lesson-rules.ts`, senza I/O:

- **Crediti**: una voce per evento sorgente con chiave stabile
  (`assessment:<id>`, `round:<id>`, `micro-test:<id>`). Il ledger si allinea a ogni
  lettura; i punti sono quelli in vigore quando la voce nasce, una modifica del
  back office non riscrive le voci già registrate. Una voce a 0 punti non si crea.
- **Micro-test**: proposti sui driver con la confidence più bassa, uno per test, al
  massimo `microTestsPerDay` nelle ultime 24 ore, solo a calibrazione aperta. Quelli
  su misura vengono prima, il catalogo completa.
- **Fasi** (`lessonEligibility`): `LOCKED` con i requisiti mancanti (`LEVEL`,
  `CONFIDENCE`), `UNAVAILABLE` (nessun circolo, o nessuna calibrazione),
  `ELIGIBLE`, `DECLINED` (rinuncia o ritiro), `REQUESTED`, `ASSIGNED`, `ATTENDED`,
  `NO_SHOW`, `CLOSED` (R già chiusa). Un posto svolto o perso per assenza consuma
  il beneficio; una rinuncia o un ritiro prima della lezione no.
- **Posto**: uno per atleta (`FreeLessonSeat.userId` è la chiave). Richiesta solo in
  un circolo con `freeLessonsEnabled` e con il consenso a mostrare al coach nome,
  livello stimato e driver (`coachSharingAcceptedAt`). Email e telefono non vanno
  al coach.
- **Assegnazione**: richiesta nello stesso circolo della lezione, lezione futura e
  non piena, calibrazione aperta con il livello stimato.
- **Feedback**: voto 1-5 per driver (almeno uno, il tecnico-tattico in evidenza) e
  una nota facoltativa, solo dal coach della lezione e solo dopo l'inizio. Entra
  nell'input AI con `source: COACH_LESSON` e il voto convertito nella scala attiva;
  le risposte dell'atleta restano com'erano. La nuova valutazione ha `source =
  COACH_LESSON`.

## Micro-test su misura

Con il flag `ai_micro_tests` (spento di default) l'AI scrive i micro-test per il
singolo atleta, a ogni nuova valutazione: uno per ciascuno dei 3 driver con la
confidence più bassa.

- **Storia dell'atleta**: profilo dell'assessment, scala, per ogni driver score,
  confidence, lacune indicate dalla valutazione e le ultime 12 evidenze con la
  loro fonte (assessment, round, micro-test, coach), più i titoli già proposti.
  Nessun nome, email o id.
- **Prompt modificabile**: famiglia `MICRO_TEST` dei prompt dell'assessment
  (`promptType = MICRO_TESTS`), con bozze, prova sul caso sintetico, attivazione e
  versioni come valutazione e calibrazione, in `/ai-tuner/prompts/micro-test`
  (ruolo `AI_TUNER`). Il prompt iniziale è `DEFAULT_MICRO_TEST_PROMPT` in
  `apps/api/src/ai-orchestrator/micro-test-generation.ts`; le regole di formato
  restano fisse e fuori dalla parte modificabile.
- **Validazione**: un test per driver richiesto, titolo e istruzioni entro i
  limiti, da 3 a 5 esiti distinti con score crescenti nella scala attiva, titolo
  mai proposto prima. Un output che non rispetta il contratto non arriva
  all'atleta. Nessuna approvazione manuale: i test sono del singolo atleta.
- **Quando**: il pannello lo chiede (`generateMicroTests` nella risposta) e chiama
  `POST /athlete-journey/free-lesson/micro-tests/generate`; serve il consenso AI
  quando il provider è esterno.
- **Una chiamata per lotto**: riga `MicroTestGeneration` unica per atleta e
  valutazione; chi la prende in carico (token, lease di 2 minuti) chiama l'AI, le
  richieste parallele non fanno nulla. L'esito si salva solo se il token è ancora
  quello del lotto. Un fallimento resta `FAILED` e si riprova dopo 10 minuti, al
  massimo 3 tentativi; intanto l'atleta vede il catalogo.
- **Isolamento**: un test su misura si completa solo dal suo atleta, non compare
  nel catalogo del back office e segue l'atleta alla cancellazione.

## Concorrenza e idempotenza

- **Capienza**: assegnazione sotto advisory lock della lezione; il conteggio dei
  posti occupati e l'aggiornamento avvengono nella stessa transazione. Testato con
  5 assegnazioni parallele su 4 posti.
- **Stato della calibrazione**: assegnazione, rinuncia, assenza, annullamento e ogni
  valutazione prendono il lock della riga `AthleteCalibration` (`SELECT … FOR
  UPDATE`). Ordine dei lock: prima la lezione, poi la calibrazione. Così una
  valutazione che chiuderebbe per soglia vede sempre un posto appena assegnato.
- **Crediti**: vincolo unico `(userId, sourceKey)` e `createMany` con
  `skipDuplicates`: letture parallele non duplicano voci.
- **Micro-test**: vincolo unico `(userId, microTestId)` più advisory lock per atleta
  sul limite giornaliero.
- **Feedback**: il passaggio `ASSIGNED → ATTENDED` avviene sotto il lock della
  lezione; un reinvio trova `ATTENDED` e non scrive nulla. Il vincolo unico
  `(lessonId, userId, areaId)` resta la garanzia finale.
- **Valutazione del feedback**: parte subito dopo il salvataggio, sotto il lease
  della calibrazione; se il lease è occupato o l'AI fallisce, il feedback resta in
  attesa (`evaluationId` nullo) e viene valutato al prossimo round richiesto
  dall'atleta, prima di nuove domande. Il feedback si collega a una sola
  valutazione.
- **Eventi una volta sola**: `lesson_eligible` usa un `eventId` deterministico per
  atleta.
- **Parametri**: la riga di default nasce con un inserimento che ignora i doppioni,
  non con un upsert, perché due prime letture parallele non falliscano.

## Persistenza

| Tabella | Contenuto |
|---|---|
| `FreeLessonConfig` | riga `default`: traguardo visivo dei crediti, punti per azione, micro-test nelle 24 ore |
| `InteractionCreditEntry` | ledger append-only: azione, punti, chiave dell'evento sorgente |
| `MicroTest`, `MicroTestCompletion` | catalogo per driver con esiti e punteggi, o test su misura (`userId`, `generationId`); esito dell'atleta, uno per test |
| `MicroTestGeneration` | lotto AI per atleta e valutazione: stato, token, tentativi, provider, modello, versione e hash del prompt |
| `FreeLesson` | circolo, coach, inizio, durata, capienza, livello del gruppo, stato |
| `FreeLessonSeat` | posto dell'atleta, circolo, lezione, stato, consenso alla condivisione col coach, regola di eleggibilità e valutazione della richiesta |
| `AthleteCalibration` | `lessonDeclinedAt`: rinuncia esplicita alla lezione |
| `CoachLessonFeedback` | lezione, atleta, coach, driver, voto 1-5, nota, valutazione che lo ha incorporato |
| `Partner` | nuovo campo `freeLessonsEnabled` |

Vincoli `CHECK` su stati, capienza (1-8) e voto (1-5); un posto assegnato, svolto o
assente ha sempre una lezione. Le lezioni non si cancellano (si annullano).
Migrazioni: `20261009120000_free_lesson`, `20261010090000_ai_micro_tests` (un test
del catalogo non ha atleta né lotto, uno su misura li ha entrambi),
`20261012090000_lesson_by_confidence` (rinuncia, eleggibilità sul posto, via
`minDaysBeforeDeadline`).

## API

| Metodo e percorso | Ruolo | Effetto |
|---|---|---|
| `GET /athlete-journey/free-lesson` | `USER` | fase, crediti, circoli, posto, micro-test di oggi; `{ enabled: false }` a flag spento |
| `POST /athlete-journey/free-lesson/micro-tests/generate` | `USER` | prepara i micro-test su misura, una volta per lotto |
| `POST /athlete-journey/free-lesson/micro-tests/:id` | `USER` | `{ value }`, esito del micro-test |
| `POST /athlete-journey/free-lesson/request` | `USER` | `{ partnerId, shareWithCoach: true }` |
| `POST /athlete-journey/free-lesson/withdraw` | `USER` | ritira la richiesta o il posto prima della lezione |
| `POST /athlete-journey/free-lesson/decline` | `USER` | sceglie di non fare la lezione: R si consolida con la regola |
| `GET /admin/free-lessons` | `ADMIN` | parametri, circoli, coach, lezioni, richieste, micro-test |
| `PUT /admin/free-lessons/config` | `ADMIN` | parametri dei crediti |
| `PATCH /admin/free-lessons/clubs/:id` | `ADMIN` | `{ freeLessonsEnabled }` |
| `POST /admin/free-lessons/lessons` | `ADMIN` | nuova lezione |
| `PATCH /admin/free-lessons/lessons/:id/coach` | `ADMIN` | coach della lezione |
| `POST /admin/free-lessons/lessons/:id/seats` | `ADMIN` | assegna un posto |
| `DELETE /admin/free-lessons/lessons/:id/seats/:userId` | `ADMIN` | toglie dal gruppo, la richiesta resta |
| `POST /admin/free-lessons/lessons/:id/cancel` | `ADMIN` | annulla, i posti tornano richieste |
| `POST /admin/free-lessons/micro-tests` | `ADMIN` | nuovo micro-test |
| `PATCH /admin/free-lessons/micro-tests/:id` | `ADMIN` | attiva o spegne |
| `GET /professional/lessons` | `PROFESSIONAL` | lezioni del coach con i partecipanti; ogni lettura scrive `DataAccessAudit` |
| `POST /professional/lessons/:id/feedback` | `PROFESSIONAL` | `{ userId, ratings: [{ areaId, rating }], note? }` |
| `POST /professional/lessons/:id/no-show` | `PROFESSIONAL` | `{ userId }` |

Eventi (event map A7, §11): `lesson_eligible` e `lesson_requested` con la versione
della regola di eleggibilità, `lesson_declined`, `lesson_booked`,
`lesson_completed`, `coach_feedback_submitted`.

## Interfaccia

- `/journey`: pannello «Lezione gratuita al circolo» sotto la calibrazione, con
  barra dei crediti (solo progresso), micro-test di oggi, richiesta del posto,
  rinuncia e data della lezione.
- `/admin/free-lessons`: richieste da collocare ordinate per circolo e livello,
  lezioni con posti e coach, circoli che offrono la lezione, parametri dei crediti,
  catalogo dei micro-test.
- `/professional/lessons`: lezioni del coach, feedback per atleta e assenze.

## Sviluppo e test

Default: traguardo visivo di 100 crediti, 30 per la prima valutazione, 20 per
round, 10 per micro-test, 2 micro-test nelle 24 ore; eleggibilità con confidence
complessiva ≥ 50 (regola v1, da approvare, in `/admin/calibration`). Per provarla:
accendere `free_lesson` in `/admin/feature-flags`, attivare un circolo e aggiungere
un micro-test in `/admin/free-lessons`.

Test: `free-lesson-rules.spec.ts`, `calibration-rules.spec.ts`,
`test/db/free-lesson.integration-spec.ts` (crediti e limite giornaliero in
parallelo, eleggibilità per regola, capienza con assegnazioni parallele, attesa di
R e feedback del coach, rinuncia e territorio non servito, ritiro, flag spento), `test/db/ai-micro-tests.integration-spec.ts` (una chiamata
AI con richieste parallele, test su misura prima del catalogo e solo del loro
atleta, nuovo lotto a nuova valutazione, fallimento e nuovo tentativo, flag
spento), `micro-test-generation.spec.ts`, `app/journey/free-lesson-panel.test.tsx`,
`app/ai-tuner/prompts/micro-test/page.test.tsx`.

## Aperto

- **Regole operative** (A4-D04, A7-D01): disponibilità del circolo, booking e
  voucher, no-show, chi paga la lezione. Oggi l'admin compone i gruppi a mano e
  il no-show consuma il beneficio.
- **Gamification** (A8-D02, OP-01): i crediti restano come progresso visivo; se
  mantenerli è da approvare.
- **Richiesta senza data** (OP-05): una richiesta mai assegnata trattiene R finché
  l'admin non compone un gruppo o l'atleta non la ritira.
- **Notifiche**: l'atleta scopre l'assegnazione aprendo il percorso; il
  touchpoint proattivo arriva con la retention (A8).
- **Contatto del circolo con l'atleta**: non c'è; condividere email o telefono
  richiederebbe un consenso separato.
