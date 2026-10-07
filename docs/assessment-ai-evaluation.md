# Prima valutazione AI dell'assessment

## Risultato

Finite le risposte dell'assessment PF5, l'atleta conferma con **Analizza le mie
risposte**. L'AI legge le risposte e restituisce, in un formato fisso e validato, la
Performance Reale (R) **provvisoria** di ogni driver con confidenza e motivazione.
Il risultato viene salvato e mostrato nello Spider.

```
ultima risposta → «Risposte registrate.» (si può ancora correggere)
  → Analizza le mie risposte → PROCESSING → EVALUATION (Spider R provvisoria)
```

Riferimenti del Product Blueprint (baseline 02/10/2026):

- **A4.4**: ogni asse ha score R + confidence + versione/timestamp; il backend non
  confonde punteggio e confidence; lo Spider passa da «flebile» a «consolidato».
- **A3.9 / CURRENT Index**: R nasce nella fase gratuita con confidence progressiva;
  P3/P6/P12 solo a calibrazione chiusa, senza inventare P.
- **A4.6**: AI_ASSESSMENT separata da AI_COACHING.
- **A3.3**: la R globale non è una media dei driver; la regola è demandata alla
  Parte C, quindi qui non viene calcolata.

Prima di questa slice lo Spider era calcolato solo con regole fisse
(`apps/api/src/ai-orchestrator/performance-scoring.ts`: media dei punteggi delle
opzioni per driver, fusione con lo storico, potenziale da `PerformanceScaleConfig`).
Quel calcolo resta per il flusso `submit` esistente.

## Formato di risposta

Il prompt modificabile descrive il metodo; il sistema aggiunge sempre le regole di
formato e lo schema JSON (`assessment-evaluation-model.ts`), che l'AI Tuner non può
cambiare:

```json
{
  "summary": "≤ 600 caratteri",
  "overallConfidence": 0,
  "drivers": [
    {
      "areaId": "id del driver ricevuto",
      "score": 0,
      "confidence": 0,
      "rationale": "≤ 400 caratteri",
      "evidenceGaps": ["≤ 3 voci, ≤ 160 caratteri"]
    }
  ]
}
```

`validateAssessmentEvaluation` scarta l'intera risposta se un driver manca, è
duplicato o sconosciuto, se lo score è fuori dalla scala attiva
(`PerformanceScaleConfig`, default 0–100), se la confidence non è un intero 0–100 o
se i testi sono vuoti o troppo lunghi. In quel caso l'atleta vede «La valutazione
delle risposte non è riuscita. Riprova.», il lease viene rilasciato e può riprovare.

## Input inviato all'AI

Senza nome, email o id utente:

- per ogni driver dell'assessment (quelli copiati nella banca dell'atleta, nel loro
  ordine): domanda, opzione scelta, punteggio dell'opzione e intervallo dei punteggi
  possibili;
- le risposte operative (giorni e durata);
- le risposte della discovery salvate alla registrazione;
- la scala attiva.

Con un provider esterno serve il consenso `AI`/`AI_ASSISTANT`, come per le proposte
di training.

## Persistenza

| Tabella | Contenuto |
|---|---|
| `AssessmentEvaluation` | `status = PROVISIONAL`, `source = SELF_ASSESSMENT`, sintesi, confidence complessiva, scala, provider, modello, `promptVersionId`, hash, input e output validati, latenza |
| `AssessmentEvaluationArea` | per driver: score, confidence, motivazione, `evidenceGaps` |

Una sola valutazione per atleta in questa slice, garantita anche dal database:
`sequence = 1` con vincolo unico `(userId, sequence)`. Due richieste concorrenti, o
un lease scaduto durante una chiamata lenta, salvano comunque una sola valutazione;
la seconda restituisce quella già salvata. Dopo la valutazione `answer` e `back`
rispondono 409. `POST /athlete-journey/evaluate` ripetuto restituisce la
valutazione esistente. `GET /auth/journey` espone la fase `EVALUATION` e il campo
`evaluation`.

## Prompt nell'AI Tuner

`/ai-tuner/prompts` → card **Valutazione dell'assessment** →
`/ai-tuner/prompts/valutazione`. Funziona come il prompt obiettivo:

- alla prima lettura nasce la configurazione `assessment-prompt-default`, attiva, con
  il prompt di partenza `DEFAULT_ASSESSMENT_PROMPT`;
- modificare il prompt in uso crea una bozza; **Rendi attivo** la attiva per tutte le
  nuove valutazioni e disattiva le altre;
- ogni salvataggio crea una `AiPromptVersion` con `promptType =
  ASSESSMENT_EVALUATION`, e ogni valutazione ricorda la versione usata;
- **Prova la bozza** esegue la bozza senza salvare nulla. Di default usa un caso
  sintetico (`assessment-synthetic-case.ts`), quindi nessun dato reale esce dal
  sistema. Una valutazione reale si usa solo se scelta esplicitamente dall'elenco
  (atleta pseudonimizzato) e, con un provider esterno, solo se il suo atleta ha in
  quel momento il consenso `AI`/`AI_ASSISTANT`; altrimenti la prova viene rifiutata
  prima di chiamare il provider;
- le scritture sulle configurazioni sono serializzate con un advisory lock
  PostgreSQL: due attivazioni simultanee lasciano comunque un solo prompt attivo.

API (`AI_TUNER`; lettura anche `ADMIN`):

| Metodo e percorso | Effetto |
|---|---|
| `GET /ai-tuning/assessment-prompts` | configurazioni, attiva per prima |
| `POST /ai-tuning/assessment-prompt` | `{ id?, name, basePrompt, isActive? }` |
| `GET /ai-tuning/assessment-prompt/test-cases` | ultime 20 valutazioni, atleta pseudonimizzato |
| `POST /ai-tuning/assessment-prompt/test` | `{ basePrompt, evaluationId? }`, nessun salvataggio |

## Sviluppo e test

Con `AI_PROVIDER=stub` (default fuori produzione) lo stub deterministico normalizza i
punteggi delle opzioni sulla scala e assegna confidence 15 per risposta, al massimo
40. Test: `assessment-evaluation.spec.ts` (contratto e stub),
`test/db/discovery.integration-spec.ts` (percorso reale su PostgreSQL),
`app/journey/page.test.tsx` e `app/ai-tuner/prompts/valutazione/page.test.tsx`.

## Aperto: il Blueprint non basta a decidere

- **Soglia e formula della confidence** (A4-D01, Parte C): oggi la decide l'AI
  seguendo il prompt; nessun limite massimo è imposto dal codice.
- **R globale**: non calcolata finché la Parte C non definisce l'aggregazione.
- **Dopo la valutazione**: domande adattive, stati `FREE_CALIBRATING` e successivi,
  ricalcolo di R con nuove evidenze. Il campo `evidenceGaps` è pensato per guidarle.
- La scala visiva «flebile → consolidato» è una prima proposta (opacità e tratteggio
  in funzione della confidence) in attesa della grammatica visiva di Fabio.
