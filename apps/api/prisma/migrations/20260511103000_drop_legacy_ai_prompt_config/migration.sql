DROP TABLE IF EXISTS "AiPromptConfig";

UPDATE "AiAreaGenerationConfig"
SET
  "initialContext" = REPLACE(
    "initialContext",
    'Genera una proposta di miglioramento specifica per area e tre domande di monitoraggio',
    'Genera una proposta di miglioramento specifica per area e le domande di monitoraggio richieste dal layout AI'
  ),
  "responseFormatPrompt" = REPLACE(
    "responseFormatPrompt",
    'e tre domande di monitoraggio.',
    'e il numero di domande di monitoraggio richiesto dal layout AI.'
  ),
  "updatedAt" = CURRENT_TIMESTAMP;
