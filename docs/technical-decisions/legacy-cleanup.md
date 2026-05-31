# Legacy cleanup sicuro

## Scopo

Questa nota inventaria i percorsi legacy ancora presenti e definisce cosa puo essere rimosso, cosa va mantenuto per compatibilita e quali decisioni prodotto servono prima di una rimozione definitiva.

Non sono stati introdotti comandi distruttivi, reset database o cleanup amministrativi. La fase e limitata a deprecare esplicitamente i percorsi legacy e a documentare il piano di uscita.

## Inventario

| Simbolo/percorso | Classificazione | Uso corrente | Azione |
| --- | --- | --- | --- |
| `GuidanceContent` | Deprecated ma ancora richiesto per compatibilita | Modello Prisma V1, usato da `/guidance` e test e2e legacy. | Tenere il modello; API marcata deprecated; non usare per nuovi flussi. |
| `UserAssignment` | Deprecated ma ancora richiesto per compatibilita | Modello Prisma V1, usato da `/assignments` e reset utente admin. | Tenere il modello; API marcata deprecated; non usare per nuovi flussi. |
| `apps/api/src/guidance/*` | Deprecated e attivo | Scrive/legge `GuidanceContent`, assegna `UserAssignment`. | Isolare come legacy; rimuovere solo dopo decisione su route/API. |
| `apps/api/src/assignments/*` | Deprecated e attivo | Legge/completa `UserAssignment`. | Isolare come legacy; rimuovere solo dopo decisione su route/API. |
| `apps/api/test/guidance-assignments.e2e-spec.ts` | Test-only compatibility | Copre le route legacy e verifica assenza di leak password. | Tenere finche le route restano montate. |
| `GuidanceModule` / `AssignmentsModule` in `AppModule` | Deprecated ma attivo | Espone route pubbliche legacy autenticate. | Non rimuovere senza fase di breaking change. |
| `AiPromptConfig` in docs vecchie | Dead/stale documentation | Il modello legacy e gia stato rimosso da migration precedente. | Aggiornare docs verso `AiGoalPromptConfig`, `AiAreaGenerationConfig`, `AiPromptVersion`. |
| `fallback` in consensi/onboarding/AI | Active current behavior | Usato per compatibilita o bootstrap dati. | Non toccare in questa fase; gia documentato nei flow AI/onboarding. |
| `legacy` in normalizzazione anamnesi orchestrator | Deprecated compatibility | Legge risposte onboarding vecchie con shape precedente. | Mantenere finche esistono dati storici. |
| `v1` in chiavi storage frontend/versioni prompt | Active current behavior/documentation | Identifica schema storage locale o versioni runtime. | Non e legacy da rimuovere automaticamente. |
| Migrations storiche `GuidanceContent`/`UserAssignment` | Documentation/schema history | Necessarie alla storia Prisma. | Non modificare. |

## GuidanceContent e UserAssignment

Stato verificato:

| Domanda | Risposta |
| --- | --- |
| API correnti scrivono `GuidanceContent`? | Si: `POST /guidance`. |
| API correnti leggono `GuidanceContent`? | Si: `GET /guidance` e lettura indiretta da assignments. |
| API correnti scrivono `UserAssignment`? | Si: `POST /guidance/assign`; `POST /assignments/:id/complete` aggiorna lo stato. |
| API correnti leggono `UserAssignment`? | Si: `GET /assignments/my`; admin reset/count lo include per compatibilita dati. |
| Frontend corrente dipende da questi endpoint? | Non sono emersi consumatori in `apps/web/app`. |
| Test correnti dipendono da questi endpoint? | Si: `guidance-assignments.e2e-spec.ts`. |
| Seed corrente crea questi record? | Non emerso nel codice corrente; le migration storiche creano solo le tabelle. |
| Flussi business nuovi li usano? | No: i flussi V2+ usano piani, item, question set, training, prompt AI e approval. |

## Decisione

`GuidanceContent` e `UserAssignment` restano nel Prisma schema e nelle API per compatibilita, ma sono marcati come deprecated in codice e Swagger. Non vanno usati per nuovi flussi.

Non sono state rimosse route pubbliche per evitare un cambio di comportamento non richiesto. Non sono state rimosse tabelle o migration per evitare perdita di compatibilita dati.

## Piano di rimozione sicuro

1. Verificare da log/accessi se `/guidance`, `/guidance/assign`, `/assignments/my` e `/assignments/:id/complete` sono ancora usati.
2. Se non usati, annunciare deprecazione API e bloccare la creazione di nuovi `GuidanceContent`/`UserAssignment` dietro feature flag o configurazione.
3. Migrare eventuali contenuti ancora necessari verso i flussi correnti: `ImprovementPlanRelease`, `PlanItem`, `QuestionSet`, training plan o prompt AI.
4. Rimuovere frontend/test legacy solo dopo dismissione route.
5. Solo in una migration dedicata, rimuovere modelli/tabelle e riferimenti da `User`/`Area`.

## Rischi

- Rimuovere oggi i moduli romperebbe route autenticate ancora coperte da test.
- Tenere le route legacy puo permettere creazione accidentale di record V1; per questo sono ora marcate deprecated e documentate.
- La rimozione dei modelli Prisma richiede una fase separata con audit dati e migration esplicita.
