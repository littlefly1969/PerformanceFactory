CREATE TYPE "OnboardingQuestionScope" AS ENUM ('GENERAL', 'AREA');

CREATE TYPE "OnboardingInputType" AS ENUM ('TEXT', 'NUMBER', 'SELECT', 'SCORE');

ALTER TABLE "User"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "UserOnboardingAssessment"
ADD COLUMN "profileJson" JSONB;

CREATE TABLE "OnboardingQuestionTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "scope" "OnboardingQuestionScope" NOT NULL,
  "areaId" TEXT,
  "label" TEXT NOT NULL,
  "helpText" TEXT,
  "inputType" "OnboardingInputType" NOT NULL,
  "optionsJson" JSONB,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "orderIndex" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "OnboardingQuestionTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPromptConfig" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "basePrompt" TEXT NOT NULL,
  "areaId" TEXT,
  "athleteLevel" TEXT NOT NULL DEFAULT 'BASELINE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "AiPromptConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingQuestionTemplate_key_key" ON "OnboardingQuestionTemplate"("key");
CREATE INDEX "OnboardingQuestionTemplate_scope_areaId_isActive_orderIndex_idx" ON "OnboardingQuestionTemplate"("scope", "areaId", "isActive", "orderIndex");
CREATE INDEX "AiPromptConfig_areaId_athleteLevel_isActive_version_idx" ON "AiPromptConfig"("areaId", "athleteLevel", "isActive", "version");

ALTER TABLE "OnboardingQuestionTemplate"
ADD CONSTRAINT "OnboardingQuestionTemplate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "OnboardingQuestionTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "OnboardingQuestionTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiPromptConfig"
ADD CONSTRAINT "AiPromptConfig_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "AiPromptConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "AiPromptConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
