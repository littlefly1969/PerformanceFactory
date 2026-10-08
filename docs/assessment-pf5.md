# Assessment PF5 dopo il login

## Risultato

Dopo login (email/password o Google) e consensi, invariati, l'atleta vede l'intro
PF5 e un unico questionario continuo, seguito dalla prima valutazione AI delle
risposte.

```
login → consensi → intro PF5 → domande operative → domande dei driver
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
count = domande operative + somma delle domande dei driver attivi
estimatedMinutes = max(1, ceil(count / 3))
```

Con la configurazione padel attuale: 2 domande operative + 6 driver × 2 domande
= 14 domande, circa 5 minuti. Le risposte `GET /auth/journey` e
`POST /athlete-journey/start` riportano `fixedQuestionCount`,
`areaQuestionCount`, `count` ed `estimatedMinutes`.

Ordine obbligatorio:

1. **Domande operative**, sezione «Disponibilità».
2. **Domande dei driver**, nell'ordine configurato dei driver (quello della loro
   prima domanda) e, dentro ogni driver, per `orderIndex`.

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

## Domande dei driver (configurabili)

Restano template `scope = AREA` con `areaId` e `optionsJson.sportKey`, e opzioni
`{ value, label, score }`. L'anamnesi iniziale non ha un numero fisso di domande
per driver: ogni driver attivo ne ha da 0 a `MAX_AREA_QUESTIONS` = 4, ciascuna
con opzioni a punteggio, e l'anamnesi ne ha almeno una in tutto. Un driver senza
domande entra comunque nella prima valutazione AI, con `answers` vuoto e
confidence bassa; i round di calibrazione lo approfondiscono. Nella vista
dell'atleta i driver senza domande vengono dopo quelli della sequenza.
Le risposte continuano a produrre lo score del driver, il `realR` e il
Performance Index come prima.

Una configurazione fuori da questi limiti è un errore, non un caso da aggiustare:

- `GET /auth/journey` restituisce la fase `ASSESSMENT_UNAVAILABLE` e l'atleta vede
  «Il questionario non è ancora disponibile».
- `POST /athlete-journey/start` risponde 409 `ASSESSMENT_CONFIGURATION_INVALID` e
  non crea domande.
- Il log tecnico riporta il dettaglio, per esempio
  `ASSESSMENT_CONFIGURATION_INVALID Area "Nutrizione": expected at most 4 active questions, found 5`.

Il journey PF5 non usa più il fallback storico (`QUESTIONS_PER_AREA` = 3 e
generazione AI delle domande specialistiche). Quel codice resta per il flusso
legacy.

All'avvio le domande dei driver vengono copiate nella banca per atleta
(`UserOnboardingQuestion`) con la loro posizione nella sequenza. Le modifiche
successive dell'editor valgono solo per i nuovi assessment.

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
- **PostgreSQL** (`test/db/discovery.integration-spec.ts`): configurazione
  invalida che non parte e non genera domande; 2 operative in testa più 12 di
  driver; profilo scritto alla prima risposta; stop con `assessmentComplete`;
  profilo e baseline all'invio esistente.
- **PostgreSQL** (`test/db/assessment-editor.integration-spec.ts`): operative
  bloccate, modifica di testo e punteggi, vincolo di 2 domande, bozze, riordino
  interno al driver.
- **Web**: numeri in lettere (`italian-number.test.ts`); intro con 12, 14 e 16
  domande dal backend e la sezione «Cosa si attiva dopo»; sezione Disponibilità per
  prima; progressivo sul `count`; stop senza alcuna azione successiva né invio; configurazione
  non disponibile; editor con operative bloccate, modifica punteggi, messaggi del
  backend e riordino.
