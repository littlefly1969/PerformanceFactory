CREATE TABLE "UserSportSelection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sports" JSONB NOT NULL,
  "fitnessLocation" TEXT NOT NULL DEFAULT 'NONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSportSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSportAreaPromptConfig" (
  "id" TEXT NOT NULL,
  "sportKey" TEXT NOT NULL,
  "fitnessLocation" TEXT,
  "areaId" TEXT NOT NULL,
  "basePrompt" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "AiSportAreaPromptConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSportSelection_userId_key"
  ON "UserSportSelection"("userId");

CREATE UNIQUE INDEX "AiSportAreaPromptConfig_sportKey_fitnessLocation_areaId_key"
  ON "AiSportAreaPromptConfig"("sportKey", "fitnessLocation", "areaId");

CREATE INDEX "AiSportAreaPromptConfig_sportKey_fitnessLocation_isActive_idx"
  ON "AiSportAreaPromptConfig"("sportKey", "fitnessLocation", "isActive");

CREATE INDEX "AiSportAreaPromptConfig_areaId_idx"
  ON "AiSportAreaPromptConfig"("areaId");

ALTER TABLE "UserSportSelection"
  ADD CONSTRAINT "UserSportSelection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSportAreaPromptConfig"
  ADD CONSTRAINT "AiSportAreaPromptConfig_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSportAreaPromptConfig"
  ADD CONSTRAINT "AiSportAreaPromptConfig_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiSportAreaPromptConfig"
  ADD CONSTRAINT "AiSportAreaPromptConfig_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
