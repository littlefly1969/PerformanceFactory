# Assessment PF5 dopo il login

## Risultato

Dopo login (email/password o Google) e consensi, invariati, l'atleta vede l'intro
PF5 e un unico questionario continuo. La slice si ferma all'ultima risposta: cosa
succede dopo non è deciso qui.

```
login → consensi → intro PF5 → domande operative → domande dei driver
      → ultima risposta salvata (assessmentComplete) → STOP
```

## Intro

La schermata mostra:

- **PROVA GRATUITA ATTIVA · X GIORNI RIMASTI.** X è 7 meno i giorni trascorsi
  dalla creazione dell'account, con minimo 0. È solo visualizzazione: il sistema
  non ha ancora una prova reale e allo zero non si blocca nulla.
- **Ciao {nome}.**
- **"Prima di programmare qualcosa misuriamo dove sei: {count} domande, circa
  {estimatedMinutes} minuti."**
- CTA **Scopri la tua performance**, che avvia l'assessment.
- Sotto, un blocco informativo: disponibilità, driver, punto di partenza.

La UI usa solo `count` ed `estimatedMinutes` restituiti dal backend: non conosce
aree, domande per area né formula. Nessun numero di domande è scritto nel
frontend.

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
`{ value, label, score }`. Per ogni driver attivo servono **esattamente**
`EXPECTED_AREA_QUESTIONS` = 2 domande attive, ciascuna con opzioni a punteggio.
Le risposte continuano a produrre lo score del driver, il `realR` e il
Performance Index come prima.

Una configurazione diversa è un errore, non un caso da aggiustare:

- `GET /auth/journey` restituisce la fase `ASSESSMENT_UNAVAILABLE` e l'atleta vede
  «Il questionario non è ancora disponibile».
- `POST /athlete-journey/start` risponde 409 `ASSESSMENT_CONFIGURATION_INVALID` e
  non crea domande.
- Il log tecnico riporta il dettaglio, per esempio
  `ASSESSMENT_CONFIGURATION_INVALID Area "Nutrizione": expected 2 active questions, found 1`.

Il journey PF5 non usa più il fallback storico (`QUESTIONS_PER_AREA` = 3 e
generazione AI delle domande specialistiche). Quel codice resta per il flusso
legacy.

All'avvio le domande dei driver vengono copiate nella banca per atleta
(`UserOnboardingQuestion`) con la loro posizione nella sequenza. Le modifiche
successive dell'editor valgono solo per i nuovi assessment.

## Confine della slice

`assessmentComplete` diventa `true` quando il cursore supera l'ultima domanda.
La pagina mostra la schermata di completamento esistente e **non** invia nulla da
sola: l'invio (`POST /athlete-journey/submit`), l'elaborazione, il risultato e la
durata restano quelli di prima, da ridefinire nella slice successiva.

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
- **Vincolo di 2.** Disattivare o eliminare una delle due domande attive dà «Ogni
  driver attivo deve avere esattamente 2 domande. Disattiva il driver oppure
  configura una domanda sostitutiva.» Aggiungere o attivare una terza dà «Il
  driver può avere esattamente 2 domande attive.» Una bozza disattivata si può
  creare.

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
- **Web**: intro con 12, 14 e 16 domande dal backend; sezione Disponibilità per
  prima; progressivo sul `count`; stop senza invio automatico; configurazione
  non disponibile; editor con operative bloccate, modifica punteggi, messaggi del
  backend e riordino.
