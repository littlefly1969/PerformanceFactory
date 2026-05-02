CREATE TABLE IF NOT EXISTS "AiProposalAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planReleaseId" TEXT,
  "questionSetId" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "promptHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "inputJson" JSONB NOT NULL,
  "outputJson" JSONB,
  "errorMessage" TEXT,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiProposalAudit_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiProposalAudit_userId_fkey'
  ) THEN
    ALTER TABLE "AiProposalAudit"
      ADD CONSTRAINT "AiProposalAudit_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiProposalAudit_planReleaseId_fkey'
  ) THEN
    ALTER TABLE "AiProposalAudit"
      ADD CONSTRAINT "AiProposalAudit_planReleaseId_fkey"
      FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiProposalAudit_questionSetId_fkey'
  ) THEN
    ALTER TABLE "AiProposalAudit"
      ADD CONSTRAINT "AiProposalAudit_questionSetId_fkey"
      FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AiProposalAudit_userId_createdAt_idx"
  ON "AiProposalAudit"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "AiProposalAudit_planReleaseId_idx"
  ON "AiProposalAudit"("planReleaseId");

CREATE INDEX IF NOT EXISTS "AiProposalAudit_questionSetId_idx"
  ON "AiProposalAudit"("questionSetId");

CREATE INDEX IF NOT EXISTS "AiProposalAudit_provider_model_createdAt_idx"
  ON "AiProposalAudit"("provider", "model", "createdAt");
