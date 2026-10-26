# Assessment PF5 dopo il login

## Risultato

Dopo login (email/password o Google) e consensi, invariati, l'atleta vede l'intro
PF5 e un unico questionario continuo, seguito dalla prima valutazione AI delle
risposte.

```
login → consensi → intro PF5 → domande operative
      → l'AI scrive le domande dei driver → domande dei driver
      → ultima risposta salvata (assessmentComplete)
      → Analizza le mie risposte → valutazione AI (R provvisoria)
```

## Intro

Replica il mockup PF5 su pagina chiara:

- **Card lime.** Contiene:
  - la pillola nera «PERCORSO GRATUITO», senza giorni rimasti: il Blueprint non
    prevede una prova a giorni (il campo `trial` dell'API resta ma non si mostra);
  - «Ciao {nome}.»;
  - «Prima di programmare qualcosa misuriamo dove sei: quattordici domande,
    cinque minuti.»;
  - la CTA nera **Scopri la tua performance** con freccia lime.
- **Sotto la card.** «Cosa si attiva dopo»: Livello stimato sui sei driver,
  Scenari a 3, 6 e 12 mesi, Programma e coaching, tutti «Bloccato». È testo
  statico e non promette durate.

I numeri sono `count` ed `estimatedMinutes` del backend, scritti in lettere da
`italian-number.ts` («dodici domande, quattro minuti»; «una domanda, un
minuto»). La UI non conosce aree, domande per area né formula, e nessun numero
di domande è scritto nel frontend.

## Composizione del questionario

`apps/api/src/discovery/assessment-configuration.ts` è l'unica fonte di sequenza e
conteggi:

```
count = domande operative + driver attivi × domande per driver
estimatedMinutes = max(1, ceil(count / 3))
```

Le domande per driver sono `initialQuestionsPerArea` del back office
(`/admin/calibration`, default 2, da 1 a 4). Con la configurazione padel
attuale: 2 domande operative + 6 driver × 2 domande = 14 domande, circa 5
minuti. `fixedQuestionCount` comprende le sole operative. Le risposte `GET /auth/journey` e
`POST /athlete-journey/start` riportano `fixedQuestionCount`,
`areaQuestionCount`, `count` ed `estimatedMinutes`.

Ordine obbligatorio:

1. **Domande operative**, sezione «Disponibilità». Quando le opzioni sono
   quantità (valore numerico ed etichetta che comincia con lo stesso numero,
   come «5 giorni») si risponde con il quadrante e i tasti più e meno, non con
   un elenco di opzioni. Le domande dei driver restano sempre scelte.
2. **Domande dei driver**, scritte dall'AI per questo atleta, raggruppate
   nell'ordine dei driver.

La classifica FIT non è più una domanda del percorso: è un dato di
configurazione del profilo, che si dichiara nella schermata della foto e si
corregge dal profilo. Vedi [Classifica FIT](classifica-fit.md).

Il progressivo mostra `n / count` e, sopra ogni domanda, la sezione
(«Disponibilità» o il nome del driver).

## Domande operative (bloccate)

Sono due `OnboardingQuestionTemplate` con scope `GENERAL`, create dalla migrazione
`20260925150000_assessment_operational_questions`:

| semanticRole | Chiave nel profilo | Opzioni |
|---|---|---|
| `TRAINING_AVAILABILITY_DAYS` | `training_days_available` | 1–7 giorni |
| `TRAINING_SESSION_DURATION` | `training_session_duration` | 30, 45, 60, 90, 120+ minuti |

Il comportamento dipende dal `semanticRole`, mai dal testo. La chiave nel profilo
è quella letta da `TrainingConstraintsService`.

Ogni risposta operativa viene scritta **subito** in
`UserOnboardingAssessment.profileJson` (`{ label, value }`), prima di qualunque
invio. All'invio esistente viene inclusa di nuovo, dopo le risposte della
discovery. Non entra mai nel punteggio: lo scope `GENERAL` è escluso dal calcolo
dei driver e dal Performance Index.

La stessa migrazione **disattiva** le vecchie domande discovery
`pf4_training_days_available` e `pf4_training_session_duration`: l'atleta
risponde una volta sola, nell'assessment. La frequenza abituale
(`general_training_frequency`) resta nella discovery. Il questionario legacy
(`loadActiveGeneralTemplates`) esclude le domande operative e resta invariato.

## Domande dei driver (scritte dall'AI)

Non ci sono più domande di driver preconfezionate. Quando l'atleta ha risposto
alle domande operative, il percorso risponde con
`questionsPending: true` e la pagina mostra «Prepariamo le tue domande…». La
pagina chiama da sola `POST /athlete-journey/questions`, che in un'unica
richiesta all'AI fa scrivere `initialQuestionsPerArea` domande per ogni driver
attivo, su misura per:

- le risposte del funnel (obiettivo, esperienza, frequenza, salute);
- la disponibilità all'allenamento;
- la classifica FIT di padel e tennis, attuale e migliore di sempre (mai il
  numero di tessera).

Il prompt è «Domande conoscitive iniziali» (`INITIAL_QUESTIONS`), il primo in
**AI Tuner › Prompt** (`/ai-tuner/prompts/domande-iniziali`): si modifica, si
versiona e si prova sul caso sintetico come gli altri. Le regole di formato sono
fisse e si aggiungono al testo modificabile: esattamente N domande per driver,
da 3 a 5 opzioni, testi brevi e mai ripetuti. Gli score delle opzioni di una
domanda sono tutti diversi, in ordine crescente o decrescente, e vanno dal
minimo al massimo della scala attiva: una domanda con score uguali (`[20, 20,
20]`) o che non tocca gli estremi (`[20, 50, 80]`) non distingue i livelli e
fa scartare il lotto.

**Domande a scelta multipla.** L'AI decide quando una domanda ammette più
risposte (`multiple: true`, per esempio dove si sente fastidio) e può marcare
un'opzione come esclusiva (`exclusive: true`, per esempio «Nessuno»), che non
si combina con le altre. Una domanda multipla non ha l'ordine di score delle
singole, ma ogni opzione resta nella scala; ogni driver mantiene almeno una
domanda a scelta singola. La risposta è un elenco di valori. Alla valutazione
arrivano tutte le opzioni scelte, ciascuna con il suo score
(`selectedOptions`), e `optionScore` è la loro media, usata solo dal calcolo di
riserva senza AI. Lo stesso vale per le domande dei round di calibrazione,
tranne i chiarimenti, che restano a scelta singola. Il flag è salvato in
`UserOnboardingQuestion.multiple` e, nei round, nella domanda dentro
`questionsJson`.

Le domande sono salvate nella banca per atleta (`UserOnboardingQuestion`, con
`inputJson.kind = INITIAL_QUESTIONS`, provider, modello, versione del prompt) e
non si riscrivono: una seconda richiesta restituisce le stesse. Le risposte
continuano a produrre lo score del driver, il `realR` e il Performance Index.

**Se l'AI non risponde** o risponde fuori contratto, il backend riprova in
automatico (`INITIAL_QUESTIONS_ATTEMPTS` = 2), poi risponde 502
`INITIAL_QUESTIONS_UNAVAILABLE` e l'atleta vede «Le tue domande non sono
pronte.» con **Riprova**. Non ci sono domande di riserva: senza AI i passaggi
successivi (valutazione, calibrazione, scenari) non possono comunque partire.

**Se l'atleta corregge la classifica** dal profilo dopo che le domande sono
state scritte e prima della prima valutazione, le domande e le loro risposte si
cancellano e l'AI le riscrive per la classifica nuova.

Una configurazione senza driver o senza domande operative è un errore:

- `GET /auth/journey` restituisce la fase `ASSESSMENT_UNAVAILABLE` e l'atleta vede
  «Il questionario non è ancora disponibile».
- `POST /athlete-journey/start` risponde 409 `ASSESSMENT_CONFIGURATION_INVALID` e
  non crea domande.

## Dopo l'ultima risposta

`assessmentComplete` diventa `true` quando il cursore supera l'ultima domanda. La
pagina mostra «Risposte registrate.», con il progressivo completo e la possibilità
di tornare indietro a correggere, e la CTA **Analizza le mie risposte**. La CTA avvia
la prima valutazione AI delle risposte: R provvisoria per driver con confidenza,
descritta in [Prima valutazione AI dell'assessment](assessment-ai-evaluation.md).
Dopo la valutazione le risposte non sono più modificabili.

L'endpoint `POST /athlete-journey/submit` e le schermate di risultato e durata
restano nel codice per gli atleti che le hanno già raggiunte; il nuovo percorso non
vi arriva.

## Editor admin (`/admin/assessment`)

Le domande di driver di questo editor non entrano più nel percorso, che le fa
scrivere all'AI. Restano le domande operative, bloccate.

Riusa i componenti della Discovery: l'editor delle opzioni
(`app/admin/components/option-list-editor.tsx`, ora condiviso), le schede, le
azioni e gli helper.

- **Domande operative.** Etichetta «SISTEMA · BLOCCATA» e la nota «Questa domanda
  alimenta direttamente la programmazione degli allenamenti.» Nessuna azione: il
  backend rifiuta modifica ed eliminazione (403).
- **Driver.** Domande raggruppate per driver con il contatore delle attive.
  Testo, aiuto, opzioni e punteggi si modificano. L'ordine si cambia dentro il
  driver: le domande si scambiano gli indici, così il driver non si sposta.
  Driver e tipo a punteggio restano fissi.
- **Limiti.** Aggiungere o attivare una quinta domanda in un driver dà «Il driver
  può avere al massimo 4 domande attive.» Disattivare o eliminare l'ultima domanda
  di driver attiva dell'anamnesi dà «L’anamnesi deve avere almeno una domanda di
  driver attiva.» Un driver può restare senza domande. Una bozza disattivata si
  può creare. `GET /admin/assessment-templates` espone `maxPerArea`.

API (ruolo `ADMIN`):

| Metodo e percorso | Effetto |
|---|---|
| `GET /admin/assessment-templates` | operative, driver, conteggi e problemi della specializzazione PF4 |
| `POST /admin/assessment-templates` | crea una domanda di driver |
| `PATCH /admin/assessment-templates/:id` | modifica testo, aiuto, opzioni o stato |
| `DELETE /admin/assessment-templates/:id` | elimina una domanda di driver |
| `POST /admin/assessment-templates/reorder` | `{ areaId, ids }` |

La pagina AI Tuner «Anamnesi» resta invariata: vale l'ownership temporanea
descritta in [Gestione admin della discovery](discovery-admin.md).

## Verifica

- **API unit** (`assessment-configuration.spec.ts`): conteggi con 5, 6 e 4
  driver; driver con 1 o 3 domande; opzioni senza punteggio; altri sport
  ignorati; operativa mancante; operative in testa con chiave semantica; ordine
  dei driver.
- **API unit** (`initial-questions.spec.ts`): contratto delle domande
  dell'AI (N per driver, driver estranei, doppioni, score fuori scala, opzioni),
  riprova automatica ed errore da riprovare.
- **PostgreSQL** (`test/db/discovery.integration-spec.ts`): configurazione
  invalida che non parte e non genera domande; 2 operative in testa; AI che non
  risponde (502, nessuna domanda di riserva) e riprova; 12
  domande dell'AI a coppie per driver; classifica corretta che fa riscrivere le
  domande; profilo scritto alla prima risposta; stop con `assessmentComplete`.
- **Web** (`questions-preparing.test.tsx`, `ai-tuner/prompts/domande-iniziali`):
  richiesta automatica una volta sola, Riprova, prova del prompt.
- **PostgreSQL** (`test/db/assessment-editor.integration-spec.ts`): operative
  bloccate, modifica di testo e punteggi, vincolo di 2 domande, bozze, riordino
  interno al driver.
- **Web**: numeri in lettere (`italian-number.test.ts`); intro con 12, 14 e 16
  domande dal backend e la sezione «Cosa si attiva dopo»; sezione Disponibilità per
  prima; progressivo sul `count`; stop senza alcuna azione successiva né invio; configurazione
  non disponibile; editor con operative bloccate, modifica punteggi, messaggi del
  backend e riordino.
