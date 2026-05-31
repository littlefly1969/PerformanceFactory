ALTER TABLE "AiGoalPromptConfig"
  ADD COLUMN "activePromptVersionId" TEXT;

ALTER TABLE "AiAreaGenerationConfig"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "activePromptVersionId" TEXT;

ALTER TABLE "SportSpecialization"
  ADD COLUMN "activeTrainingPromptVersionId" TEXT;

ALTER TABLE "SportSpecializationAreaPrompt"
  ADD COLUMN "activePromptVersionId" TEXT;

CREATE TABLE "AiPromptVersion" (
  "id" TEXT NOT NULL,
  "promptType" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contentJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "goalPromptConfigId" TEXT,
  "areaGenerationConfigId" TEXT,
  "sportSpecializationAreaPromptId" TEXT,
  "sportSpecializationId" TEXT,

  CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiGoalPromptConfig_activePromptVersionId_key"
  ON "AiGoalPromptConfig"("activePromptVersionId");
CREATE UNIQUE INDEX "AiAreaGenerationConfig_activePromptVersionId_key"
  ON "AiAreaGenerationConfig"("activePromptVersionId");
CREATE UNIQUE INDEX "SportSpecialization_activeTrainingPromptVersionId_key"
  ON "SportSpecialization"("activeTrainingPromptVersionId");
CREATE UNIQUE INDEX "SportSpecializationAreaPrompt_activePromptVersionId_key"
  ON "SportSpecializationAreaPrompt"("activePromptVersionId");

CREATE UNIQUE INDEX "AiPromptVersion_goalPromptConfigId_version_key"
  ON "AiPromptVersion"("goalPromptConfigId", "version");
CREATE UNIQUE INDEX "AiPromptVersion_areaGenerationConfigId_version_key"
  ON "AiPromptVersion"("areaGenerationConfigId", "version");
CREATE UNIQUE INDEX "AiPromptVersion_sportSpecializationAreaPromptId_version_key"
  ON "AiPromptVersion"("sportSpecializationAreaPromptId", "version");
CREATE UNIQUE INDEX "AiPromptVersion_sportSpecializationId_version_key"
  ON "AiPromptVersion"("sportSpecializationId", "version");
CREATE INDEX "AiPromptVersion_promptType_createdAt_idx"
  ON "AiPromptVersion"("promptType", "createdAt");
CREATE INDEX "AiPromptVersion_createdById_createdAt_idx"
  ON "AiPromptVersion"("createdById", "createdAt");

INSERT INTO "AiPromptVersion" (
  "id",
  "promptType",
  "version",
  "contentJson",
  "createdAt",
  "createdById",
  "goalPromptConfigId"
)
SELECT
  CONCAT('prompt-version-goal-', "id", '-', "version"),
  'GOAL',
  "version",
  jsonb_build_object(
    'name', "name",
    'basePrompt', "basePrompt",
    'isActive', "isActive"
  ),
  "updatedAt",
  "updatedById",
  "id"
FROM "AiGoalPromptConfig";

UPDATE "AiGoalPromptConfig"
SET "activePromptVersionId" = CONCAT(
  'prompt-version-goal-',
  "id",
  '-',
  "version"
);

INSERT INTO "AiPromptVersion" (
  "id",
  "promptType",
  "version",
  "contentJson",
  "createdAt",
  "createdById",
  "areaGenerationConfigId"
)
SELECT
  CONCAT('prompt-version-area-config-', "id", '-1'),
  'AREA_GENERATION',
  1,
  jsonb_build_object(
    'areaId', "areaId",
    'initialContext', "initialContext",
    'responseFormatPrompt', "responseFormatPrompt",
    'questionnaireLayoutJson', "questionnaireLayoutJson"
  ),
  "updatedAt",
  "updatedById",
  "id"
FROM "AiAreaGenerationConfig";

UPDATE "AiAreaGenerationConfig"
SET "activePromptVersionId" = CONCAT('prompt-version-area-config-', "id", '-1');

INSERT INTO "AiPromptVersion" (
  "id",
  "promptType",
  "version",
  "contentJson",
  "createdAt",
  "createdById",
  "sportSpecializationAreaPromptId"
)
SELECT
  CONCAT('prompt-version-sport-area-', "id", '-', "version"),
  'SPORT_AREA',
  "version",
  jsonb_build_object(
    'specializationId', "specializationId",
    'areaId', "areaId",
    'basePrompt', "basePrompt",
    'isEnabledDriver', "isEnabledDriver",
    'isActive', "isActive"
  ),
  "updatedAt",
  "updatedById",
  "id"
FROM "SportSpecializationAreaPrompt";

UPDATE "SportSpecializationAreaPrompt"
SET "activePromptVersionId" = CONCAT(
  'prompt-version-sport-area-',
  "id",
  '-',
  "version"
);

INSERT INTO "AiPromptVersion" (
  "id",
  "promptType",
  "version",
  "contentJson",
  "createdAt",
  "sportSpecializationId"
)
SELECT
  CONCAT('prompt-version-training-', "id", '-', "trainingPromptVersion"),
  'TRAINING',
  "trainingPromptVersion",
  jsonb_build_object(
    'specializationId', "id",
    'trainingPrompt', "trainingPrompt",
    'trainingPromptActive', "trainingPromptActive"
  ),
  "updatedAt",
  "id"
FROM "SportSpecialization"
WHERE "trainingPrompt" IS NOT NULL;

UPDATE "SportSpecialization"
SET "activeTrainingPromptVersionId" = CONCAT(
  'prompt-version-training-',
  "id",
  '-',
  "trainingPromptVersion"
)
WHERE "trainingPrompt" IS NOT NULL;

ALTER TABLE "AiPromptVersion"
  ADD CONSTRAINT "AiPromptVersion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AiPromptVersion_goalPromptConfigId_fkey"
  FOREIGN KEY ("goalPromptConfigId") REFERENCES "AiGoalPromptConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AiPromptVersion_areaGenerationConfigId_fkey"
  FOREIGN KEY ("areaGenerationConfigId") REFERENCES "AiAreaGenerationConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AiPromptVersion_sportSpecializationAreaPromptId_fkey"
  FOREIGN KEY ("sportSpecializationAreaPromptId") REFERENCES "SportSpecializationAreaPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AiPromptVersion_sportSpecializationId_fkey"
  FOREIGN KEY ("sportSpecializationId") REFERENCES "SportSpecialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiGoalPromptConfig"
  ADD CONSTRAINT "AiGoalPromptConfig_activePromptVersionId_fkey"
  FOREIGN KEY ("activePromptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiAreaGenerationConfig"
  ADD CONSTRAINT "AiAreaGenerationConfig_activePromptVersionId_fkey"
  FOREIGN KEY ("activePromptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SportSpecialization"
  ADD CONSTRAINT "SportSpecialization_activeTrainingPromptVersionId_fkey"
  FOREIGN KEY ("activeTrainingPromptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SportSpecializationAreaPrompt"
  ADD CONSTRAINT "SportSpecializationAreaPrompt_activePromptVersionId_fkey"
  FOREIGN KEY ("activePromptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
