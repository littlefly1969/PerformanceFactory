CREATE TABLE "AiAreaGenerationConfig" (
  "id" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "initialContext" TEXT NOT NULL,
  "responseFormatPrompt" TEXT NOT NULL,
  "questionnaireLayoutJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "AiAreaGenerationConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAreaGenerationConfig_areaId_key" ON "AiAreaGenerationConfig"("areaId");

ALTER TABLE "AiAreaGenerationConfig"
ADD CONSTRAINT "AiAreaGenerationConfig_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AiAreaGenerationConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "AiAreaGenerationConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AiAreaGenerationConfig" (
  "id",
  "areaId",
  "initialContext",
  "responseFormatPrompt",
  "questionnaireLayoutJson",
  "updatedAt"
)
SELECT
  'area-generation-config-' || "Area"."id",
  "Area"."id",
  'Sei un assistente senior di sport performance a supporto di professionisti umani. Genera una proposta di miglioramento specifica per area e tre domande di monitoraggio usando solo il contesto atleta fornito. Rispondi esclusivamente in italiano e solo con JSON valido conforme allo schema. Il lavoro deve essere pratico, misurabile, progressivo e revisionabile da un professionista. Non inventare diagnosi, indicazioni mediche, dati atleta non presenti o contesto nascosto. Se esistono lavori precedenti, usa note di completamento, punteggi e motivi di rifiuto per migliorare la proposta.',
  'La risposta deve contenere una sintesi breve, da uno a tre esercizi/attivita con titolo e descrizione operativa, e tre domande di monitoraggio. Ogni attivita deve indicare azione, frequenza o trigger, criterio misurabile di successo e progressione. Le domande devono essere brevi, osservabili e collegate al lavoro proposto.',
  '{
    "questionnaire": {
      "questions": 3,
      "answerOptions": [
        { "label": "Non ancora", "score": 0 },
        { "label": "A volte", "score": 50 },
        { "label": "Spesso", "score": 75 },
        { "label": "Con costanza", "score": 100 }
      ],
      "questionStyle": "breve, concreta, misurabile",
      "focus": "aderenza o esecuzione osservabile del lavoro proposto"
    }
  }'::jsonb,
  CURRENT_TIMESTAMP
FROM "Area";
