DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AiEvaluationRunStatus') THEN
    CREATE TYPE "AiEvaluationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
  END IF;
END $$;

ALTER TABLE "AiProposalAudit"
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER;

CREATE TABLE IF NOT EXISTS "AiPromptReplay" (
  "id" TEXT NOT NULL,
  "sourceAuditId" TEXT NOT NULL,
  "areaConfigId" TEXT,
  "createdById" TEXT NOT NULL,
  "initialContextOverride" TEXT,
  "responseFormatOverride" TEXT,
  "status" TEXT NOT NULL,
  "input" JSONB,
  "output" JSONB,
  "errorMessage" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "totalTokens" INTEGER,
  "durationMs" INTEGER,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiPromptReplay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiReplayFeedback" (
  "id" TEXT NOT NULL,
  "replayId" TEXT NOT NULL,
  "chosenSide" TEXT NOT NULL,
  "relevanceArea" INTEGER,
  "planConcreteness" INTEGER,
  "questionRelevance" INTEGER,
  "tone" INTEGER,
  "overall" INTEGER,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiReplayFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiGoldenContext" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "areaId" TEXT NOT NULL,
  "contextJson" JSONB NOT NULL,
  "athleteLevel" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiGoldenContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiEvaluationRun" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "AiEvaluationRunStatus" NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "goldenContextIds" TEXT[],
  "initialContextVariants" JSONB NOT NULL,
  "responseFormatVariants" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  CONSTRAINT "AiEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiEvaluationResult" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "goldenContextId" TEXT NOT NULL,
  "areaConfigId" TEXT,
  "variantLabel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'unknown',
  "model" TEXT NOT NULL DEFAULT 'unknown',
  "input" JSONB,
  "output" JSONB,
  "errorMessage" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "totalTokens" INTEGER,
  "durationMs" INTEGER,
  "correlationId" TEXT,
  "relevanceArea" INTEGER,
  "planConcreteness" INTEGER,
  "questionRelevance" INTEGER,
  "tone" INTEGER,
  "overall" INTEGER,
  "notes" TEXT,
  "ratedById" TEXT,
  "ratedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiEvaluationResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiPromptReplay_sourceAuditId_idx" ON "AiPromptReplay"("sourceAuditId");
CREATE INDEX IF NOT EXISTS "AiPromptReplay_createdById_createdAt_idx" ON "AiPromptReplay"("createdById", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AiReplayFeedback_replayId_key" ON "AiReplayFeedback"("replayId");
CREATE UNIQUE INDEX IF NOT EXISTS "AiGoldenContext_label_key" ON "AiGoldenContext"("label");
CREATE INDEX IF NOT EXISTS "AiGoldenContext_areaId_idx" ON "AiGoldenContext"("areaId");
CREATE INDEX IF NOT EXISTS "AiEvaluationRun_createdById_createdAt_idx" ON "AiEvaluationRun"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "AiEvaluationResult_runId_idx" ON "AiEvaluationResult"("runId");
CREATE INDEX IF NOT EXISTS "AiEvaluationResult_goldenContextId_idx" ON "AiEvaluationResult"("goldenContextId");
CREATE INDEX IF NOT EXISTS "AiProposalAudit_createdAt_idx" ON "AiProposalAudit"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiPromptReplay_sourceAuditId_fkey') THEN
    ALTER TABLE "AiPromptReplay" ADD CONSTRAINT "AiPromptReplay_sourceAuditId_fkey" FOREIGN KEY ("sourceAuditId") REFERENCES "AiProposalAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiPromptReplay_areaConfigId_fkey') THEN
    ALTER TABLE "AiPromptReplay" ADD CONSTRAINT "AiPromptReplay_areaConfigId_fkey" FOREIGN KEY ("areaConfigId") REFERENCES "AiAreaGenerationConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiPromptReplay_createdById_fkey') THEN
    ALTER TABLE "AiPromptReplay" ADD CONSTRAINT "AiPromptReplay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiReplayFeedback_replayId_fkey') THEN
    ALTER TABLE "AiReplayFeedback" ADD CONSTRAINT "AiReplayFeedback_replayId_fkey" FOREIGN KEY ("replayId") REFERENCES "AiPromptReplay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiReplayFeedback_createdById_fkey') THEN
    ALTER TABLE "AiReplayFeedback" ADD CONSTRAINT "AiReplayFeedback_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiGoldenContext_areaId_fkey') THEN
    ALTER TABLE "AiGoldenContext" ADD CONSTRAINT "AiGoldenContext_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiGoldenContext_createdById_fkey') THEN
    ALTER TABLE "AiGoldenContext" ADD CONSTRAINT "AiGoldenContext_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiEvaluationRun_createdById_fkey') THEN
    ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiEvaluationResult_runId_fkey') THEN
    ALTER TABLE "AiEvaluationResult" ADD CONSTRAINT "AiEvaluationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiEvaluationResult_goldenContextId_fkey') THEN
    ALTER TABLE "AiEvaluationResult" ADD CONSTRAINT "AiEvaluationResult_goldenContextId_fkey" FOREIGN KEY ("goldenContextId") REFERENCES "AiGoldenContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiEvaluationResult_areaConfigId_fkey') THEN
    ALTER TABLE "AiEvaluationResult" ADD CONSTRAINT "AiEvaluationResult_areaConfigId_fkey" FOREIGN KEY ("areaConfigId") REFERENCES "AiAreaGenerationConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiEvaluationResult_ratedById_fkey') THEN
    ALTER TABLE "AiEvaluationResult" ADD CONSTRAINT "AiEvaluationResult_ratedById_fkey" FOREIGN KEY ("ratedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
