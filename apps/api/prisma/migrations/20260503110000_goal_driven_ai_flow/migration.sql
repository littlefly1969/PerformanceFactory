-- Goal-driven AI flow: athlete goal, admin goal prompt, and generated user-area prompts.

CREATE TABLE "UserPerformanceGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPerformanceGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiGoalPromptConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePrompt" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AiGoalPromptConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAreaPromptInstruction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAreaPromptInstruction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPerformanceGoal_userId_key" ON "UserPerformanceGoal"("userId");
CREATE UNIQUE INDEX "AiGoalPromptConfig_name_key" ON "AiGoalPromptConfig"("name");
CREATE INDEX "AiGoalPromptConfig_isActive_version_idx" ON "AiGoalPromptConfig"("isActive", "version");
CREATE UNIQUE INDEX "UserAreaPromptInstruction_userId_areaId_key" ON "UserAreaPromptInstruction"("userId", "areaId");
CREATE INDEX "UserAreaPromptInstruction_goalId_idx" ON "UserAreaPromptInstruction"("goalId");
CREATE INDEX "UserAreaPromptInstruction_userId_updatedAt_idx" ON "UserAreaPromptInstruction"("userId", "updatedAt");

ALTER TABLE "UserPerformanceGoal"
  ADD CONSTRAINT "UserPerformanceGoal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiGoalPromptConfig"
  ADD CONSTRAINT "AiGoalPromptConfig_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiGoalPromptConfig"
  ADD CONSTRAINT "AiGoalPromptConfig_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserAreaPromptInstruction"
  ADD CONSTRAINT "UserAreaPromptInstruction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserAreaPromptInstruction"
  ADD CONSTRAINT "UserAreaPromptInstruction_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAreaPromptInstruction"
  ADD CONSTRAINT "UserAreaPromptInstruction_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "UserPerformanceGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
