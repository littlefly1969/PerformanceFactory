# Storico immutabile dei prompt AI

## Contesto

Prima di questa decisione, i prompt AI modificabili erano salvati direttamente sui record operativi:

| Famiglia prompt | Modello corrente | Campo versione | Comportamento su update |
| --- | --- | --- | --- |
| Validazione obiettivo | `AiGoalPromptConfig` | `version` | Il record veniva aggiornato e `version` incrementata. |
| Generazione proposta area | `AiAreaGenerationConfig` | Nessun campo versione storico | Il record veniva aggiornato in place. |
| Prompt area sport/specializzazione | `SportSpecializationAreaPrompt` | `version` | Il record veniva aggiornato e `version` incrementata. |
| Prompt allenamento specifico | `SportSpecialization.trainingPrompt` | `trainingPromptVersion` | Il record specializzazione veniva aggiornato e la versione incrementata quando il prompt veniva inviato. |

Gli audit AI salvano `promptVersion`, `promptHash` e `inputJson`, quindi permettono di ricostruire il prompt usato da una singola generazione. Non erano pero un registro completo di ogni modifica amministrativa: una modifica a un prompt senza generazione successiva poteva sovrascrivere il contenuto precedente.

## Decisione

Si introduce `AiPromptVersion` come tabella append-only per lo storico amministrativo dei prompt.

Ogni record operativo continua a contenere i campi correnti per compatibilita con orchestrator, onboarding, AI tuner e UI. In piu punta alla versione attiva:

| Record corrente | Puntatore attivo |
| --- | --- |
| `AiGoalPromptConfig` | `activePromptVersionId` |
| `AiAreaGenerationConfig` | `activePromptVersionId` |
| `SportSpecializationAreaPrompt` | `activePromptVersionId` |
| `SportSpecialization` training prompt | `activeTrainingPromptVersionId` |

`AiPromptVersion` contiene:

| Campo | Scopo |
| --- | --- |
| `promptType` | `GOAL`, `AREA_GENERATION`, `SPORT_AREA`, `TRAINING`. |
| `version` | Versione numerica della famiglia prompt. |
| `contentJson` | Snapshot immutabile del contenuto rilevante. |
| FK opzionale owner | Collega la versione al record operativo proprietario. |
| `createdById`, `createdAt` | Audit minimo della modifica. |

## Comportamento

- La creazione di un prompt crea anche la versione 1.
- L'update crea una nuova riga `AiPromptVersion` e aggiorna il puntatore attivo.
- Le versioni precedenti non vengono modificate.
- L'orchestrator continua a leggere i record correnti, quindi la selezione esterna del prompt non cambia.
- Il contesto di audit include anche gli identificativi della versione attiva quando disponibili.
- `GET /ai-tuning/prompt-versions` espone lo storico per `type` e `ownerId` senza cambiare le route esistenti.

## Migrazione e backfill

La migration `20260531120000_ai_prompt_immutable_versions`:

- crea `AiPromptVersion`;
- aggiunge i puntatori attivi ai record correnti;
- aggiunge `version` a `AiAreaGenerationConfig`, con default `1`;
- crea una versione iniziale per i record esistenti di goal prompt, config area, prompt area sport/specializzazione e training prompt non null;
- collega ogni record corrente alla versione iniziale generata.

I campi esistenti non vengono rimossi: servono per compatibilita dati, API e selezione prompt corrente.

## Limiti rimasti

- Lo storico e immutabile a livello applicativo e DB per insert-only ordinari, ma non introduce trigger database che impediscano update manuali su `AiPromptVersion`.
- Le evaluation AI tuner continuano a lavorare con varianti libere e golden context; non diventano automaticamente release immutabili.
- Gli audit storici precedenti alla migration restano leggibili tramite `inputJson`, ma non vengono retro-collegati a una specifica riga `AiPromptVersion`.
