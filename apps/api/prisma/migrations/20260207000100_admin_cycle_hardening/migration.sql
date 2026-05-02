-- Admin cycle control hardening (apply after v2_domain_realignment).

DO $$ BEGIN
  CREATE TYPE "CycleStatus" AS ENUM ('PROPOSED','WAITING_APPROVALS','READY_TO_PUBLISH','PUBLISHED','CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ImprovementPlanRelease"
  ADD COLUMN IF NOT EXISTS "cycleStatus" "CycleStatus" NOT NULL DEFAULT 'PROPOSED',
  ADD COLUMN IF NOT EXISTS "publishedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "proposedByAdminId" TEXT;

ALTER TABLE "AiContextSummary"
  ADD COLUMN IF NOT EXISTS "cycleStatus" "CycleStatus" NOT NULL DEFAULT 'PROPOSED',
  ADD COLUMN IF NOT EXISTS "planReleaseId" TEXT;

CREATE TABLE IF NOT EXISTS "CycleAuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planReleaseId" TEXT,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CycleAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CycleAuditLog_userId_createdAt_idx"
  ON "CycleAuditLog"("userId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImprovementPlanRelease_publishedByAdminId_fkey') THEN
    ALTER TABLE "ImprovementPlanRelease"
      ADD CONSTRAINT "ImprovementPlanRelease_publishedByAdminId_fkey"
      FOREIGN KEY ("publishedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImprovementPlanRelease_proposedByAdminId_fkey') THEN
    ALTER TABLE "ImprovementPlanRelease"
      ADD CONSTRAINT "ImprovementPlanRelease_proposedByAdminId_fkey"
      FOREIGN KEY ("proposedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiContextSummary_planReleaseId_fkey') THEN
    ALTER TABLE "AiContextSummary"
      ADD CONSTRAINT "AiContextSummary_planReleaseId_fkey"
      FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CycleAuditLog_userId_fkey') THEN
    ALTER TABLE "CycleAuditLog"
      ADD CONSTRAINT "CycleAuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CycleAuditLog_planReleaseId_fkey') THEN
    ALTER TABLE "CycleAuditLog"
      ADD CONSTRAINT "CycleAuditLog_planReleaseId_fkey"
      FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CycleAuditLog_actorId_fkey') THEN
    ALTER TABLE "CycleAuditLog"
      ADD CONSTRAINT "CycleAuditLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
